/**
 * V2 INVENTORY ENGINE (spec Part 5).
 *
 * Stock is never stored — always SUM(quantity_delta) over the ledger.
 *
 * Physical model: a unit leaves sellable stock when it ships (SALE_OUT /
 * EXCHANGE_OUT at dispatch) and re-enters ONLY via QC_PASS. Returned units
 * (RTO_IN / RETURN_IN / EXCHANGE_IN) are 0-delta traceability rows that open
 * a QC queue entry — pending-QC units are not sellable and not in stock.
 * LOST / CLAIM_LOSS are 0-delta markers (the OUT already happened at dispatch).
 */
import { OrderClass, OrderRow } from "./types";
import { resolveSku, SkuMapEntry } from "./skuMap";

export type LedgerEventType =
  | "PURCHASE_IN" | "SALE_OUT" | "RTO_IN" | "RETURN_IN" | "EXCHANGE_OUT"
  | "EXCHANGE_IN" | "LOST" | "CLAIM_LOSS" | "QC_PASS" | "QC_FAIL"
  | "ADJUSTMENT" | "LABEL_PRINTED";

export interface LedgerEvent {
  skuCode: string;
  eventType: LedgerEventType;
  quantityDelta: number;
  refType: "order" | "purchase" | "return" | "manual" | "label";
  refId: string;
  condition?: "SELLABLE" | "DAMAGED" | "DAMAGED_REPAIRABLE" | "MISMATCH";
  notes?: string;
  createdAt: string; // ISO
}

export interface QueueEntry {
  subOrderNo: string;
  skuCode: string;
  returnType: "RTO" | "CUSTOMER_RETURN" | "EXCHANGE_RETURN";
}

/** current_stock(sku) = SUM(quantity_delta) */
export function currentStock(ledger: LedgerEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of ledger) {
    map.set(e.skuCode, (map.get(e.skuCode) ?? 0) + e.quantityDelta);
  }
  return map;
}

/**
 * Derive ledger events + QC queue entries from a classified order.
 * Idempotent by construction upstream: callers only invoke this for orders
 * whose class CHANGED (or that are new), and ref_id ties events to the order.
 */
export interface LedgerDerivationOpts {
  /**
   * Exchange-then-return lifecycle (Delivered → Exchange → Return): the
   * customer returned BOTH the original unit and the shipped replacement, so
   * the EXCHANGE class opens TWO QC entries and two return legs instead of one.
   */
  exchangeThenReturn?: boolean;
}

export function ledgerEventsForOrder(
  order: OrderRow,
  orderClass: OrderClass,
  at: string,
  opts: LedgerDerivationOpts = {}
): { events: LedgerEvent[]; queue: QueueEntry[] } {
  const base = {
    skuCode: order.sku,
    refType: "order" as const,
    refId: order.subOrderNo,
    createdAt: at,
  };
  const qty = order.quantity;
  const events: LedgerEvent[] = [];
  const queue: QueueEntry[] = [];

  if (orderClass === "CANCELLED" || orderClass === "PLATFORM_FEE" || orderClass === "UNKNOWN") {
    return { events, queue }; // never left the warehouse / not an order
  }

  // Exchange-then-return (Delivered → Exchange → Return): TWO physical units
  // moved over the lifecycle and BOTH came back — the original delivered unit
  // (returned when the exchange was requested) and the exchange replacement
  // (returned after it was delivered). This is true regardless of the resolved
  // class (which is RETURN once the last payout status is Return), so it is
  // handled before the per-class switch. Net stock −2; two independent QC legs.
  if (opts.exchangeThenReturn) {
    events.push({ ...base, eventType: "SALE_OUT", quantityDelta: -qty }); // original dispatched
    events.push({ ...base, eventType: "EXCHANGE_OUT", quantityDelta: -qty, notes: "replacement unit dispatched" });
    // Return 1 — the original delivered unit comes back.
    events.push({ ...base, eventType: "RETURN_IN", quantityDelta: 0, notes: "original unit returned (exchange→return)" });
    queue.push({ subOrderNo: order.subOrderNo, skuCode: order.sku, returnType: "CUSTOMER_RETURN" });
    // Return 2 — the shipped exchange replacement also comes back.
    events.push({ ...base, eventType: "EXCHANGE_IN", quantityDelta: 0, notes: "exchange replacement returned" });
    queue.push({ subOrderNo: order.subOrderNo, skuCode: order.sku, returnType: "EXCHANGE_RETURN" });
    return { events, queue };
  }

  // every shipped order leaves stock at dispatch
  events.push({ ...base, eventType: "SALE_OUT", quantityDelta: -qty });

  switch (orderClass) {
    case "DELIVERED":
      break; // stays out — sold
    case "LOST":
      events.push({ ...base, eventType: "LOST", quantityDelta: 0, notes: "unit lost in transit" });
      break;
    case "CLAIM":
      events.push({ ...base, eventType: "CLAIM_LOSS", quantityDelta: 0, notes: "claim-loss unit (sunk)" });
      break;
    case "RTO":
      events.push({ ...base, eventType: "RTO_IN", quantityDelta: 0 });
      queue.push({ subOrderNo: order.subOrderNo, skuCode: order.sku, returnType: "RTO" });
      break;
    case "RETURN":
      events.push({ ...base, eventType: "RETURN_IN", quantityDelta: 0 });
      queue.push({ subOrderNo: order.subOrderNo, skuCode: order.sku, returnType: "CUSTOMER_RETURN" });
      break;
    case "EXCHANGE":
      // completed exchange: replacement ships out, the original comes back to QC
      events.push({ ...base, eventType: "EXCHANGE_OUT", quantityDelta: -qty, notes: "replacement unit dispatched" });
      events.push({ ...base, eventType: "EXCHANGE_IN", quantityDelta: 0 });
      queue.push({ subOrderNo: order.subOrderNo, skuCode: order.sku, returnType: "EXCHANGE_RETURN" });
      break;
  }
  return { events, queue };
}

