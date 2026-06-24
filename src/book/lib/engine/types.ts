/**
 * Core domain types for the Tulmin Book engine.
 * Pure data — no UI imports allowed anywhere in /lib/engine.
 */

/** Order classes per the classification spec (Part 4). */
export type OrderClass =
  | "CANCELLED" // A
  | "DELIVERED" // B
  | "RTO" // C
  | "LOST" // D
  | "EXCHANGE" // E
  | "PLATFORM_FEE" // F — blank status + negative payout (not an order)
  | "CLAIM" // G — blank status + positive payout (claim/compensation income)
  | "RETURN" // H
  | "UNKNOWN"; // fell through every rule — surfaced in anomaly report

/** Row from the Order CSV (File A). Sub Order No is ALWAYS a string. */
export interface OrderRow {
  reason: string; // Reason for Credit Entry
  subOrderNo: string;
  catalogId: string;
  orderDate: string;
  orderSource: string; // non-blank ⇒ ad-attributed order
  customerState: string;
  productName: string;
  sku: string;
  size: string;
  quantity: number;
  listedPrice: number; // Supplier Listed Price (Incl. GST + Commission)
  discountedPrice: number; // Supplier Discounted Price (Incl GST and Commision) [sic]
  packetId: string; // blank for cancelled orders
  sourceFile?: string; // import file this order came from (for per-file delete)
  /**
   * True when ANY of this order's source rows carried a DOOR_STEP_EXCHANGED
   * reason. Survives canonical merge (where a DELIVERED+DOOR_STEP_EXCHANGED
   * collapse sets `reason` to DELIVERED and would otherwise lose the exchange
   * signal). Lets the reconciler detect an exchange-then-return — the customer
   * returned BOTH the original AND the replacement — from the order side even
   * when the only payment row is a final Return.
   */
  hadExchangeLeg?: boolean;
}

/** Row from the "Order Payments" sheet (File B). */
export interface PaymentRow {
  subOrderNo: string;
  transactionId: string; // Transaction ID — primary key for duplicate detection
  orderDate: string;
  dispatchDate: string;
  productName: string;
  sku: string; // Supplier SKU
  liveOrderStatus: string | null; // blank is MEANINGFUL (Classes F/G) — null, never ""
  finalSettlement: number; // Final Settlement Amount — the actual net cash
  quantity: number;
  totalSaleAmount: number;
  returnShippingCharge: number;
  tcs: number;
  tds: number;
  compensation: number;
  claims: number;
  recovery: number;
  paymentDate: string;
}

/** Row from the "Ads Cost" sheet. */
export interface AdsRow {
  deductionDuration: string;
  deductionDate: string;
  campaignId: string;
  adCost: number;
  totalAdsCost: number; // negative in source — deduction
}

/** Order + all its payment rows, merged on Sub Order No (string match). */
export interface MergedOrder {
  subOrderNo: string;
  order: OrderRow | null;
  payments: PaymentRow[];
}

/** Output of the classification engine for one merged record. */
export interface ClassifiedOrder {
  subOrderNo: string;
  orderClass: OrderClass;
  sku: string;
  productName: string;
  quantity: number;
  customerState: string;
  orderDate: string;
  orderSource: string;
  /** Sum of Final Settlement Amount across all payment rows for this Sub Order No. */
  settlement: number;
  /** Units that consume COGS (per class rules; returns depend on a toggle applied later). */
  cogsUnits: number;
  /** Net stock movement: negative = left inventory permanently. */
  inventoryDelta: number;
  /** Units that came back and await quality check before restock. */
  qcPendingUnits: number;
  /** True when the order row exists but no payment row was found. */
  paymentMissing: boolean;
  /** True when a payment row has no matching order row. */
  orderMissing: boolean;
  /** Exchange rows always need manual review; also set for odd cases. */
  needsReview: boolean;
  tcs: number;
  tds: number;
}

export interface PnlSettings {
  /** "Expense COGS on returns" toggle — default OFF (product comes back). */
  expenseCogsOnReturns: boolean;
}

/** SKU → unit cost in ₹, entered by the user. */
export type CogsMap = Record<string, number>;

export interface OrderPnl extends ClassifiedOrder {
  unitCost: number; // cogsMap[sku] ?? 0
  cogs: number;
  revenue: number;
  grossProfit: number;
}

export interface MonthlyPnl {
  income: {
    deliveredPayout: number; // Class B
    exchangePayout: number; // Class E (completed)
    claimIncome: number; // Class G
    lostCompensation: number; // Class D
    referralPayments: number;
    total: number;
  };
  expenses: {
    totalCogs: number;
    returnLegLosses: number; // negative settlements from C & H, as positive expense
    platformDeductions: number; // Class F, absolute value
    adsCost: number; // absolute value
    total: number;
  };
  netProfit: number;
  netMarginPct: number;
  recoverable: { tcs: number; tds: number };
  orderCounts: Record<OrderClass, number>;
}

export interface SkuPnlRow {
  sku: string;
  productName: string;
  totalOrders: number;
  delivered: number;
  rto: number;
  returns: number;
  cancelled: number;
  lost: number;
  exchanges: number;
  claims: number;
  netUnitsSold: number;
  netPayout: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  returnRatePct: number;
}

export interface InventoryRow {
  sku: string;
  productName: string;
  openingStock: number | null;
  unitsSold: number; // B + completed E
  unitsLost: number; // D
  unitsClaimLost: number; // G
  qcPending: number; // C + H + failed E
  closingStock: number | null; // null when opening stock not provided
}

export interface AdsSummary {
  totalSpend: number;
  adOrderCount: number;
  adOrderRevenue: number;
  adOrderProfit: number;
  organicOrderCount: number;
  organicRevenue: number;
  roas: number;
  adsNet: number; // profit from ad orders − ads spend
}

export type AlertLevel = "critical" | "warning" | "positive";

export interface Alert {
  level: AlertLevel;
  code: string;
  message: string;
  /** Optional supporting rows, e.g. Sub Order Nos. */
  details?: string[];
}

/** Everything computed for one uploaded month. */
export interface MonthData {
  label: string; // e.g. "2026-05" or user label
  orders: OrderPnl[];
  pnl: MonthlyPnl;
  skuTable: SkuPnlRow[];
  inventory: InventoryRow[];
  ads: AdsSummary;
  alerts: Alert[];
  adsRows: AdsRow[];
  referralTotal: number;
  uploadedAt: string;
}
