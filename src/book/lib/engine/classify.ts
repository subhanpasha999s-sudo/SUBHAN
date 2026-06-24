/**
 * ORDER CLASSIFICATION ENGINE — the core business logic (spec Part 4).
 *
 * Pure functions only. Merge order + payment files on Sub Order No (string
 * match), aggregate multi-row payments (exchanges produce several rows per
 * Sub Order No), then classify each merged record in priority order.
 */
import {
  ClassifiedOrder,
  MergedOrder,
  OrderClass,
  OrderRow,
  PaymentRow,
} from "./types";

/**
 * Exchange handling (spec): when the same Sub Order No appears multiple times
 * in Order Data, it's a door‑step exchange — NOT multiple orders. Collapse to
 * one order: the earliest date is the return leg, the latest carries the final
 * status. The merged order is marked DOOR_STEP_EXCHANGED so it classifies as a
 * single EXCHANGE (its two payment legs are reconciled from Payment Data).
 */
export interface CanonicalizeResult {
  orders: OrderRow[];
  rawRowCount: number; // total order-file rows read
  uniqueCount: number; // distinct Sub Order Nos
  mergedSubOrders: string[]; // sub orders that spanned >1 row
}

/**
 * Canonical order identity (V4): a Sub Order No is ONE order. When the order
 * file has multiple rows for it, merge into a single canonical order using
 * this precedence for the order-side reason (the reason is only a hint —
 * final class is decided later by the reconciliation engine from payment data):
 *
 *   • DELIVERED + CANCELLED        → DELIVERED  (partial line cancellation that
 *                                     did not hit the delivered unit)
 *   • DELIVERED + DOOR_STEP_EXCH.  → DELIVERED  (forward leg delivered & replaced;
 *                                     payment decides if it became an exchange)
 *   • DOOR_STEP_EXCHANGED (sole)   → DOOR_STEP_EXCHANGED (valid only when it's the
 *                                     only reason; still needs payment to confirm)
 *   • otherwise                    → first non-cancelled reason
 *
 * Never silently drops rows — raw rows are counted and the merge is reported.
 */
export function canonicalizeOrders(rows: OrderRow[]): CanonicalizeResult {
  const byId = new Map<string, OrderRow[]>();
  for (const r of rows) {
    const list = byId.get(r.subOrderNo) ?? [];
    list.push(r);
    byId.set(r.subOrderNo, list);
  }
  const orders: OrderRow[] = [];
  const merged: string[] = [];
  const hadExchange = (rows: OrderRow[]) =>
    rows.some((r) => (r.reason || "").toUpperCase() === "DOOR_STEP_EXCHANGED");
  for (const group of byId.values()) {
    if (group.length === 1) {
      // preserve the exchange signal even on a single-row order
      orders.push({ ...group[0], hadExchangeLeg: hadExchange(group) });
      continue;
    }
    merged.push(group[0].subOrderNo);
    const sorted = [...group].sort((a, b) => (a.orderDate || "").localeCompare(b.orderDate || ""));
    const latest = sorted[sorted.length - 1];
    const reasons = new Set(group.map((g) => (g.reason || "").toUpperCase()));

    let reason: string;
    if (reasons.has("DOOR_STEP_EXCHANGED") && reasons.has("DELIVERED")) {
      reason = "DELIVERED"; // exchange forward leg; payment decides final class
    } else if (reasons.has("DELIVERED") && reasons.has("CANCELLED")) {
      reason = "DELIVERED"; // partial line cancellation
    } else if (reasons.size === 1 && reasons.has("DOOR_STEP_EXCHANGED")) {
      reason = "DOOR_STEP_EXCHANGED";
    } else {
      reason =
        group.map((g) => (g.reason || "").toUpperCase()).find((r) => r !== "CANCELLED") ??
        latest.reason;
    }
    orders.push({ ...latest, reason, hadExchangeLeg: hadExchange(group) });
  }
  return { orders, rawRowCount: rows.length, uniqueCount: byId.size, mergedSubOrders: merged };
}

/** Convenience: canonical orders only (used widely). */
export function normalizeExchangeOrders(rows: OrderRow[]): OrderRow[] {
  return canonicalizeOrders(rows).orders;
}