/**
 * Map-aware ledger derivation (V3). Resolves the order's listing SKU through
 * the sku_map into one or more inventory SKUs, scaling movement by bundle
 * quantity. Unmapped listing SKUs produce NO ledger/queue rows and are
 * reported via `unmapped` so the caller routes them to the tray (P&L still
 * counts them — that path is independent of inventory).
 */
export function ledgerEventsForOrderMapped(
  order: OrderRow,
  orderClass: OrderClass,
  at: string,
  map: Map<string, SkuMapEntry>,
  opts: LedgerDerivationOpts = {}
): { events: LedgerEvent[]; queue: QueueEntry[]; unmapped: boolean } {
  const resolution = resolveSku(order.sku, map);
  if (!resolution.mapped) {
    return { events: [], queue: [], unmapped: true };
  }
  const events: LedgerEvent[] = [];
  const queue: QueueEntry[] = [];
  for (const comp of resolution.components) {
    // re-run the single-SKU derivation as if this inventory SKU were sold,
    // scaled by the bundle quantity-per-unit
    const scaled: OrderRow = {
      ...order,
      sku: comp.inventorySku,
      quantity: order.quantity * comp.qtyPerUnit,
    };
    const { events: e, queue: q } = ledgerEventsForOrder(scaled, orderClass, at, opts);
    events.push(...e);
    queue.push(...q);
  }
  return { events, queue, unmapped: false };
}

/** QC decision → ledger event. Pass restocks; fail is a write-off. */
export type QcResult = "SELLABLE" | "DAMAGED" | "DAMAGED_REPAIRABLE" | "MISMATCH";

/**
 * QC decision → ledger event (V4 §7, four outcomes):
 *  SELLABLE          → QC_PASS, +stock (restocked)
 *  DAMAGED           → QC_FAIL, write-off / loss (no restock)
 *  DAMAGED_REPAIRABLE→ QC_FAIL, held in a repairable bucket (no restock, not a loss)
 *  MISMATCH          → QC_FAIL, flag for a Meesho claim
 */
export function qcDecisionEvent(
  skuCode: string,
  subOrderNo: string,
  result: QcResult,
  qty: number,
  at: string,
  notes = ""
): LedgerEvent {
  if (result === "SELLABLE") {
    return {
      skuCode, eventType: "QC_PASS", quantityDelta: qty,
      refType: "return", refId: subOrderNo, condition: "SELLABLE", notes, createdAt: at,
    };
  }
  return {
    skuCode, eventType: "QC_FAIL", quantityDelta: 0,
    refType: "return", refId: subOrderNo,
    condition: result, notes, createdAt: at,
  };
}

// ── Weighted-average COGS (spec 5.1) ────────────────────────────────

export function weightedAvgCogs(
  stockOnHand: number,
  currentCogs: number,
  purchaseQty: number,
  unitCost: number
): number {
  const stock = Math.max(0, stockOnHand); // negative stock must not poison the average
  const total = stock + purchaseQty;
  if (total <= 0) return currentCogs;
  return Math.round(((stock * currentCogs + purchaseQty * unitCost) / total) * 100) / 100;
}

// ── Stock intelligence (spec 5.5) ───────────────────────────────────

export interface SkuMeta {
  skuCode: string;
  productName: string;
  currentCogs: number;
  reorderLevel: number;
}

export interface StockIntelRow {
  skuCode: string;
  productName: string;
  stock: number;
  reorderLevel: number;
  needsReorder: boolean;
  avgDailySales: number; // last 30 days
  daysOfStock: number | null; // null when no sales velocity
  deadStock: boolean; // stock > 0, zero sales in 60 days
  valuation: number; // stock × COGS
}

function daysAgo(now: Date, iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (now.getTime() - d.getTime()) / 86_400_000;
}

export function stockIntelligence(
  skus: SkuMeta[],
  ledger: LedgerEvent[],
  now: Date = new Date()
): { rows: StockIntelRow[]; totalValuation: number } {
  const stock = currentStock(ledger);
  const sales30 = new Map<string, number>();
  const sales60 = new Map<string, number>();
  for (const e of ledger) {
    if (e.eventType !== "SALE_OUT" && e.eventType !== "EXCHANGE_OUT") continue;
    const age = daysAgo(now, e.createdAt);
    const units = -e.quantityDelta;
    if (age <= 30) sales30.set(e.skuCode, (sales30.get(e.skuCode) ?? 0) + units);
    if (age <= 60) sales60.set(e.skuCode, (sales60.get(e.skuCode) ?? 0) + units);
  }

  const rows = skus.map((s) => {
    const st = stock.get(s.skuCode) ?? 0;
    const avgDaily = (sales30.get(s.skuCode) ?? 0) / 30;
    return {
      skuCode: s.skuCode,
      productName: s.productName,
      stock: st,
      reorderLevel: s.reorderLevel,
      needsReorder: st <= s.reorderLevel && s.reorderLevel > 0,
      avgDailySales: avgDaily,
      daysOfStock: avgDaily > 0 ? Math.floor(st / avgDaily) : null,
      deadStock: st > 0 && (sales60.get(s.skuCode) ?? 0) === 0,
      valuation: st > 0 ? st * s.currentCogs : 0,
    };
  });
  return {
    rows,
    totalValuation: rows.reduce((sum, r) => sum + r.valuation, 0),
  };
}
