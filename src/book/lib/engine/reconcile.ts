/**
 * V2 ORDER LIFECYCLE & MULTI-MONTH RECONCILIATION (spec Part 4).
 *
 * An order's financial truth = SUM over ALL its payment events across every
 * uploaded month (append-only). Classification re-runs on each upload using
 * the LATEST live status + cumulative settlement, so an order can change
 * class across months (Delivered in April → Return event in May ⇒ RETURN).
 *
 * Pure functions only — the DB layer just persists what these return.
 */
import { OrderClass, OrderRow, PaymentRow } from "./types";

/** A payment event as stored (one row in payment_events). */
export interface PaymentEvent {
  subOrderNo: string;
  transactionId: string; // Transaction ID — duplicate-detection key
  orderDate?: string; // the order's date as reported in the payment file
  eventDate: string; // ISO — when the event was recorded
  paymentDate: string;
  liveOrderStatus: string | null; // null is meaningful (Classes F/G)
  finalSettlement: number;
  tcs: number;
  tds: number;
  claims: number;
  compensation: number;
  recovery: number;
  sourceFile: string;
  monthBucket: string; // 'YYYY-MM' of the upload
}

/**
 * Canonical Sub Order No for matching (F4). String only — never numeric (these
 * are 18-digit IDs that lose precision as numbers). Trim whitespace; PRESERVE
 * the `_1` / `_2` line-item suffix exactly (it distinguishes lines of an order).
 */
export function normalizeSubOrderNo(raw: unknown): string {
  return String(raw ?? "").trim();
}

export type LifecycleStatus =
  | "AWAITING_PAYMENT"
  | "PARTIALLY_SETTLED"
  | "SETTLED"
  | "DISPUTED";

export interface ReconciledOrder {
  subOrderNo: string;
  order: OrderRow | null;
  events: PaymentEvent[];
  cumulativeSettlement: number;
  currentClass: OrderClass;
  lifecycleStatus: LifecycleStatus;
  lastEventAt: string | null;
  totalTcs: number;
  totalTds: number;
}

export interface ReconcileOptions {
  /** SETTLED after this many days with no new events (spec default 60). */
  settleAfterDays?: number;
  /** "now" for age computations — injectable for tests. */
  now?: Date;
  /** Sub Order Nos manually flagged disputed (sticky until cleared). */
  disputed?: Set<string>;
}

/** Map a parsed payment-file row to an append-only event. */
export function paymentRowToEvent(
  row: PaymentRow,
  monthBucket: string,
  sourceFile: string
): PaymentEvent {
  return {
    subOrderNo: normalizeSubOrderNo(row.subOrderNo),
    transactionId: row.transactionId,
    orderDate: row.orderDate,
    eventDate: row.paymentDate || row.orderDate || "",
    paymentDate: row.paymentDate,
    liveOrderStatus: row.liveOrderStatus,
    finalSettlement: row.finalSettlement,
    tcs: row.tcs,
    tds: row.tds,
    claims: row.claims,
    compensation: row.compensation,
    recovery: row.recovery,
    sourceFile,
    monthBucket,
  };
}

/**
 * Idempotent re-uploads — dedupe a settlement LINE.
 *
 * Real Meesho exports use one Transaction ID per *payout batch*, shared across
 * hundreds of orders, so the Transaction ID alone is NOT a line key. The
 * unique key for one settlement line is Sub Order No + Transaction ID + amount
 * + status:
 *   • re-importing the same file ⇒ identical lines ⇒ skipped
 *   • a later payout (a different Transaction ID) for the same order ⇒ a new,
 *     distinct line ⇒ kept (even if the amount happens to match)
 * Month bucket is intentionally excluded so the same line re-uploaded in a
 * different month's file still dedupes.
 */
export function eventDedupeKey(e: PaymentEvent): string {
  return [
    e.subOrderNo,
    (e.transactionId ?? "").trim(),
    e.finalSettlement.toFixed(2),
    e.liveOrderStatus ?? "",
  ].join("|");
}

const STATUS_RANK: Record<string, number> = {
  delivered: 4, return: 3, rto: 2, exchange: 2, shipped: 1,
};

/** Chronological order; ties broken by status significance. */
export function sortEvents(events: PaymentEvent[]): PaymentEvent[] {
  return [...events].sort((a, b) => {
    const am = a.monthBucket.localeCompare(b.monthBucket);
    if (am !== 0) return am;
    const ad = (a.paymentDate || a.eventDate).localeCompare(b.paymentDate || b.eventDate);
    if (ad !== 0) return ad;
    const ar = STATUS_RANK[a.liveOrderStatus?.toLowerCase() ?? ""] ?? 0;
    const br = STATUS_RANK[b.liveOrderStatus?.toLowerCase() ?? ""] ?? 0;
    return ar - br;
  });
}

