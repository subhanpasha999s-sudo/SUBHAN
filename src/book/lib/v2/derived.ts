/**
 * Pure selectors over V2State — everything screens display is derived here
 * from the engine. No mutation; safe to call in render with useMemo.
 */
import {
  COA,
  GstMonthlySummary,
  PnlView,
  ReconciledOrder,
  buildSkuMap,
  gstMonthlySummary,
  isAffiliateFeeEvent,
  isExchangeThenReturn,
  normalizeSubOrderNo,
  openSettlements,
  reconcileOrder,
  resolveSku,
  settlementForMonth,
  stockIntelligence,
  suggestMapping,
  trueNetProfit,
  unmappedListingSkus,
  formatINR,
} from "@/book/lib/engine";
import { V2State } from "./types";

// ── Memoization layer ───────────────────────────────────────────────
//
// V2State is immutable — every mutation replaces it wholesale — so caching by
// state *reference* is safe and self-invalidating. A single dashboard/P&L
// render fans out into dozens of calls to these heavy passes (reconcileAll runs
// once per month in the sparkline alone); the cache collapses them to one
// computation. Keyed by state + day-of(now): the only `now` sensitivity is the
// 60-day settle threshold, so same-day calls (i.e. one render) share a result,
// while tests passing an explicit far-future `now` still recompute.
const dayKey = (now: Date) => String(Math.floor(now.getTime() / 86_400_000));

const reconcileCache = new WeakMap<V2State, { key: string; result: ReconciledOrder[] }>();
const reconStateCache = new WeakMap<V2State, { key: string; result: ReconciliationState }>();
const stockIntelCache = new WeakMap<V2State, { key: string; result: ReturnType<typeof stockIntelligence> }>();
const unmappedTrayCache = new WeakMap<V2State, UnmappedSku[]>();
const skuMapCache = new WeakMap<object, ReturnType<typeof buildSkuMap>>();

/** Cached listing→inventory SKU map (rebuilt only when the mapping array changes). */
function skuMapOf(state: V2State) {
  let m = skuMapCache.get(state.skuMap);
  if (!m) { m = buildSkuMap(state.skuMap); skuMapCache.set(state.skuMap, m); }
  return m;
}

/** Cached stock-intelligence pass (the ledger scan is reused across dashboard cards). */
export function stockIntel(state: V2State, now = new Date()) {
  const key = dayKey(now);
  const c = stockIntelCache.get(state);
  if (c && c.key === key) return c.result;
  const result = stockIntelligence(
    state.skus.map((s) => ({ skuCode: s.skuCode, productName: s.productName, currentCogs: s.currentCogs, reorderLevel: s.reorderLevel })),
    state.ledger,
    now
  );
  stockIntelCache.set(state, { key, result });
  return result;
}

// ── V3: SKU mapping selectors ───────────────────────────────────────

export interface UnmappedSku {
  listingSku: string;
  productName: string;
  orderCount: number;
  suggestion: { skuCode: string; score: number } | null;
}

/** Listing SKUs seen in orders with no mapping yet → the tray. */
export function unmappedTray(state: V2State): UnmappedSku[] {
  const cached = unmappedTrayCache.get(state);
  if (cached) return cached;

  const map = skuMapOf(state);
  const listing: string[] = [];
  const meta = new Map<string, { productName: string; orderCount: number }>();
  for (const order of state.orders) {
    listing.push(order.sku);
    const existing = meta.get(order.sku);
    if (existing) {
      existing.orderCount++;
    } else {
      meta.set(order.sku, { productName: order.productName ?? "", orderCount: 1 });
    }
  }
  const unmapped = unmappedListingSkus(listing, map);
  const invForSuggest = state.skus.map((s) => ({ skuCode: s.skuCode, productName: s.productName }));
  const result = unmapped.map((listingSku) => {
    const info = meta.get(listingSku);
    return {
      listingSku,
      productName: info?.productName ?? "",
      orderCount: info?.orderCount ?? 0,
      suggestion: suggestMapping(listingSku, invForSuggest),
    };
  }).sort((a, b) => b.orderCount - a.orderCount);
  unmappedTrayCache.set(state, result);
  return result;
}

/** Resolve an order's listing SKU to its primary inventory SKU (for display). */
export function resolvedInventorySku(state: V2State, listingSku: string): string | null {
  const r = resolveSku(listingSku, skuMapOf(state));
  return r.mapped ? r.components[0]?.inventorySku ?? null : null;
}

// ── Reconciliation over the whole org ───────────────────────────────

export function reconcileAll(state: V2State, now = new Date()): ReconciledOrder[] {
  const cacheKey = `${state.org.settleAfterDays}|${dayKey(now)}`;
  const cached = reconcileCache.get(state);
  if (cached && cached.key === cacheKey) return cached.result;

  const byOrder = new Map<string, typeof state.events>();
  for (const e of state.events) {
    const list = byOrder.get(e.subOrderNo) ?? [];
    list.push(e);
    byOrder.set(e.subOrderNo, list);
  }
  const disputed = new Set(state.disputed);
  const opts = { settleAfterDays: state.org.settleAfterDays, now, disputed };
  const out: ReconciledOrder[] = [];
  const seen = new Set<string>();
  for (const o of state.orders) {
    // one reconciled record per unique Sub Order No (defensive: exchange legs
    // are normalized to a single order at ingest, but never double-count here)
    if (seen.has(o.subOrderNo)) continue;
    out.push(reconcileOrder(o, byOrder.get(o.subOrderNo) ?? [], opts));
    seen.add(o.subOrderNo);
  }
  for (const [subOrderNo, events] of byOrder) {
    if (!seen.has(subOrderNo)) out.push(reconcileOrder(null, events, opts));
  }
  reconcileCache.set(state, { key: cacheKey, result: out });
  return out;
}

/**
 * Order Data is the single source of truth for order counts and classes.
 * This returns one reconciled record per order present in Order Data only —
 * payment-only Sub Order Nos (settlements with no matching order row) are
 * NEVER counted as orders. Use this for every order count and the order-wise
 * P&L; payment-only records surface only as "unmatched" in reconciliation.
 */
export function reconciledOrders(state: V2State, now = new Date()): ReconciledOrder[] {
  return reconcileAll(state, now).filter((r) => r.order !== null);
}

export interface OrderStatusCounts {
  total: number;
  paid: number;
  unpaid: number;
  disputed: number;
  delivered: number;
  rto: number;
  customerReturn: number;
  cancelled: number;
  lost: number;
  exchange: number;
  claim: number;
}

/** Dashboard order tiles — all derived from Order Data unique Sub Order Nos. */
export function orderStatusCounts(state: V2State, now = new Date()): OrderStatusCounts {
  const orders = reconciledOrders(state, now);
  const c: OrderStatusCounts = {
    total: orders.length, paid: 0, unpaid: 0, disputed: 0,
    delivered: 0, rto: 0, customerReturn: 0, cancelled: 0, lost: 0, exchange: 0, claim: 0,
  };
  for (const r of orders) {
    const st = settlementStatusOf(r);
    if (st === "PAID") c.paid++;
    else if (st === "UNPAID") c.unpaid++;
    else if (st === "DISPUTED") c.disputed++;
    switch (r.currentClass) {
      case "DELIVERED": c.delivered++; break;
      case "RTO": c.rto++; break;
      case "RETURN": c.customerReturn++; break;
      case "CANCELLED": c.cancelled++; break;
      case "LOST": c.lost++; break;
      case "EXCHANGE": c.exchange++; break;
      case "CLAIM": c.claim++; break;
    }
  }
  return c;
}

// ── V4: financially-correct status buckets (count + net ₹) ─────────

export interface FinancialBucket {
  key: "DELIVERED" | "RTO" | "RETURN" | "CANCELLED" | "LOST" | "EXCHANGE" | "CLAIM";
  label: string;
  count: number;
  net: number; // net ₹ impact (positive = receivable, negative = deduction)
}

const BUCKET_META: { key: FinancialBucket["key"]; label: string }[] = [
  { key: "DELIVERED", label: "Delivered" },
  { key: "EXCHANGE", label: "Exchange" },
  { key: "CLAIM", label: "Claim" },
  { key: "LOST", label: "Lost" },
  { key: "RETURN", label: "Returns (payout negative)" },
  { key: "RTO", label: "RTO" },
  { key: "CANCELLED", label: "Cancelled" },
];

