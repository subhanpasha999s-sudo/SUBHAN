/**
 * Marketplace pack framework (Phase 9, spec §7.6).
 *
 * A "pack" describes one marketplace's ingestion + reconciliation contract:
 * accepted file formats, the deduction taxonomy, capability flags, and (for a
 * live pack) the pure row parsers. The MEESHO pack is pack #1 — it is a thin,
 * NON-INVASIVE wrapper over the existing, golden-mastered engine functions
 * (docs/MEESHO_RULES.md). It changes no behavior; it only names the extension
 * point so Flipkart / Amazon can plug in later without touching Meesho code.
 */
import {
  parseOrderRows, parsePaymentRows,
  type OrderRow, type PaymentRow, type ParseReport,
} from "../engine";

/** One recognized settlement deduction/credit type in a marketplace payout. */
export interface DeductionType {
  code: string;
  label: string;
  /** How the line affects the seller: a deduction reduces the payout. */
  effect: "deduction" | "credit" | "withholding";
}

export interface MarketplacePack {
  id: string;                 // stable slug, e.g. "meesho"
  label: string;              // display name
  status: "live" | "planned";
  /** Human descriptions of accepted import files (byte-for-byte contract). */
  fileFormats: string[];
  deductionTaxonomy: DeductionType[];
  capabilities: {
    orderImport: boolean;
    settlementReconciliation: boolean;
    returns: boolean;
    ads: boolean;
    multiAccount: boolean;    // multiple seller accounts per org
  };
  /** Pure parsers — present only for a live pack. */
  parseOrders?: (rows: unknown[][], report?: ParseReport) => OrderRow[];
  parsePayments?: (rows: unknown[][], report?: ParseReport) => PaymentRow[];
}

/** The taxonomy Meesho's payout file exposes (see MEESHO_RULES §4). */
export const MEESHO_DEDUCTIONS: DeductionType[] = [
  { code: "PLATFORM_FEE", label: "Platform / affiliate fee", effect: "deduction" },
  { code: "RETURN_SHIPPING", label: "Return shipping charge", effect: "deduction" },
  { code: "RECOVERY", label: "Recovery / penalty", effect: "deduction" },
  { code: "TCS", label: "GST TCS withheld", effect: "withholding" },
  { code: "TDS", label: "Income-tax TDS withheld", effect: "withholding" },
  { code: "CLAIMS", label: "Claims / compensation", effect: "credit" },
  { code: "COMPENSATION", label: "Compensation", effect: "credit" },
];

export const MEESHO_PACK: MarketplacePack = {
  id: "meesho",
  label: "Meesho",
  status: "live",
  fileFormats: [
    "Order export — CSV (or XLSX)",
    "Payment export — XLSX with an 'Order Payments' sheet (+ optional 'Ads Cost', 'Referral Payments')",
  ],
  deductionTaxonomy: MEESHO_DEDUCTIONS,
  capabilities: { orderImport: true, settlementReconciliation: true, returns: true, ads: true, multiAccount: true },
  parseOrders: parseOrderRows,
  parsePayments: parsePaymentRows,
};

/** Planned packs (interface scaffolded; no parsing yet). Operator: Meesho → Flipkart → Amazon. */
export const FLIPKART_PACK: MarketplacePack = {
  id: "flipkart", label: "Flipkart", status: "planned",
  fileFormats: ["Seller settlement report (planned)"],
  deductionTaxonomy: [
    { code: "COMMISSION", label: "Marketplace commission", effect: "deduction" },
    { code: "SHIPPING_FEE", label: "Shipping fee", effect: "deduction" },
    { code: "COLLECTION_FEE", label: "Collection fee", effect: "deduction" },
    { code: "TCS", label: "GST TCS withheld", effect: "withholding" },
    { code: "TDS", label: "Income-tax TDS withheld", effect: "withholding" },
  ],
  capabilities: { orderImport: true, settlementReconciliation: true, returns: true, ads: false, multiAccount: true },
};

export const AMAZON_PACK: MarketplacePack = {
  id: "amazon", label: "Amazon", status: "planned",
  fileFormats: ["Seller Central settlement report (planned)"],
  deductionTaxonomy: [
    { code: "REFERRAL_FEE", label: "Referral fee", effect: "deduction" },
    { code: "FBA_FEE", label: "FBA / fulfilment fee", effect: "deduction" },
    { code: "CLOSING_FEE", label: "Closing fee", effect: "deduction" },
    { code: "TCS", label: "GST TCS withheld", effect: "withholding" },
    { code: "TDS", label: "Income-tax TDS withheld", effect: "withholding" },
  ],
  capabilities: { orderImport: true, settlementReconciliation: true, returns: true, ads: true, multiAccount: true },
};

export const MARKETPLACE_PACKS: MarketplacePack[] = [MEESHO_PACK, FLIPKART_PACK, AMAZON_PACK];

export function getPack(id: string): MarketplacePack | undefined {
  return MARKETPLACE_PACKS.find((p) => p.id === id);
}

export function livePacks(): MarketplacePack[] {
  return MARKETPLACE_PACKS.filter((p) => p.status === "live");
}

export class PackNotLiveError extends Error {}

/** Parse order rows through a pack; throws for a planned pack. */
export function packParseOrders(pack: MarketplacePack, rows: unknown[][], report?: ParseReport): OrderRow[] {
  if (pack.status !== "live" || !pack.parseOrders) {
    throw new PackNotLiveError(`${pack.label} import is not available yet.`);
  }
  return pack.parseOrders(rows, report);
}

/** Parse payment rows through a pack; throws for a planned pack. */
export function packParsePayments(pack: MarketplacePack, rows: unknown[][], report?: ParseReport): PaymentRow[] {
  if (pack.status !== "live" || !pack.parsePayments) {
    throw new PackNotLiveError(`${pack.label} import is not available yet.`);
  }
  return pack.parsePayments(rows, report);
}