/** Latest non-null live status across all events (chronologically last wins). */
export function latestStatus(events: PaymentEvent[]): string | null {
  const sorted = sortEvents(events);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].liveOrderStatus !== null) return sorted[i].liveOrderStatus;
  }
  return null;
}

export function cumulativeSettlement(events: PaymentEvent[]): number {
  return events.reduce((s, e) => s + e.finalSettlement, 0);
}

/**
 * Re-classify with the MVP 8-class engine, fed a synthesized single payment
 * row carrying the LATEST status + CUMULATIVE settlement. This preserves all
 * MVP trigger semantics (blank−ve ⇒ platform fee, blank+ve ⇒ claim,
 * shipped+ve ⇒ delivered, …) while honoring cross-month reclassification.
 */
const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** A payment event is an affiliate/platform fee when status is blank & amount < 0. */
export function isAffiliateFeeEvent(e: PaymentEvent): boolean {
  return e.liveOrderStatus === null && e.finalSettlement < 0;
}
/** A payment event is a claim/compensation when status is blank & amount > 0. */
export function isClaimEvent(e: PaymentEvent): boolean {
  return e.liveOrderStatus === null && e.finalSettlement > 0;
}
/** Sum of affiliate-fee deductions (positive number) across events. */
export function affiliateFeeTotal(events: PaymentEvent[]): number {
  return events.filter(isAffiliateFeeEvent).reduce((s, e) => s + -e.finalSettlement, 0);
}

/**
 * V4 reconciliation classifier — PAYMENT TRUTH WINS.
 *
 * The order-file reason is only a hint. The final class is decided by the
 * payment file's status events + settlement. Order-file reason resolves
 * CANCELLED/LOST intent and provides a fallback when payment is silent.
 *
 * Event partitions:
 *  - status events: rows with a real Live Order Status (delivered/return/rto/
 *    shipped/exchange) — these drive the class.
 *  - blank+positive: claim / compensation income.
 *  - blank+negative: affiliate/platform fee deduction (never a status).
 */
export function classifyReconciled(
  order: OrderRow | null,
  events: PaymentEvent[]
): OrderClass {
  const reason = (order?.reason ?? "").toUpperCase();
  const net = cumulativeSettlement(events);

  const statusEvents = events.filter((e) => e.liveOrderStatus !== null);
  const blankPos = events.filter(isClaimEvent);
  const hasDeliveredLeg = statusEvents.some((e) =>
    ["delivered", "shipped"].includes(lc(e.liveOrderStatus))
  );

  // ── Payment-only record (no order row): not a real order. ─────────
  if (!order) {
    if (blankPos.length > 0 && statusEvents.length === 0) return "CLAIM";
    if (events.length > 0 && net < 0) return "PLATFORM_FEE"; // affiliate/unacknowledged
    if (events.length > 0 && net > 0) return "CLAIM";
    return "UNKNOWN";
  }

  // ── Order-backed record. ──────────────────────────────────────────

  // Cancelled: order-file says cancelled and no real sale settlement landed.
  if (reason === "CANCELLED" && !hasDeliveredLeg && net <= 0) return "CANCELLED";

  // Lost: compensation/claim expected (order-file intent is authoritative here).
  if (reason === "LOST") return "LOST";

  // Claim: a blank-positive compensation with no normal delivered sale leg —
  // covers both "return-then-positive" and "pure blank-positive" patterns.
  if (blankPos.length > 0 && !hasDeliveredLeg) return "CLAIM";

  // The order's FINAL outcome is decided by the LATEST-DATED payment status —
  // an earlier Exchange leg never overrides a later Return.
  const hasExchangeStatus = statusEvents.some((e) => lc(e.liveOrderStatus) === "exchange");
  const hasReturnLeg = statusEvents.some((e) => lc(e.liveOrderStatus) === "return");
  const finalStatus = lc(latestStatus(statusEvents));
  const hadExchangeLeg =
    hasExchangeStatus || reason === "DOOR_STEP_EXCHANGED" || Boolean(order.hadExchangeLeg);

  // Exchange-then-return: the order had a door-step exchange and its latest
  // status is Return ⇒ the replacement was returned too. Final class = RETURN
  // (post-exchange). The "two physical units back" handling keys off
  // isExchangeThenReturn(), which sees the same exchange signal.
  if (hadExchangeLeg && finalStatus === "return") return "RETURN";

  // Exchange as the FINAL outcome (replacement kept/delivered, not returned), OR
  // (for an exchange-reason order) the classic Return-leg-then-Delivered pattern.
  if (hasExchangeStatus) return "EXCHANGE";
  if (reason === "DOOR_STEP_EXCHANGED" && hasReturnLeg && hasDeliveredLeg) return "EXCHANGE";

  // Payment-confirmed status wins (latest real status; fee/claim rows ignored).
  if (finalStatus === "delivered") return "DELIVERED";
  // Shipped: the payout sign decides. A positive net settlement means the sale
  // landed ⇒ Delivered (data lag — payment posted before the status flipped). A
  // negative net means a return charge went out ⇒ economically a Return.
  if (finalStatus === "shipped") return net < 0 ? "RETURN" : "DELIVERED";
  if (finalStatus === "return") return "RETURN";
  if (finalStatus === "rto") return "RTO";

  // No confirming payment status → fall back to order-file intent.
  if (reason === "RTO_COMPLETE") return "RTO";
  // DOOR_STEP_EXCHANGED / DELIVERED with no confirming payment = forward leg
  // delivered, awaiting settlement → DELIVERED (NOT a completed exchange).
  return "DELIVERED";
}