/** Merge the two files on Sub Order No. Keeps payment-only records too. */
export function mergeFiles(
  orders: OrderRow[],
  payments: PaymentRow[]
): MergedOrder[] {
  const byId = new Map<string, MergedOrder>();
  for (const o of orders) {
    const existing = byId.get(o.subOrderNo);
    if (existing) {
      existing.order = existing.order ?? o; // duplicate order rows: keep first
    } else {
      byId.set(o.subOrderNo, { subOrderNo: o.subOrderNo, order: o, payments: [] });
    }
  }
  for (const p of payments) {
    const existing = byId.get(p.subOrderNo);
    if (existing) existing.payments.push(p);
    else byId.set(p.subOrderNo, { subOrderNo: p.subOrderNo, order: null, payments: [p] });
  }
  return Array.from(byId.values());
}

/** Sum settlements across all payment rows (exchanges have multiple legs). */
function totalSettlement(payments: PaymentRow[]): number {
  return payments.reduce((s, p) => s + p.finalSettlement, 0);
}

/**
 * Final payment status across multiple rows: a terminal "Delivered" wins,
 * then "Return", then "RTO", then "Exchange", then "Shipped"; else blank.
 */
function finalStatus(payments: PaymentRow[]): string | null {
  const statuses = payments
    .map((p) => p.liveOrderStatus)
    .filter((s): s is string => s !== null)
    .map((s) => s.toLowerCase());
  for (const want of ["delivered", "return", "rto", "exchange", "shipped"]) {
    if (statuses.includes(want)) return want;
  }
  return null;
}

/**
 * Classify one merged record. Rules applied in spec priority order
 * (A → H); reason-based triggers (A, C, D, E) are mutually exclusive so
 * they are checked first, then B, then the payment-only classes F/G/H.
 */