export function financialBuckets(state: V2State, now = new Date()): FinancialBucket[] {
  const orders = reconciledOrders(state, now);
  const map = new Map<string, { count: number; net: number }>();
  for (const r of orders) {
    const k = r.currentClass;
    const cur = map.get(k) ?? { count: 0, net: 0 };
    cur.count++;
    cur.net += r.cumulativeSettlement;
    map.set(k, cur);
  }
  return BUCKET_META.map((m) => ({
    key: m.key, label: m.label,
    count: map.get(m.key)?.count ?? 0,
    net: Math.round((map.get(m.key)?.net ?? 0) * 100) / 100,
  }));
}

// ── V4: Orders overview — KPIs + monthly trend for the Orders module ──

export interface OrdersOverview {
  total: number;
  delivered: number;
  deliveredPct: number;
  returnRatePct: number; // (return + rto) / shipped
  cancelledPct: number;
  netPayout: number; // Σ cumulative settlement across order-backed records
  avgSettleDays: number | null; // order date → first positive settlement
}

export function ordersOverview(state: V2State, now = new Date()): OrdersOverview {
  const orders = reconciledOrders(state, now);
  const total = orders.length;
  const by = (c: string) => orders.filter((r) => r.currentClass === c).length;
  const delivered = by("DELIVERED");
  const cancelled = by("CANCELLED");
  const shipped = total - cancelled;
  const returns = by("RETURN") + by("RTO");
  const netPayout = orders.reduce((s, r) => s + r.cumulativeSettlement, 0);

  const cycles: number[] = [];
  for (const r of orders) {
    if (!r.order?.orderDate) continue;
    const first = r.events.find((e) => e.finalSettlement > 0);
    if (!first?.paymentDate) continue;
    const d = (new Date(first.paymentDate).getTime() - new Date(r.order.orderDate).getTime()) / 86_400_000;
    if (d >= 0 && d < 365) cycles.push(d);
  }
  return {
    total, delivered,
    deliveredPct: total ? (delivered / total) * 100 : 0,
    returnRatePct: shipped ? (returns / shipped) * 100 : 0,
    cancelledPct: total ? (cancelled / total) * 100 : 0,
    netPayout: Math.round(netPayout * 100) / 100,
    avgSettleDays: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null,
  };
}

export interface OrdersMonthPoint { month: string; orders: number; delivered: number; returns: number; net: number }