/** The three QC-queue return types a returned unit can open. */
export type QcReturnType = "RTO" | "CUSTOMER_RETURN" | "EXCHANGE_RETURN";

/**
 * Exchange-then-return lifecycle (V4 §QC) — the order went
 *   Delivered → Exchange → Return.
 * The customer was delivered the original unit, asked for a door-step exchange,
 * then ALSO returned the exchanged replacement — so BOTH physical units come
 * back and each needs its own QC pass. Detected when the order carries an
 * exchange leg (a literal "exchange" status, or a DOOR_STEP_EXCHANGED reason)
 * AND its latest real payment status is a Return. A normal completed exchange
 * ends on a Delivered replacement leg, so its latest status is "delivered" and
 * this returns false.
 */
export function isExchangeThenReturn(
  order: OrderRow | null,
  events: PaymentEvent[]
): boolean {
  const statusEvents = events.filter((e) => e.liveOrderStatus !== null);
  const hasExchangeLeg =
    statusEvents.some((e) => lc(e.liveOrderStatus) === "exchange") ||
    lc(order?.reason) === "door_step_exchanged" ||
    Boolean(order?.hadExchangeLeg); // survives a DELIVERED+DOOR_STEP_EXCHANGED merge
  if (!hasExchangeLeg) return false;
  return lc(latestStatus(statusEvents)) === "return";
}

/**
 * QC return entries an order generates (V4 §QC). Most returned orders yield a
 * single entry; an exchange-then-return lifecycle yields TWO — the original
 * customer return plus the returned exchange replacement — so each physical
 * unit gets its own QC pass and its own inventory/loss calculation.
 */