export function classifyOrder(merged: MergedOrder): ClassifiedOrder {
  const { order, payments, subOrderNo } = merged;
  const settlement = totalSettlement(payments);
  const status = finalStatus(payments);
  const qty = order?.quantity ?? payments[0]?.quantity ?? 1;
  const sku = order?.sku || payments[0]?.sku || "";
  const productName = order?.productName || payments[0]?.productName || "";

  const base: ClassifiedOrder = {
    subOrderNo,
    orderClass: "UNKNOWN",
    sku,
    productName,
    quantity: qty,
    customerState: order?.customerState ?? "",
    orderDate: order?.orderDate || payments[0]?.orderDate || "",
    orderSource: order?.orderSource ?? "",
    settlement,
    cogsUnits: 0,
    inventoryDelta: 0,
    qcPendingUnits: 0,
    paymentMissing: false,
    orderMissing: order === null,
    needsReview: false,
    tcs: payments.reduce((s, p) => s + p.tcs, 0),
    tds: payments.reduce((s, p) => s + p.tds, 0),
  };

  const reason = order?.reason ?? "";

  // ── CLASS A — CANCELLED: never left the warehouse; everything zero.
  if (reason === "CANCELLED") {
    return { ...base, orderClass: "CANCELLED", settlement: 0 };
  }

  // ── CLASS C — RTO_COMPLETE: came back before delivery. Revenue 0, COGS 0,
  // unit goes to QC-pending. Loss = any negative settlement (return charges).
  if (reason === "RTO_COMPLETE") {
    return {
      ...base,
      orderClass: "RTO",
      qcPendingUnits: qty,
      paymentMissing: payments.length === 0,
    };
  }

  // ── CLASS D — LOST: unit permanently gone; settlement is Meesho's
  // compensation. COGS applies. Undercompensation alert handled downstream.
  if (reason === "LOST") {
    return {
      ...base,
      orderClass: "LOST",
      cogsUnits: qty,
      inventoryDelta: -qty,
      paymentMissing: payments.length === 0,
    };
  }

  // ── CLASS E — DOOR_STEP_EXCHANGED: two-leg transaction, payment rows
  // already aggregated. Completed (Delivered) ⇒ behaves like a sale;
  // failed ⇒ behaves like a return. Always flagged for manual review.
  if (reason === "DOOR_STEP_EXCHANGED") {
    const completed = status === "delivered" || (status === "shipped" && settlement > 0);
    return {
      ...base,
      orderClass: "EXCHANGE",
      needsReview: true,
      cogsUnits: completed ? qty : 0,
      inventoryDelta: completed ? -qty : 0,
      qcPendingUnits: completed ? 0 : qty,
      paymentMissing: payments.length === 0,
    };
  }

  // ── CLASS B — DELIVERED: order says DELIVERED and payment confirms
  // Delivered, or payment still says Shipped but money landed (data lag).
  if (reason === "DELIVERED") {
    if (status === "delivered" || (status === "shipped" && settlement > 0)) {
      return {
        ...base,
        orderClass: "DELIVERED",
        cogsUnits: qty,
        inventoryDelta: -qty,
      };
    }
    // Order file says DELIVERED but payment says Return ⇒ customer returned
    // it after delivery — Class H below handles it.
    if (status === "return") {
      return { ...base, orderClass: "RETURN", qcPendingUnits: qty };
    }
    if (payments.length === 0) {
      // Delivered but no payment row at all — payment pending/missing.
      return {
        ...base,
        orderClass: "DELIVERED",
        cogsUnits: qty,
        inventoryDelta: -qty,
        paymentMissing: true,
        needsReview: true,
      };
    }
  }

  // From here down the order file gives no verdict (no order row, or an
  // unrecognized reason). Decide from the payment side.

  // ── CLASS H — RETURN: customer received then returned. Settlement is
  // often negative (return shipping). Unit goes to QC-pending.
  if (status === "return") {
    return { ...base, orderClass: "RETURN", qcPendingUnits: qty };
  }

  // Payment-confirmed delivery without (or with odd) order-file reason.
  if (status === "delivered" || (status === "shipped" && settlement > 0)) {
    return {
      ...base,
      orderClass: "DELIVERED",
      cogsUnits: qty,
      inventoryDelta: -qty,
      needsReview: base.orderMissing,
    };
  }

  if (status === "rto") {
    return { ...base, orderClass: "RTO", qcPendingUnits: qty };
  }

  // Payment status literally "Exchange" (door-step exchange) without an
  // order-file reason — classify as EXCHANGE; always flag for manual review.
  if (status === "exchange") {
    const completed = settlement > 0;
    return {
      ...base,
      orderClass: "EXCHANGE",
      needsReview: true,
      cogsUnits: completed ? qty : 0,
      inventoryDelta: completed ? -qty : 0,
      qcPendingUnits: completed ? 0 : qty,
    };
  }

  // ── CLASS F — blank status + negative payout: NOT an order. Marketplace
  // affiliate fee / platform deduction. No COGS, no order count, no stock.
  if (status === null && payments.length > 0 && settlement < 0) {
    return { ...base, orderClass: "PLATFORM_FEE", quantity: 0 };
  }

  // ── CLASS G — blank status + positive payout: claim/compensation income.
  // Product is a sunk cost — COGS applies, unit marked CLAIM LOSS.
  if (status === null && payments.length > 0 && settlement > 0) {
    return {
      ...base,
      orderClass: "CLAIM",
      cogsUnits: qty,
      inventoryDelta: -qty,
    };
  }

  // Order row with no payment row and no recognized reason, or zero-value
  // blank rows — surface for review rather than silently dropping.
  return {
    ...base,
    orderClass: "UNKNOWN",
    paymentMissing: payments.length === 0 && order !== null,
    needsReview: true,
  };
}

export function classifyAll(merged: MergedOrder[]): ClassifiedOrder[] {
  return merged.map(classifyOrder);
}

export const ORDER_CLASS_LABELS: Record<OrderClass, string> = {
  CANCELLED: "Cancelled",
  DELIVERED: "Delivered",
  RTO: "RTO",
  LOST: "Lost",
  EXCHANGE: "Exchange",
  PLATFORM_FEE: "Platform Fee",
  CLAIM: "Claim Income",
  RETURN: "Return",
  UNKNOWN: "Unknown",
};