export function ordersByMonth(state: V2State, now = new Date()): OrdersMonthPoint[] {
  const orders = reconciledOrders(state, now);
  const map = new Map<string, OrdersMonthPoint>();
  for (const r of orders) {
    const m = r.order?.orderDate?.slice(0, 7);
    if (!m) continue;
    const p = map.get(m) ?? { month: m, orders: 0, delivered: 0, returns: 0, net: 0 };
    p.orders++;
    if (r.currentClass === "DELIVERED") p.delivered++;
    if (r.currentClass === "RETURN" || r.currentClass === "RTO") p.returns++;
    p.net += r.cumulativeSettlement;
    map.set(m, p);
  }
  return Array.from(map.values())
    .map((p) => ({ ...p, net: Math.round(p.net * 100) / 100 }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ── V4: Order-Flow funnel — accounts for every order, stage by stage ──

export interface FunnelStage {
  key: string;
  label: string;
  kind: "total" | "subtract" | "result";
  count: number;
  net: number; // net ₹ for this stage's orders (0 for structural stages)
  note?: string;
}

export function orderFlowFunnel(state: V2State, now = new Date()): FunnelStage[] {
  const orders = reconciledOrders(state, now);
  const by = (cls: string) => orders.filter((r) => r.currentClass === cls);
  const sumNet = (rs: ReconciledOrder[]) =>
    Math.round(rs.reduce((s, r) => s + r.cumulativeSettlement, 0) * 100) / 100;

  const total = orders.length;
  const cancelled = by("CANCELLED");
  const rto = by("RTO");
  const ret = by("RETURN");
  const lost = by("LOST");
  const exch = by("EXCHANGE");
  const claim = by("CLAIM");
  const delivered = by("DELIVERED");

  const shipped = total - cancelled.length;
  const reachedCustomer = shipped - rto.length;

  return [
    { key: "total", label: "Total Orders", kind: "total", count: total, net: 0 },
    { key: "CANCELLED", label: "Cancelled", kind: "subtract", count: cancelled.length, net: 0, note: "no shipment · ₹0" },
    { key: "shipped", label: "Shipped", kind: "result", count: shipped, net: 0 },
    { key: "RTO", label: "RTO", kind: "subtract", count: rto.length, net: sumNet(rto), note: "returned pre-delivery · product back" },
    { key: "reached", label: "Reached customer", kind: "result", count: reachedCustomer, net: 0 },
    { key: "RETURN", label: "Customer Return", kind: "subtract", count: ret.length, net: sumNet(ret), note: "returned after delivery · payout negative" },
    { key: "LOST", label: "Lost", kind: "subtract", count: lost.length, net: sumNet(lost), note: "compensation expected" },
    { key: "EXCHANGE", label: "Exchange", kind: "subtract", count: exch.length, net: sumNet(exch), note: "replacement leg" },
    { key: "CLAIM", label: "Claim", kind: "subtract", count: claim.length, net: sumNet(claim), note: "compensation, netted" },
    { key: "DELIVERED", label: "Delivered (net)", kind: "result", count: delivered.length, net: sumNet(delivered) },
  ];
}

// ── V4: unacknowledged payouts (payment rows with no matching order) ──

export interface UnmatchedPayout {
  subOrderNo: string;
  net: number;
  events: number;
  affiliateFee: boolean;
}

export function unmatchedPayouts(state: V2State, now = new Date()): { rows: UnmatchedPayout[]; total: number } {
  void now;
  const { unacknowledged } = reconciliationState(state, now);
  return { rows: unacknowledged.rows, total: unacknowledged.total };
}

// ── F1: SINGLE canonical reconciliation-state model ─────────────────
//
// One owner for matched / awaiting / unacknowledged. Order Data is the source
// of truth for the order set; payments attach by Sub Order No (string,
// whitespace-trimmed, `_1`/`_2` preserved). The order↔payment gap is a
// calendar offset, never "lost data".

export interface AwaitingRow {
  subOrderNo: string;
  orderDate: string;
  currentClass: ReconciledOrder["currentClass"];
  daysWaiting: number;
  stale: boolean; // > 60 days — worth chasing Meesho
}

/** Classes that expect a sale/compensation payment to arrive. RTO/Return/Cancelled don't. */
const PAYMENT_EXPECTING = new Set(["DELIVERED", "EXCHANGE", "CLAIM", "LOST"]);

export interface ReconciliationState {
  matched: number;       // order in a file AND has a payment event
  awaiting: number;      // payment-expecting order in a file, no payment event yet
  closed: number;        // no settlement expected (cancelled/RTO/return with no payment row)
  unacknowledged: {      // payment event whose order file isn't imported
    count: number;
    total: number;       // net ₹ of those payouts
    rows: UnmatchedPayout[];
    byMonth: { month: string; count: number; net: number }[]; // order-date month
  };
  awaitingRows: AwaitingRow[];
  coverage: {
    orderFileMonths: string[];   // order-date months we have orders for
    paymentOrderMonths: string[]; // order-date months the payments reference
    missingOrderMonths: string[]; // payments reference these, no order file
  };
}

export function reconciliationState(state: V2State, now = new Date()): ReconciliationState {
  const cacheKey = `${state.org.settleAfterDays}|${dayKey(now)}`;
  const cached = reconStateCache.get(state);
  if (cached && cached.key === cacheKey) return cached.result;

  const orderSubs = new Set(state.orders.map((o) => normalizeSubOrderNo(o.subOrderNo)));

  // group events by normalized sub order
  const byPaySub = new Map<string, typeof state.events>();
  for (const e of state.events) {
    const k = normalizeSubOrderNo(e.subOrderNo);
    const list = byPaySub.get(k) ?? [];
    list.push(e);
    byPaySub.set(k, list);
  }

  // matched / awaiting / closed are derived from the CLASSIFIED order set.
  // Only payment-expecting classes can be awaiting; RTO/Return/Cancelled with
  // no event are closed because no sale settlement is expected from Meesho.
  const orderBacked = reconciledOrders(state, now);
  let matched = 0;
  let awaiting = 0;
  let closed = 0;
  for (const r of orderBacked) {
    if (r.events.length > 0) { matched++; continue; } // has a settlement record
    if (PAYMENT_EXPECTING.has(r.currentClass)) awaiting++;
    else closed++;
  }

  // unacknowledged payouts — payment subs with no order file
  const unackRows: UnmatchedPayout[] = [];
  const monthAgg = new Map<string, { count: number; net: number }>();
  for (const [subOrderNo, evs] of byPaySub) {
    if (orderSubs.has(subOrderNo)) continue;
    const net = Math.round(evs.reduce((s, e) => s + e.finalSettlement, 0) * 100) / 100;
    unackRows.push({
      subOrderNo, net, events: evs.length,
      affiliateFee: evs.every((e) => e.liveOrderStatus === null && e.finalSettlement < 0),
    });
    const m = (evs.find((e) => e.orderDate)?.orderDate || "").slice(0, 7) || "—";
    const cur = monthAgg.get(m) ?? { count: 0, net: 0 };
    cur.count++; cur.net += net;
    monthAgg.set(m, cur);
  }
  unackRows.sort((a, b) => a.net - b.net);

  // awaiting rows (order-backed, no event, payment expected) with aging
  const awaitingRows: AwaitingRow[] = [];
  for (const r of orderBacked) {
    if (r.events.length > 0) continue;
    if (!PAYMENT_EXPECTING.has(r.currentClass)) continue;
    const d = r.order?.orderDate ? new Date(r.order.orderDate) : null;
    const days = d && !Number.isNaN(d.getTime()) ? Math.floor((now.getTime() - d.getTime()) / 86_400_000) : 0;
    awaitingRows.push({
      subOrderNo: r.subOrderNo, orderDate: r.order?.orderDate ?? "",
      currentClass: r.currentClass, daysWaiting: days, stale: days > 60,
    });
  }
  awaitingRows.sort((a, b) => b.daysWaiting - a.daysWaiting);

  // coverage by month
  const orderFileMonths = Array.from(new Set(
    state.orders.map((o) => o.orderDate?.slice(0, 7)).filter(Boolean) as string[]
  )).sort();
  const paymentOrderMonths = Array.from(new Set(
    state.events.map((e) => (e.orderDate || "").slice(0, 7)).filter(Boolean)
  )).sort();
  const missingOrderMonths = paymentOrderMonths.filter((m) => !orderFileMonths.includes(m));

  const result: ReconciliationState = {
    matched, awaiting, closed,
    unacknowledged: {
      count: unackRows.length,
      total: Math.round(unackRows.reduce((s, r) => s + r.net, 0) * 100) / 100,
      rows: unackRows,
      byMonth: Array.from(monthAgg.entries())
        .map(([month, v]) => ({ month, count: v.count, net: Math.round(v.net * 100) / 100 }))
        .sort((a, b) => b.count - a.count),
    },
    awaitingRows,
    coverage: { orderFileMonths, paymentOrderMonths, missingOrderMonths },
  };
  reconStateCache.set(state, { key: cacheKey, result });
  return result;
}

// ── V4 §5c: Payout Summary — driven purely by payment files ─────────
//
// Independent of orders: shows the raw money movement from the payment files,
// matched or not. Net payout = Σ Final Settlement Amount. Deductions are the
// negative components, broken out by type.

export interface PayoutMonth {
  month: string; // payment month (YYYY-MM)
  credits: number; // Σ positive settlements (sale payouts + comp)
  affiliateFees: number; // |blank-status negative|
  returnDeductions: number; // |negative on return/rto rows|
  otherDeductions: number; // |negative on delivered/exchange rows| (embedded fees)
  ads: number; // Marketplace Ads from the payment file's Ads Cost sheet
  tcs: number;
  tds: number;
  net: number; // Σ all settlements (the actual cash)
  netAfterAds: number; // settlement net − marketplace ads from the same payment month
  rows: number;
}

export interface PayoutOnlySummary {
  months: PayoutMonth[];
  totals: PayoutMonth;
}

const lcS = (s: string | null) => (s ?? "").toLowerCase();

export function payoutOnlySummary(state: V2State): PayoutOnlySummary {
  const byMonth = new Map<string, PayoutMonth>();
  const blank = (m: string): PayoutMonth => ({
    month: m, credits: 0, affiliateFees: 0, returnDeductions: 0, otherDeductions: 0,
    ads: 0, tcs: 0, tds: 0, net: 0, netAfterAds: 0, rows: 0,
  });
  for (const e of state.events) {
    const m = (e.paymentDate || "").slice(0, 7) || e.monthBucket || "—";
    const row = byMonth.get(m) ?? blank(m);
    const status = lcS(e.liveOrderStatus);
    row.rows++;
    row.net += e.finalSettlement;
    row.tcs += e.tcs;
    row.tds += e.tds;
    if (e.finalSettlement > 0) row.credits += e.finalSettlement;
    else if (e.finalSettlement < 0) {
      const d = -e.finalSettlement;
      if (e.liveOrderStatus === null) row.affiliateFees += d;
      else if (status === "return" || status === "rto") row.returnDeductions += d;
      else row.otherDeductions += d;
    }
    byMonth.set(m, row);
  }
  for (const e of state.expenses) {
    if (e.source !== "ADS_AUTO") continue;
    const m = e.sourceKey?.replace("ads:", "") || e.expenseDate.slice(0, 7) || "—";
    const row = byMonth.get(m) ?? blank(m);
    row.ads += e.amount;
    byMonth.set(m, row);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const months = Array.from(byMonth.values())
    .map((r) => ({
      ...r, credits: round(r.credits), affiliateFees: round(r.affiliateFees),
      returnDeductions: round(r.returnDeductions), otherDeductions: round(r.otherDeductions), ads: round(r.ads),
      tcs: round(r.tcs), tds: round(r.tds), net: round(r.net), netAfterAds: round(r.net - r.ads),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const totals = months.reduce((t, r) => ({
    month: "Total", credits: t.credits + r.credits, affiliateFees: t.affiliateFees + r.affiliateFees,
    returnDeductions: t.returnDeductions + r.returnDeductions, otherDeductions: t.otherDeductions + r.otherDeductions,
    ads: t.ads + r.ads, tcs: t.tcs + r.tcs, tds: t.tds + r.tds, net: t.net + r.net,
    netAfterAds: t.netAfterAds + r.netAfterAds, rows: t.rows + r.rows,
  }), blank("Total"));
  return { months, totals: { ...totals, credits: round(totals.credits), affiliateFees: round(totals.affiliateFees), returnDeductions: round(totals.returnDeductions), otherDeductions: round(totals.otherDeductions), ads: round(totals.ads), tcs: round(totals.tcs), tds: round(totals.tds), net: round(totals.net), netAfterAds: round(totals.netAfterAds) } };
}

export function monthsAvailable(state: V2State): string[] {
  const months = new Set<string>();
  for (const o of state.orders) {
    const m = o.orderDate?.slice(0, 7);
    if (m) months.add(m);
  }
  for (const e of state.events) {
    const m = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
    if (m) months.add(m);
  }
  return Array.from(months).sort();
}

// ── V3: settlement status views (spec §3) ──────────────────────────
//
// Only three statuses (no "Partially settled" — we can't reliably tell a
// partial from a complete settlement, so an order is either Paid, Unpaid, or
// Disputed):
//   Paid     — the order has settlement record(s) (payout/deductions posted)
//   Unpaid   — a payment-expecting order (delivered/exchange/claim/lost) with
//              no settlement received yet
//   Disputed — settlement mismatch / claim / reconciliation issue (flagged)

export type SettlementStatus = "PAID" | "UNPAID" | "DISPUTED";

/** Map a reconciled order to a settlement bucket. Payment-only/cancelled → null. */
export function settlementStatusOf(r: ReconciledOrder): SettlementStatus | null {
  if (r.lifecycleStatus === "DISPUTED") return "DISPUTED";
  if (r.currentClass === "CANCELLED" || r.currentClass === "PLATFORM_FEE") return null;
  if (r.events.length > 0) return "PAID"; // settlement record(s) exist
  if (PAYMENT_EXPECTING.has(r.currentClass)) return "UNPAID"; // expected, not yet received
  return null; // RTO / Return with no settlement — no sale payment expected
}

export interface SettlementGroup {
  status: SettlementStatus;
  count: number;
  total: number; // cumulative settlement (₹ received) for the bucket
}

function daysOutstanding(orderDate: string | undefined, now: Date): number {
  if (!orderDate) return 0;
  const d = new Date(orderDate);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

export interface OrderRowView {
  subOrderNo: string;
  orderDate: string;
  inventorySku: string | null;
  listingSku: string;
  productName: string;
  currentClass: ReconciledOrder["currentClass"];
  lifecycleStatus: ReconciledOrder["lifecycleStatus"];
  settlementStatus: SettlementStatus | null;
  cumulativeSettlement: number;
  daysOutstanding: number;
  orderSource: string;
  qty: number;
  unmapped: boolean;
}

export function orderRowViews(state: V2State, now = new Date()): OrderRowView[] {
  const reconciled = reconciledOrders(state, now); // Order Data only
  return reconciled.map((r) => {
    const listingSku = r.order?.sku ?? "";
    const inv = listingSku ? resolvedInventorySku(state, listingSku) : null;
    return {
      subOrderNo: r.subOrderNo,
      orderDate: r.order?.orderDate ?? "",
      inventorySku: inv,
      listingSku,
      productName: r.order?.productName ?? "",
      currentClass: r.currentClass,
      lifecycleStatus: r.lifecycleStatus,
      settlementStatus: settlementStatusOf(r),
      cumulativeSettlement: r.cumulativeSettlement,
      daysOutstanding: daysOutstanding(r.order?.orderDate, now),
      orderSource: r.order?.orderSource ?? "",
      qty: r.order?.quantity ?? 1,
      unmapped: Boolean(listingSku) && inv === null && r.currentClass !== "PLATFORM_FEE",
    };
  });
}

// ── V3: shared per-order Payout & P/L rows (spec §5) ───────────────
//
// All three Payout & P/L pages (order-wise, product-wise, summary) derive
// from this ONE function, so they reconcile by construction for any filter.

export interface PnlFilter {
  fromMonth?: string; // inclusive 'YYYY-MM'
  toMonth?: string; // inclusive
  view: PnlView; // accrual (order date) | cash (payment date)
}

/** Default filter = full available range, accrual. */
export function defaultPnlControls(state: V2State): { fromMonth: string; toMonth: string; view: PnlView } {
  const months = monthsAvailable(state);
  return { fromMonth: months[0] ?? "", toMonth: months[months.length - 1] ?? "", view: "accrual" };
}

export interface OrderPnlRow {
  subOrderNo: string;
  orderDate: string;
  inventorySku: string | null;
  listingSku: string;
  productName: string;
  currentClass: ReconciledOrder["currentClass"];
  settlementStatus: SettlementStatus | null;
  qty: number;
  sellingPrice: number;
  grossSale: number;
  deductions: number; // affiliate/platform fee deduction on this order
  netPayout: number; // sale/settlement payout before affiliate/platform fee
  netAfterDeductions: number; // netPayout − deductions
  cogs: number;
  grossProfit: number; // netPayout − cogs, before affiliate/platform fee
  grossProfitAfterDeductions: number; // netAfterDeductions − cogs
  marginPct: number;
}

const COGS_CLASSES = new Set(["DELIVERED", "EXCHANGE", "CLAIM", "LOST"]);

function monthInRange(m: string | null, f?: string, t?: string): boolean {
  if (!m) return false;
  if (f && m < f) return false;
  if (t && m > t) return false;
  return true;
}

export function orderPnlRows(state: V2State, filter: PnlFilter, now = new Date()): OrderPnlRow[] {
  const reconciled = reconciledOrders(state, now); // Order Data only
  const cogsOf = (sku: string) => state.skus.find((s) => s.skuCode === sku)?.currentCogs ?? 0;
  const rows: OrderPnlRow[] = [];

  for (const r of reconciled) {
    if (r.currentClass === "PLATFORM_FEE") continue; // not an order (summary handles fees)
    const listingSku = r.order?.sku ?? "";
    const inv = listingSku ? resolvedInventorySku(state, listingSku) : null;
    const qty = r.order?.quantity ?? 1;

    // Affiliate/platform fees (blank-status negative events) stay visible as
    // per-order deductions here. netPayout is before those fees; netAfterDeductions
    // is what remains after them.
    let netPayout: number;
    let affiliateDeduction: number;
    let inScope: boolean;
    if (filter.view === "accrual") {
      const m = r.order?.orderDate?.slice(0, 7) ?? null;
      inScope = monthInRange(m, filter.fromMonth, filter.toMonth);
      netPayout = r.events.reduce((s, e) => s + (isAffiliateFeeEvent(e) ? 0 : e.finalSettlement), 0);
      affiliateDeduction = r.events.reduce((s, e) => s + (isAffiliateFeeEvent(e) ? -e.finalSettlement : 0), 0);
    } else {
      // cash: sum non-affiliate events whose payment month is in range
      let sum = 0; let fee = 0; let any = false;
      for (const e of r.events) {
        const em = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
        if (monthInRange(em, filter.fromMonth, filter.toMonth)) {
          any = true;
          if (isAffiliateFeeEvent(e)) fee += -e.finalSettlement;
          else sum += e.finalSettlement;
        }
      }
      inScope = any;
      netPayout = sum;
      affiliateDeduction = fee;
    }
    if (!inScope) continue;

    // COGS uses the resolved inventory SKU's current cost (listing SKU may differ)
    const cogsSku = inv ?? listingSku;
    const cogs = COGS_CLASSES.has(r.currentClass) ? cogsOf(cogsSku) * qty : 0;
    const grossSale = (r.order?.discountedPrice ?? 0) * qty;
    const netAfterDeductions = netPayout - affiliateDeduction;
    const grossProfit = netPayout - cogs;
    const grossProfitAfterDeductions = netAfterDeductions - cogs;
    rows.push({
      subOrderNo: r.subOrderNo,
      orderDate: r.order?.orderDate ?? "",
      inventorySku: inv,
      listingSku,
      productName: r.order?.productName ?? "",
      currentClass: r.currentClass,
      settlementStatus: settlementStatusOf(r),
      qty,
      sellingPrice: r.order?.discountedPrice ?? 0,
      grossSale,
      deductions: affiliateDeduction,
      netPayout,
      netAfterDeductions,
      cogs,
      grossProfit,
      grossProfitAfterDeductions,
      marginPct: netAfterDeductions > 0 ? (grossProfitAfterDeductions / netAfterDeductions) * 100 : 0,
    });
  }
  return rows;
}

export interface ProductPnlRow {
  inventorySku: string; // "(unmapped: X)" for unmapped listing SKUs
  productName: string;
  orders: number;
  delivered: number; returns: number; rto: number; lost: number; claim: number;
  netUnitsSold: number;
  grossSale: number;
  netPayout: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  returnRatePct: number;
}

export function productPnlRows(state: V2State, filter: PnlFilter, now = new Date()): ProductPnlRow[] {
  const orderRows = orderPnlRows(state, filter, now);
  const map = new Map<string, ProductPnlRow>();
  for (const r of orderRows) {
    const key = r.inventorySku ?? `(unmapped) ${r.listingSku}`;
    let p = map.get(key);
    if (!p) {
      p = {
        inventorySku: key, productName: r.productName, orders: 0,
        delivered: 0, returns: 0, rto: 0, lost: 0, claim: 0, netUnitsSold: 0,
        grossSale: 0, netPayout: 0, cogs: 0, grossProfit: 0, marginPct: 0, returnRatePct: 0,
      };
      map.set(key, p);
    }
    p.orders++;
    p.grossSale += r.grossSale;
    p.netPayout += r.netPayout;
    p.cogs += r.cogs;
    p.grossProfit += r.grossProfit;
    switch (r.currentClass) {
      case "DELIVERED": p.delivered++; p.netUnitsSold += r.qty; break;
      case "EXCHANGE": p.delivered++; p.netUnitsSold += r.qty; break;
      case "CLAIM": p.claim++; p.netUnitsSold += r.qty; break;
      case "RETURN": p.returns++; break;
      case "RTO": p.rto++; break;
      case "LOST": p.lost++; break;
    }
  }
  for (const p of map.values()) {
    p.marginPct = p.netPayout > 0 ? (p.grossProfit / p.netPayout) * 100 : 0;
    const denom = p.delivered + p.returns + p.rto;
    p.returnRatePct = denom > 0 ? ((p.returns + p.rto) / denom) * 100 : 0;
  }
  return Array.from(map.values()).sort((a, b) => b.grossProfit - a.grossProfit);
}

export interface PayoutSummary {
  income: { delivered: number; exchange: number; claim: number; lostComp: number; total: number };
  expenses: { cogs: number; returnLosses: number; platformDeductions: number; ads: number; qcWriteOff: number; businessExpenses: number; total: number };
  unmatchedPayouts: {
    subOrders: number;
    rows: number;
    credits: number;
    affiliateFees: number;
    returnDeductions: number;
    otherDeductions: number;
    totalDeductions: number;
    net: number;
  };
  /** Shared reconciling subtotal: Σ order gross profit (= order-wise = product-wise). */
  orderGrossProfit: number;
  /** Marketplace net = order gross profit − platform fees − ads − QC write-offs. */
  marketplaceNet: number;
  netProfit: number; // marketplaceNet − businessExpenses
  netMarginPct: number;
  recoverable: { tcs: number; tds: number };
  receivables: { unpaidOrders: number; unpaidAmount: number; pendingClaims: number; pendingClaimAmount: number; tcs: number; tds: number; total: number };
  reconciliation: { matched: number; unmatched: number; unmapped: number };
}

export function payoutSummary(state: V2State, filter: PnlFilter, now = new Date()): PayoutSummary {
  const rows = orderPnlRows(state, filter, now);
  const reconciled = reconcileAll(state, now);
  const round = (n: number) => Math.round(n * 100) / 100;
  const sumBy = (cls: string, f: (r: OrderPnlRow) => number) =>
    rows.filter((r) => r.currentClass === cls).reduce((s, r) => s + f(r), 0);

  const income = {
    delivered: sumBy("DELIVERED", (r) => r.netPayout),
    exchange: sumBy("EXCHANGE", (r) => r.netPayout),
    claim: sumBy("CLAIM", (r) => r.netPayout),
    lostComp: sumBy("LOST", (r) => r.netPayout),
    total: 0,
  };
  income.total = income.delivered + income.exchange + income.claim + income.lostComp;

  const cogs = rows.reduce((s, r) => s + r.cogs, 0);
  const returnLosses = rows
    .filter((r) => (r.currentClass === "RETURN" || r.currentClass === "RTO") && r.netPayout < 0)
    .reduce((s, r) => s + -r.netPayout, 0);

  // Main P&L is order-backed: only fees attached to uploaded orders flow into
  // marketplace net. Payment-only rows remain stored and are surfaced below as
  // unmatched payout impact; when their order file is uploaded, reconciliation
  // automatically moves them into this order-backed section by Sub Order No.
  let platformDeductions = 0;
  for (const r of reconciled) {
    if (!r.order) continue;
    for (const e of r.events) {
      if (!isAffiliateFeeEvent(e)) continue;
      const orderMonth = r.order?.orderDate?.slice(0, 7) ?? null;
      const eventMonth = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
      const inScope = filter.view === "accrual" && orderMonth
        ? monthInRange(orderMonth, filter.fromMonth, filter.toMonth)
        : monthInRange(eventMonth, filter.fromMonth, filter.toMonth);
      if (inScope) platformDeductions += -e.finalSettlement;
    }
  }

  const unmatchedPayout = {
    subOrders: 0,
    rows: 0,
    credits: 0,
    affiliateFees: 0,
    returnDeductions: 0,
    otherDeductions: 0,
    totalDeductions: 0,
    net: 0,
  };
  const unmatchedSubs = new Set<string>();
  for (const r of reconciled) {
    if (r.order) continue;
    for (const e of r.events) {
      const orderMonth = e.orderDate?.slice(0, 7) || null;
      const eventMonth = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
      const scopeMonth = filter.view === "accrual" ? (orderMonth ?? eventMonth) : eventMonth;
      if (!monthInRange(scopeMonth, filter.fromMonth, filter.toMonth)) continue;
      unmatchedSubs.add(r.subOrderNo);
      unmatchedPayout.rows++;
      unmatchedPayout.net += e.finalSettlement;
      if (e.finalSettlement > 0) {
        unmatchedPayout.credits += e.finalSettlement;
      } else if (e.finalSettlement < 0) {
        const d = -e.finalSettlement;
        const st = (e.liveOrderStatus ?? "").toLowerCase();
        if (isAffiliateFeeEvent(e)) unmatchedPayout.affiliateFees += d;
        else if (st === "return" || st === "rto") unmatchedPayout.returnDeductions += d;
        else unmatchedPayout.otherDeductions += d;
      }
    }
  }
  unmatchedPayout.subOrders = unmatchedSubs.size;
  unmatchedPayout.totalDeductions = unmatchedPayout.affiliateFees + unmatchedPayout.returnDeductions + unmatchedPayout.otherDeductions;

  const ads = state.expenses
    .filter((e) => e.source === "ADS_AUTO" && monthInRange(e.sourceKey?.replace("ads:", "") ?? null, filter.fromMonth, filter.toMonth))
    .reduce((s, e) => s + e.amount, 0);
  const businessExpenses = state.expenses
    .filter((e) => e.source !== "ADS_AUTO" && monthInRange(e.expenseDate.slice(0, 7), filter.fromMonth, filter.toMonth))
    .reduce((s, e) => s + e.amount, 0);

  // QC-damaged write-offs (a real loss at COGS) within scope
  const cogsOf = (sku: string) => state.skus.find((s) => s.skuCode === sku)?.currentCogs ?? 0;
  const qcWriteOff = state.returnsQueue
    .filter((r) => r.qcStatus === "DONE" && r.qcResult === "DAMAGED")
    .filter((r) => monthInRange((r.receivedDate ?? r.createdAt)?.slice(0, 7) ?? null, filter.fromMonth, filter.toMonth))
    .reduce((s, r) => s + cogsOf(r.skuCode), 0);

  const orderGrossProfit = rows.reduce((s, r) => s + r.grossProfit, 0);
  const marketplaceNet = orderGrossProfit - platformDeductions - ads - qcWriteOff;
  const netProfit = marketplaceNet - businessExpenses;

  // receivables (money owed) — not date-scoped; this is "now"
  const open = openSettlements(reconciled, now);
  const pendingClaims = state.claims.filter((c) => c.status !== "PAID" && c.status !== "REJECTED");
  const pendingClaimAmount = pendingClaims.reduce((s, c) => s + (c.amountClaimed - c.amountReceived), 0);
  const tcsTotal = reconciled
    .filter((r) => monthInRange(r.order?.orderDate?.slice(0, 7) ?? null, filter.fromMonth, filter.toMonth))
    .reduce((s, r) => s + r.totalTcs, 0);
  const tdsTotal = reconciled
    .filter((r) => monthInRange(r.order?.orderDate?.slice(0, 7) ?? null, filter.fromMonth, filter.toMonth))
    .reduce((s, r) => s + r.totalTds, 0);

  // reconciliation health — read the SINGLE canonical reconciliation state
  const recon = reconciliationState(state, now);
  const matched = recon.matched;
  const unmatched = recon.unacknowledged.count;
  const unmapped = unmappedTray(state).length;

  return {
    income,
    expenses: {
      cogs, returnLosses, platformDeductions: round(platformDeductions), ads, qcWriteOff, businessExpenses,
      total: cogs + returnLosses + round(platformDeductions) + ads + qcWriteOff + businessExpenses,
    },
    unmatchedPayouts: {
      subOrders: unmatchedPayout.subOrders,
      rows: unmatchedPayout.rows,
      credits: round(unmatchedPayout.credits),
      affiliateFees: round(unmatchedPayout.affiliateFees),
      returnDeductions: round(unmatchedPayout.returnDeductions),
      otherDeductions: round(unmatchedPayout.otherDeductions),
      totalDeductions: round(unmatchedPayout.totalDeductions),
      net: round(unmatchedPayout.net),
    },
    orderGrossProfit,
    marketplaceNet,
    netProfit,
    netMarginPct: income.total > 0 ? (netProfit / income.total) * 100 : 0,
    recoverable: { tcs: tcsTotal, tds: tdsTotal },
    receivables: {
      unpaidOrders: open.rows.length,
      unpaidAmount: open.totalPending,
      pendingClaims: pendingClaims.length,
      pendingClaimAmount,
      tcs: tcsTotal,
      tds: tdsTotal,
      total: open.totalPending + pendingClaimAmount + tcsTotal + tdsTotal,
    },
    reconciliation: { matched, unmatched, unmapped },
  };
}

// ── V3: returns breakdown by bucket (spec §4) ──────────────────────

export type ReturnBucket = "DELIVERED" | "CUSTOMER_RETURN" | "RTO" | "CANCELLED" | "EXCHANGE";

export interface ReturnBucketStat {
  bucket: ReturnBucket;
  count: number;
  units: number;
  rupeesLost: number; // return-leg negative settlements + QC-damaged write-offs (COGS)
  topSkus: { sku: string; count: number }[];
  topStates: { state: string; count: number }[];
}

export interface ReturnsBreakdown {
  buckets: ReturnBucketStat[];
  /** returns ÷ (delivered + returns) */
  returnRatePct: number;
  deliveredCount: number;
  returnCount: number; // customer returns + RTO + failed exchanges
  totalRupeesLost: number;
}

const RETURN_CLASS_TO_BUCKET: Partial<Record<ReconciledOrder["currentClass"], ReturnBucket>> = {
  DELIVERED: "DELIVERED",
  RETURN: "CUSTOMER_RETURN",
  RTO: "RTO",
  CANCELLED: "CANCELLED",
  EXCHANGE: "EXCHANGE",
};

export function returnsBreakdown(state: V2State, now = new Date()): ReturnsBreakdown {
  const reconciled = reconciledOrders(state, now); // Order Data only
  const cogsOf = (sku: string) => state.skus.find((s) => s.skuCode === sku)?.currentCogs ?? 0;

  // Exchange Double Return rule: a Delivered → Exchange → Return order means the
  // customer returned BOTH the original delivered unit AND the exchange
  // replacement, so it is counted here as TWO separate Customer Returns (count,
  // units and ₹ loss attributed to the Customer Return bucket — not Exchange).
  // The QC queue still stores the precise CUSTOMER_RETURN + EXCHANGE_RETURN
  // entry types; this only changes how the returns dashboard tallies them.
  const exThenReturnSubs = new Set(
    reconciled.filter((r) => isExchangeThenReturn(r.order, r.events)).map((r) => r.subOrderNo)
  );

  const init = (bucket: ReturnBucket): ReturnBucketStat & { _sku: Map<string, number>; _state: Map<string, number> } => ({
    bucket, count: 0, units: 0, rupeesLost: 0, topSkus: [], topStates: [],
    _sku: new Map(), _state: new Map(),
  });
  const buckets: Record<ReturnBucket, ReturnBucketStat & { _sku: Map<string, number>; _state: Map<string, number> }> = {
    DELIVERED: init("DELIVERED"), CUSTOMER_RETURN: init("CUSTOMER_RETURN"),
    RTO: init("RTO"), CANCELLED: init("CANCELLED"), EXCHANGE: init("EXCHANGE"),
  };

  for (const r of reconciled) {
    // Exchange Double Return → two Customer Returns (original + replacement).
    if (exThenReturnSubs.has(r.subOrderNo)) {
      const b = buckets.CUSTOMER_RETURN;
      const qty = r.order?.quantity ?? 1;
      b.count += 2;
      b.units += qty * 2;
      if (r.cumulativeSettlement < 0) b.rupeesLost += -r.cumulativeSettlement;
      const sku = r.order?.sku;
      if (sku) b._sku.set(sku, (b._sku.get(sku) ?? 0) + 2);
      const st = r.order?.customerState;
      if (st) b._state.set(st, (b._state.get(st) ?? 0) + 2);
      continue;
    }
    const bucket = RETURN_CLASS_TO_BUCKET[r.currentClass];
    if (!bucket) continue;
    const b = buckets[bucket];
    b.count++;
    b.units += r.order?.quantity ?? 1;
    if ((bucket === "CUSTOMER_RETURN" || bucket === "RTO" || bucket === "EXCHANGE") && r.cumulativeSettlement < 0) {
      b.rupeesLost += -r.cumulativeSettlement;
    }
    const sku = r.order?.sku;
    if (sku) b._sku.set(sku, (b._sku.get(sku) ?? 0) + 1);
    const st = r.order?.customerState;
    if (st) b._state.set(st, (b._state.get(st) ?? 0) + 1);
  }

  // QC-damaged write-offs add to ₹ lost of their return bucket. For an
  // exchange-then-return order BOTH QC legs (CUSTOMER_RETURN + EXCHANGE_RETURN)
  // are attributed to the Customer Return bucket, consistent with the count.
  for (const rq of state.returnsQueue) {
    if (rq.qcStatus === "DONE" && rq.qcResult && rq.qcResult !== "SELLABLE") {
      const bucket: ReturnBucket = exThenReturnSubs.has(rq.subOrderNo) ? "CUSTOMER_RETURN"
        : rq.returnType === "RTO" ? "RTO"
        : rq.returnType === "EXCHANGE_RETURN" ? "EXCHANGE" : "CUSTOMER_RETURN";
      buckets[bucket].rupeesLost += cogsOf(rq.skuCode);
    }
  }

  const top = (m: Map<string, number>) =>
    Array.from(m.entries()).map(([k, v]) => ({ key: k, count: v })).sort((a, b) => b.count - a.count).slice(0, 5);

  const finalized = (Object.keys(buckets) as ReturnBucket[]).map((k) => {
    const b = buckets[k];
    return {
      bucket: b.bucket, count: b.count, units: b.units, rupeesLost: Math.round(b.rupeesLost * 100) / 100,
      topSkus: top(b._sku).map((x) => ({ sku: x.key, count: x.count })),
      topStates: top(b._state).map((x) => ({ state: x.key, count: x.count })),
    };
  });

  const deliveredCount = buckets.DELIVERED.count;
  const returnCount = buckets.CUSTOMER_RETURN.count + buckets.RTO.count;
  const denom = deliveredCount + returnCount;
  return {
    buckets: finalized,
    deliveredCount,
    returnCount,
    returnRatePct: denom > 0 ? (returnCount / denom) * 100 : 0,
    totalRupeesLost: finalized.reduce((s, b) => s + b.rupeesLost, 0),
  };
}

/** Pending-₹ total + count for the Orders hero (delegates to the engine). */
export function openSettlementsTotal(state: V2State, now = new Date()): { total: number; count: number } {
  const { rows, totalPending } = openSettlements(reconciledOrders(state, now), now);
  return { total: totalPending, count: rows.length };
}

export function settlementGroups(views: OrderRowView[]): SettlementGroup[] {
  const order: SettlementStatus[] = ["PAID", "UNPAID", "DISPUTED"];
  return order.map((status) => {
    const rows = views.filter((v) => v.settlementStatus === status);
    return {
      status,
      count: rows.length,
      total: rows.reduce((s, v) => s + Math.max(0, v.cumulativeSettlement), 0),
    };
  });
}

/** Months in which orders were actually placed (accrual basis for the hero). */
export function orderMonths(state: V2State): string[] {
  const months = new Set<string>();
  for (const o of state.orders) {
    const m = o.orderDate?.slice(0, 7);
    if (m) months.add(m);
  }
  return Array.from(months).sort();
}

// ── Monthly P&L statement (accounting layout, dual view) ────────────

export interface PnlStatement {
  month: string;
  view: PnlView;
  income: {
    delivered: number; exchange: number; claims: number; lostComp: number; total: number;
  };
  cogs: number;
  writeOffs: { qcDamaged: number; lostNet: number; total: number };
  returnLosses: number;
  platformDeductions: number;
  adsCost: number;
  marketplaceNet: number;
  businessExpenses: number;
  trueNet: number;
  recoverable: { tcs: number; tds: number };
  orderCount: number;
}

function inMonth(date: string | undefined | null, month: string): boolean {
  return Boolean(date && date.slice(0, 7) === month);
}

export function pnlStatement(
  state: V2State,
  month: string,
  view: PnlView,
  now = new Date()
): PnlStatement {
  const reconciled = reconcileAll(state, now);
  const cogsOf = (sku: string) =>
    state.skus.find((s) => s.skuCode === sku)?.currentCogs ?? 0;

  // pick the orders/events that belong to this month under the chosen view
  const inView = (r: ReconciledOrder): { settle: number; counted: boolean } => {
    if (view === "accrual") {
      const counted = inMonth(r.order?.orderDate, month);
      return { settle: counted ? r.cumulativeSettlement : 0, counted };
    }
    let settle = 0;
    let counted = false;
    for (const e of r.events) {
      const m = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
      if (m === month) { settle += e.finalSettlement; counted = true; }
    }
    return { settle, counted };
  };

  const income = { delivered: 0, exchange: 0, claims: 0, lostComp: 0, total: 0 };
  let cogs = 0, returnLosses = 0, platformDeductions = 0, lostNet = 0;
  let tcs = 0, tds = 0, orderCount = 0;

  for (const r of reconciled) {
    const { settle, counted } = inView(r);
    if (!counted) continue;
    if (r.currentClass !== "PLATFORM_FEE") orderCount++;
    const unitCogs = cogsOf(r.order?.sku ?? "");
    const qty = r.order?.quantity ?? 1;
    switch (r.currentClass) {
      case "DELIVERED":
        income.delivered += settle;
        cogs += unitCogs * qty;
        break;
      case "EXCHANGE":
        income.exchange += settle;
        cogs += unitCogs * qty;
        break;
      case "CLAIM":
        income.claims += settle;
        cogs += unitCogs * qty;
        break;
      case "LOST":
        income.lostComp += settle;
        lostNet += unitCogs * qty - settle; // lost units net of compensation
        break;
      case "RTO":
      case "RETURN":
        if (settle < 0) returnLosses += -settle;
        else income.delivered += settle; // rare positive credits stay in income
        break;
      case "PLATFORM_FEE":
        platformDeductions += Math.abs(Math.min(0, settle));
        break;
    }
    if (view === "accrual") { tcs += r.totalTcs; tds += r.totalTds; }
    else {
      for (const e of r.events) {
        const m = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
        if (m === month) { tcs += e.tcs; tds += e.tds; }
      }
    }
  }
  income.total = income.delivered + income.exchange + income.claims + income.lostComp;

  // QC write-offs: damaged units failed in this month, at COGS
  const qcDamaged = state.returnsQueue
    .filter((r) => r.qcStatus === "DONE" && r.qcResult === "DAMAGED")
    .filter((r) => inMonth(r.receivedDate ?? r.createdAt, month))
    .reduce((s, r) => s + cogsOf(r.skuCode), 0);

  const adsCost = state.expenses
    .filter((e) => e.source === "ADS_AUTO" && e.sourceKey === `ads:${month}`)
    .reduce((s, e) => s + e.amount, 0);

  const marketplaceNet =
    income.total - cogs - returnLosses - platformDeductions - adsCost - qcDamaged;

  const businessExpensesList = state.expenses.filter(
    (e) => inMonth(e.expenseDate, month)
  );
  const { businessExpenses, trueNet } = trueNetProfit(marketplaceNet, businessExpensesList);

  return {
    month, view, income, cogs,
    writeOffs: { qcDamaged, lostNet: Math.max(0, lostNet), total: qcDamaged },
    returnLosses, platformDeductions, adsCost,
    marketplaceNet, businessExpenses, trueNet,
    recoverable: { tcs, tds },
    orderCount,
  };
}

// ── Dashboard metrics ───────────────────────────────────────────────

export interface DashboardData {
  month: string;
  trueNet: number;
  prevTrueNet: number | null;
  marketplaceNet: number;
  businessExpenses: number;
  profitSpark: { month: string; profit: number }[];
  pendingSettlement: { total: number; count: number };
  qcPending: number;
  qcAging: number; // pending > 7 days
  lowStock: number;
  returnRatePct: number;
  deadStockCount: number;
  stockValuation: number;
}

/**
 * Net profit for a single month — the SAME function the Payout & P/L Summary
 * uses (payoutSummary). One metric, one query: the dashboard and the summary
 * now reconcile exactly for the same period.
 */
export function monthSummary(state: V2State, month: string, now = new Date()): PayoutSummary {
  return payoutSummary(state, { fromMonth: month, toMonth: month, view: "accrual" }, now);
}

export function dashboardData(state: V2State, now = new Date()): DashboardData {
  // hero is accrual ("how profitable were this month's orders"), so default to
  // the latest month with actual orders — not a trailing payment-only month.
  const months = orderMonths(state);
  const month = months[months.length - 1] ?? now.toISOString().slice(0, 7);
  const prev = months[months.length - 2] ?? null;
  const sum = monthSummary(state, month, now);
  const prevSum = prev ? monthSummary(state, prev, now) : null;

  const reconciled = reconciledOrders(state, now); // Order Data only
  const open = openSettlements(reconciled, now);

  const pendingQc = state.returnsQueue.filter((r) => r.qcStatus === "PENDING");
  const aging = pendingQc.filter(
    (r) => (now.getTime() - new Date(r.createdAt).getTime()) / 86_400_000 > 7
  );

  const intel = stockIntel(state, now);

  const real = reconciled.filter((r) => r.currentClass !== "PLATFORM_FEE" && r.currentClass !== "CANCELLED");
  const returns = reconciled.filter((r) => r.currentClass === "RTO" || r.currentClass === "RETURN");

  return {
    month,
    trueNet: sum.netProfit,
    prevTrueNet: prevSum?.netProfit ?? null,
    marketplaceNet: sum.marketplaceNet,
    businessExpenses: sum.expenses.businessExpenses,
    profitSpark: months.map((m) => ({ month: m, profit: monthSummary(state, m, now).netProfit })),
    pendingSettlement: { total: open.totalPending, count: open.rows.length },
    qcPending: pendingQc.length,
    qcAging: aging.length,
    lowStock: intel.rows.filter((r) => r.needsReorder).length,
    returnRatePct: real.length ? (returns.length / real.length) * 100 : 0,
    deadStockCount: intel.rows.filter((r) => r.deadStock).length,
    stockValuation: intel.totalValuation,
  };
}

// ── Analytics: leaderboards, trends, health, insights ───────────────

export interface SkuAgg {
  skuCode: string;
  productName: string;
  units: number;
  revenue: number;
  profit: number;
  marginPct: number;
  orders: number;
  returns: number;
  returnRatePct: number;
}

export function skuAggregates(state: V2State, now = new Date()): SkuAgg[] {
  const reconciled = reconcileAll(state, now);
  const map = new Map<string, SkuAgg>();
  const cogsOf = (sku: string) => state.skus.find((s) => s.skuCode === sku)?.currentCogs ?? 0;
  for (const r of reconciled) {
    const sku = r.order?.sku || "";
    if (!sku || r.currentClass === "PLATFORM_FEE") continue;
    let agg = map.get(sku);
    if (!agg) {
      agg = {
        skuCode: sku,
        productName: r.order?.productName ?? "",
        units: 0, revenue: 0, profit: 0, marginPct: 0, orders: 0, returns: 0, returnRatePct: 0,
      };
      map.set(sku, agg);
    }
    agg.orders++;
    const qty = r.order?.quantity ?? 1;
    if (r.currentClass === "DELIVERED" || r.currentClass === "EXCHANGE" || r.currentClass === "CLAIM") {
      agg.units += qty;
      agg.revenue += r.cumulativeSettlement;
      agg.profit += r.cumulativeSettlement - cogsOf(sku) * qty;
    }
    if (r.currentClass === "RTO" || r.currentClass === "RETURN") {
      agg.returns++;
      agg.profit += Math.min(0, r.cumulativeSettlement);
    }
    if (r.currentClass === "LOST") {
      agg.profit += r.cumulativeSettlement - cogsOf(sku) * qty;
    }
  }
  for (const a of map.values()) {
    a.marginPct = a.revenue > 0 ? (a.profit / a.revenue) * 100 : 0;
    const denom = a.orders;
    a.returnRatePct = denom > 0 ? (a.returns / denom) * 100 : 0;
  }
  return Array.from(map.values());
}

export interface StateAgg { state: string; orders: number; revenue: number; rtoCount: number; rtoPct: number }

export function stateAggregates(state: V2State, now = new Date()): StateAgg[] {
  const reconciled = reconcileAll(state, now);
  const map = new Map<string, StateAgg>();
  for (const r of reconciled) {
    const st = r.order?.customerState;
    if (!st || r.currentClass === "PLATFORM_FEE" || r.currentClass === "CANCELLED") continue;
    let agg = map.get(st);
    if (!agg) { agg = { state: st, orders: 0, revenue: 0, rtoCount: 0, rtoPct: 0 }; map.set(st, agg); }
    agg.orders++;
    agg.revenue += Math.max(0, r.cumulativeSettlement);
    if (r.currentClass === "RTO") agg.rtoCount++;
  }
  for (const a of map.values()) a.rtoPct = a.orders ? (a.rtoCount / a.orders) * 100 : 0;
  return Array.from(map.values());
}

export interface MonthTrend {
  month: string; revenue: number; trueNet: number; marginPct: number;
  orders: number; returnRatePct: number;
}

export function monthlyTrends(state: V2State, now = new Date()): MonthTrend[] {
  const reconciled = reconcileAll(state, now);
  // accrual basis — one point per month orders were placed; same engine as the
  // dashboard hero and the Payout Summary (single source of truth).
  return orderMonths(state).map((m) => {
    const stmt = monthSummary(state, m, now);
    const monthOrders = reconciled.filter((r) => inMonth(r.order?.orderDate, m));
    const real = monthOrders.filter((r) => r.currentClass !== "CANCELLED" && r.currentClass !== "PLATFORM_FEE");
    const rets = monthOrders.filter((r) => r.currentClass === "RTO" || r.currentClass === "RETURN");
    return {
      month: m,
      revenue: stmt.income.total,
      trueNet: stmt.netProfit,
      marginPct: stmt.income.total ? (stmt.netProfit / stmt.income.total) * 100 : 0,
      orders: real.length,
      returnRatePct: real.length ? (rets.length / real.length) * 100 : 0,
    };
  });
}

export interface HealthCard {
  growthPct: number | null;
  profitPerOrder: number;
  avgOrderValue: number;
  settlementCycleDays: number | null;
  stockTurnover: number | null;
}

export function healthCard(state: V2State, now = new Date()): HealthCard {
  const trends = monthlyTrends(state, now);
  const last = trends[trends.length - 1];
  const prev = trends[trends.length - 2];
  const reconciled = reconcileAll(state, now);

  // settlement cycle: order date → first settlement event, settled orders only
  const cycles: number[] = [];
  for (const r of reconciled) {
    if (!r.order?.orderDate || r.events.length === 0 || r.cumulativeSettlement <= 0) continue;
    const first = r.events.find((e) => e.finalSettlement > 0);
    if (!first?.paymentDate) continue;
    const days = (new Date(first.paymentDate).getTime() - new Date(r.order.orderDate).getTime()) / 86_400_000;
    if (days >= 0 && days < 365) cycles.push(days);
  }

  const intel = stockIntel(state, now);
  const sold30 = state.ledger
    .filter((e) => (e.eventType === "SALE_OUT" || e.eventType === "EXCHANGE_OUT")
      && (now.getTime() - new Date(e.createdAt).getTime()) / 86_400_000 <= 30)
    .reduce((s, e) => s - e.quantityDelta, 0);
  const avgStock = intel.rows.reduce((s, r) => s + Math.max(0, r.stock), 0);

  return {
    growthPct: prev && prev.trueNet !== 0 ? ((last.trueNet - prev.trueNet) / Math.abs(prev.trueNet)) * 100 : null,
    profitPerOrder: last?.orders ? last.trueNet / last.orders : 0,
    avgOrderValue: last?.orders ? last.revenue / last.orders : 0,
    settlementCycleDays: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null,
    stockTurnover: avgStock > 0 ? (sold30 * 12) / avgStock : null, // annualized
  };
}

export interface Insight { tone: "positive" | "warning" | "critical"; text: string }

export function insightsFeed(state: V2State, now = new Date()): Insight[] {
  const out: Insight[] = [];
  const trends = monthlyTrends(state, now);
  const last = trends[trends.length - 1];
  const prev = trends[trends.length - 2];
  const aggs = skuAggregates(state, now);

  if (last && prev && prev.trueNet !== 0) {
    const g = ((last.trueNet - prev.trueNet) / Math.abs(prev.trueNet)) * 100;
    const driver = [...aggs].sort((a, b) => b.profit - a.profit)[0];
    if (g > 0) out.push({ tone: "positive", text: `Profit grew ${g.toFixed(0)}% vs last month${driver ? `, driven by ${driver.skuCode}` : ""}.` });
    else if (g < 0) out.push({ tone: "warning", text: `Profit fell ${Math.abs(g).toFixed(0)}% vs last month — check the return-heavy SKUs below.` });
  }
  for (const a of aggs) {
    if (a.returnRatePct >= 25 && a.orders >= 8) {
      const lost = Math.abs(Math.min(0, a.profit));
      out.push({
        tone: "critical",
        text: `${a.skuCode} return rate hit ${a.returnRatePct.toFixed(0)}%${lost ? ` — ${formatINR(lost, true)} lost` : ""}. Consider delisting or checking the size chart.`,
      });
    }
  }
  const open = openSettlements(reconcileAll(state, now), now);
  const oldRows = open.rows.filter((r) => r.daysOutstanding > 30);
  if (oldRows.length) {
    const stuck = oldRows.reduce((s, r) => s + Math.max(0, r.expected - Math.max(0, r.received)), 0);
    out.push({ tone: "warning", text: `${formatINR(stuck, true)} stuck in ${oldRows.length} unsettled orders older than 30 days.` });
  }
  const intel = stockIntel(state, now);
  const dead = intel.rows.filter((r) => r.deadStock);
  if (dead.length) {
    const locked = dead.reduce((s, r) => s + r.valuation, 0);
    out.push({ tone: "warning", text: `${formatINR(locked, true)} locked in ${dead.length} dead-stock SKU(s) with no sales in 60 days.` });
  }
  return out.slice(0, 6);
}

// ── GST ─────────────────────────────────────────────────────────────

export function gstForMonth(state: V2State, month: string, now = new Date()): GstMonthlySummary {
  const reconciled = reconcileAll(state, now);
  const gstRateOf = (sku: string) => state.skus.find((s) => s.skuCode === sku)?.gstRate ?? 5;
  // output GST on delivered/exchange sales of the month (order-date basis),
  // valued at the customer-paid price (discounted price is GST-inclusive)
  const sales = reconciled
    .filter((r) => inMonth(r.order?.orderDate, month))
    .filter((r) => r.currentClass === "DELIVERED" || r.currentClass === "EXCHANGE")
    .map((r) => ({
      skuCode: r.order!.sku,
      grossValue: r.order!.discountedPrice * (r.order!.quantity || 1),
      gstRate: gstRateOf(r.order!.sku),
    }));
  const inputs = [
    ...state.purchases
      .filter((p) => inMonth(p.invoiceDate, month))
      .map((p) => ({ description: p.supplierName, gstAmount: p.gstAmount })),
    ...state.expenses
      .filter((e) => inMonth(e.expenseDate, month) && e.gstAmount > 0)
      .map((e) => ({ description: e.description, gstAmount: e.gstAmount })),
  ];
  const { total: cash } = settlementForMonth(reconciled, month, "cash");
  void cash; // TCS/TDS below come from events directly
  let tcs = 0, tds = 0;
  for (const e of state.events) {
    const m = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
    if (m === month) { tcs += e.tcs; tds += e.tds; }
  }
  return gstMonthlySummary(sales, inputs, Math.round(tcs * 100) / 100, Math.round(tds * 100) / 100);
}

// ── Bank reconciliation ───────────────────────────────────────────────
/**
 * Truth = the bank statement, not the order/payout file. Order & payout files
 * tell us what *should* move; only CATEGORIZED bank transactions count as
 * actually paid. Whatever the marketplace owes but hasn't deposited is
 * Receivable; whatever we owe vendors but haven't paid from the bank is
 * Vendor Payout Due.
 */
export interface BankReconciliation {
  hasBankData: boolean;
  /** Net the marketplace owes us per payout files (Σ Final Settlement). */
  expectedFromMarketplace: number;
  /** Money-in confirmed on the bank statement (categorized credits, excl. owner deposits). */
  bankReceived: number;
  /** Bank-confirmed amount received = "Total Paid". */
  totalPaid: number;
  /** Expected − received (never negative). */
  totalReceivable: number;
  /** What we owe vendors per purchase bills (file status is ignored). */
  expectedVendorPayout: number;
  /** Vendor/inventory payments confirmed on the bank statement. */
  bankVendorPaid: number;
  /** Expected vendor payout − bank-confirmed paid (never negative). */
  totalVendorDue: number;
  receivablePct: number;
  vendorDuePct: number;
  /** Counts for context. */
  confirmedReceipts: number;
  confirmedVendorPayments: number;
}

export function bankReconciliation(state: V2State): BankReconciliation {
  const round = (n: number) => Math.round(n * 100) / 100;
  const events = state.events ?? [];
  const purchases = state.purchases ?? [];

  // Expected NET deposit from the marketplace (payout files).
  const expectedFromMarketplace = round(events.reduce((s, e) => s + (e.finalSettlement || 0), 0));
  // What we owe vendors — every bill, regardless of the file's "paid" flag.
  const expectedVendorPayout = round(purchases.reduce((s, p) => s + (p.totalAmount || 0), 0));

  // Only CATEGORIZED bank transactions are "final paid".
  const cat = (state.bankTxns ?? []).filter((t) => t.status === "CATEGORIZED");
  const OWNER = COA.RETAINED.code; // owner deposits are not customer/marketplace receipts
  const vendorCodes = new Set<string>([COA.INVENTORY.code, COA.AP.code]);

  const receipts = cat.filter((t) => t.credit > 0 && t.coaCode !== OWNER);
  const vendorPayments = cat.filter((t) => t.debit > 0 && t.coaCode && vendorCodes.has(t.coaCode));

  const bankReceived = round(receipts.reduce((s, t) => s + t.credit, 0));
  const bankVendorPaid = round(vendorPayments.reduce((s, t) => s + t.debit, 0));

  const totalReceivable = round(Math.max(0, expectedFromMarketplace - bankReceived));
  const totalVendorDue = round(Math.max(0, expectedVendorPayout - bankVendorPaid));

  return {
    hasBankData: cat.length > 0,
    expectedFromMarketplace,
    bankReceived,
    totalPaid: bankReceived,
    totalReceivable,
    expectedVendorPayout,
    bankVendorPaid,
    totalVendorDue,
    receivablePct: expectedFromMarketplace > 0 ? round((totalReceivable / expectedFromMarketplace) * 100) : 0,
    vendorDuePct: expectedVendorPayout > 0 ? round((totalVendorDue / expectedVendorPayout) * 100) : 0,
    confirmedReceipts: receipts.length,
    confirmedVendorPayments: vendorPayments.length,
  };
}