export function qcReturnTypesFor(
  order: OrderRow | null,
  events: PaymentEvent[]
): QcReturnType[] {
  if (isExchangeThenReturn(order, events)) {
    // Return 1: the original delivered order came back.
    // Return 2: the shipped exchange replacement also came back.
    return ["CUSTOMER_RETURN", "EXCHANGE_RETURN"];
  }
  switch (classifyReconciled(order, events)) {
    case "RTO":
      return ["RTO"];
    case "RETURN":
      return ["CUSTOMER_RETURN"];
    case "EXCHANGE":
      return ["EXCHANGE_RETURN"];
    default:
      return [];
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lifecycle state machine (spec Part 4):
 *  AWAITING_PAYMENT — order exists, no events (cancelled orders skip straight
 *                     to SETTLED: no payment is ever expected)
 *  PARTIALLY_SETTLED — events exist but recent activity, or expected events
 *                      missing (delivered with settlement ≤ 0)
 *  SETTLED — payment received and quiet for settleAfterDays
 *  DISPUTED — manual/anomaly flag, sticky
 */
export function lifecycleOf(
  order: OrderRow | null,
  events: PaymentEvent[],
  currentClass: OrderClass,
  opts: ReconcileOptions = {}
): LifecycleStatus {
  const { settleAfterDays = 60, now = new Date(), disputed } = opts;
  const subOrderNo = order?.subOrderNo ?? events[0]?.subOrderNo ?? "";
  if (disputed?.has(subOrderNo)) return "DISPUTED";

  if (currentClass === "CANCELLED") return "SETTLED"; // nothing owed
  if (events.length === 0) return "AWAITING_PAYMENT";

  const cumulative = cumulativeSettlement(events);
  // delivered-type classes expect money in; zero/negative means missing events
  const expectsPayment =
    currentClass === "DELIVERED" || currentClass === "EXCHANGE" ||
    currentClass === "LOST" || currentClass === "CLAIM";
  if (expectsPayment && cumulative <= 0) return "PARTIALLY_SETTLED";

  const last = sortEvents(events)[events.length - 1];
  const lastDate =
    parseDate(last.paymentDate) ?? parseDate(last.eventDate) ??
    parseDate(`${last.monthBucket}-28`);
  if (lastDate && daysBetween(lastDate, now) >= settleAfterDays) return "SETTLED";
  return "PARTIALLY_SETTLED";
}

export function reconcileOrder(
  order: OrderRow | null,
  events: PaymentEvent[],
  opts: ReconcileOptions = {}
): ReconciledOrder {
  const currentClass = classifyReconciled(order, events);
  const sorted = sortEvents(events);
  return {
    subOrderNo: order?.subOrderNo ?? events[0]?.subOrderNo ?? "",
    order,
    events: sorted,
    cumulativeSettlement: cumulativeSettlement(events),
    currentClass,
    lifecycleStatus: lifecycleOf(order, events, currentClass, opts),
    lastEventAt: sorted.length
      ? sorted[sorted.length - 1].paymentDate || sorted[sorted.length - 1].eventDate || null
      : null,
    totalTcs: events.reduce((s, e) => s + e.tcs, 0),
    totalTds: events.reduce((s, e) => s + e.tds, 0),
  };
}

// ── Upload application (the "what changed" computation) ─────────────

export interface UploadResult {
  /** Events that are genuinely new (not present under the dedupe key). */
  newEvents: PaymentEvent[];
  duplicatesSkipped: number;
  affectedSubOrderNos: string[];
  summary: {
    ordersUpdated: number;
    newSettlements: number; // new events with settlement ≠ 0
    totalReceived: number; // sum of new positive settlements
    reclassified: { subOrderNo: string; from: OrderClass; to: OrderClass }[];
  };
}

/**
 * Apply a freshly parsed payment file against existing state. Pure: returns
 * what to insert and what changed; caller persists.
 */
export function applyPaymentUpload(
  orders: Map<string, OrderRow>,
  existingEvents: PaymentEvent[],
  incoming: PaymentEvent[]
): UploadResult {
  const seen = new Set(existingEvents.map(eventDedupeKey));
  const newEvents: PaymentEvent[] = [];
  let duplicatesSkipped = 0;
  for (const e of incoming) {
    const key = eventDedupeKey(e);
    if (seen.has(key)) { duplicatesSkipped++; continue; }
    seen.add(key);
    newEvents.push(e);
  }

  const affected = Array.from(new Set(newEvents.map((e) => e.subOrderNo)));
  const byOrder = new Map<string, PaymentEvent[]>();
  for (const e of [...existingEvents, ...newEvents]) {
    const list = byOrder.get(e.subOrderNo) ?? [];
    list.push(e);
    byOrder.set(e.subOrderNo, list);
  }

  const reclassified: UploadResult["summary"]["reclassified"] = [];
  for (const subOrderNo of affected) {
    const order = orders.get(subOrderNo) ?? null;
    const all = byOrder.get(subOrderNo) ?? [];
    const before = all.filter((e) => !newEvents.includes(e));
    const fromClass = before.length || order
      ? classifyReconciled(order, before)
      : null;
    const toClass = classifyReconciled(order, all);
    if (fromClass !== null && fromClass !== toClass) {
      reclassified.push({ subOrderNo, from: fromClass, to: toClass });
    }
  }

  return {
    newEvents,
    duplicatesSkipped,
    affectedSubOrderNos: affected,
    summary: {
      ordersUpdated: affected.length,
      newSettlements: newEvents.filter((e) => e.finalSettlement !== 0).length,
      totalReceived: newEvents
        .filter((e) => e.finalSettlement > 0)
        .reduce((s, e) => s + e.finalSettlement, 0),
      reclassified,
    },
  };
}

// ── Order timeline (per-order detail page) ──────────────────────────

export interface TimelineEntry {
  date: string;
  label: string;
  amount: number | null; // null for non-financial milestones
  runningTotal: number | null;
  sourceFile: string | null;
}

function eventLabel(e: PaymentEvent): string {
  if (e.liveOrderStatus === null) {
    if (e.claims > 0 || (e.finalSettlement > 0 && e.compensation > 0)) return "Claim/compensation received";
    return e.finalSettlement < 0 ? "Affiliate/platform fee deducted" : "Adjustment received";
  }
  const s = e.liveOrderStatus.toLowerCase();
  if (s === "delivered") return e.finalSettlement >= 0 ? "Settlement received" : "Deduction on delivered order";
  if (s === "return") return "Return charge";
  if (s === "rto") return "RTO event";
  if (s === "shipped") return "Settlement (in transit)";
  return `Payment event (${e.liveOrderStatus})`;
}

export function buildTimeline(
  order: OrderRow | null,
  events: PaymentEvent[]
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  if (order?.orderDate) {
    out.push({ date: order.orderDate, label: "Ordered", amount: null, runningTotal: null, sourceFile: null });
    if (order.reason && order.reason !== "CANCELLED") {
      out.push({ date: order.orderDate, label: "Shipped", amount: null, runningTotal: null, sourceFile: null });
    }
    if (order.reason === "CANCELLED") {
      out.push({ date: order.orderDate, label: "Cancelled", amount: null, runningTotal: null, sourceFile: null });
    }
  }
  let running = 0;
  for (const e of sortEvents(events)) {
    running += e.finalSettlement;
    out.push({
      date: e.paymentDate || e.eventDate || `${e.monthBucket}-01`,
      label: eventLabel(e),
      amount: e.finalSettlement,
      runningTotal: running,
      sourceFile: e.sourceFile || null,
    });
  }
  return out;
}

// ── Open settlements (money Meesho still owes) ──────────────────────

export interface OpenSettlementRow {
  subOrderNo: string;
  orderDate: string;
  sku: string;
  currentClass: OrderClass;
  lifecycleStatus: LifecycleStatus;
  daysOutstanding: number;
  expected: number; // reference: discounted price for payment-expecting classes
  received: number;
}

export function openSettlements(
  reconciled: ReconciledOrder[],
  now: Date = new Date()
): { rows: OpenSettlementRow[]; totalPending: number } {
  const rows: OpenSettlementRow[] = [];
  for (const r of reconciled) {
    if (r.lifecycleStatus === "SETTLED") continue;
    if (r.currentClass === "PLATFORM_FEE") continue; // not an order
    const orderDate = parseDate(r.order?.orderDate ?? null);
    const expectsPayment =
      r.currentClass === "DELIVERED" || r.currentClass === "EXCHANGE" ||
      r.currentClass === "LOST" || r.currentClass === "CLAIM" ||
      r.lifecycleStatus === "AWAITING_PAYMENT";
    if (!expectsPayment) continue;
    const expected = r.order?.discountedPrice ?? 0;
    rows.push({
      subOrderNo: r.subOrderNo,
      orderDate: r.order?.orderDate ?? "",
      sku: r.order?.sku ?? "",
      currentClass: r.currentClass,
      lifecycleStatus: r.lifecycleStatus,
      daysOutstanding: orderDate ? daysBetween(orderDate, now) : 0,
      expected,
      received: r.cumulativeSettlement,
    });
  }
  rows.sort((a, b) => b.daysOutstanding - a.daysOutstanding);
  const totalPending = rows.reduce(
    (s, r) => s + Math.max(0, r.expected - Math.max(0, r.received)),
    0
  );
  return { rows, totalPending };
}

// ── Dual-view P&L bucketing (accrual vs cash) ───────────────────────

export type PnlView = "accrual" | "cash";

function monthOfDate(s: string): string | null {
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = parseDate(s);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;
}

/**
 * Accrual: orders whose ORDER DATE falls in `month`, valued at cumulative
 * settlement across all months. Cash: settlements whose PAYMENT DATE falls
 * in `month`, regardless of order age.
 */
export function settlementForMonth(
  reconciled: ReconciledOrder[],
  month: string,
  view: PnlView
): { subOrderNos: string[]; total: number } {
  if (view === "accrual") {
    const rows = reconciled.filter(
      (r) => r.order?.orderDate && monthOfDate(r.order.orderDate) === month
    );
    return {
      subOrderNos: rows.map((r) => r.subOrderNo),
      total: rows.reduce((s, r) => s + r.cumulativeSettlement, 0),
    };
  }
  const ids = new Set<string>();
  let total = 0;
  for (const r of reconciled) {
    for (const e of r.events) {
      const m = monthOfDate(e.paymentDate || "") ?? e.monthBucket;
      if (m === month) {
        ids.add(r.subOrderNo);
        total += e.finalSettlement;
      }
    }
  }
  return { subOrderNos: Array.from(ids), total };
}
