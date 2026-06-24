/**
 * Fuzzy header matcher.
 *
 * Meesho changes column headers between exports (case, spacing, punctuation,
 * and spelling — e.g. "Commision" vs "Commission"), so we never match raw
 * strings. Every header is normalized, then resolved through an explicit
 * variant table first and a contains-style fallback second.
 */

/** lowercase, trim, collapse whitespace, strip punctuation. */
export function normalizeHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s%]/gu, " ") // strip punctuation, keep % (it disambiguates)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical field → known normalized variants from real Meesho exports.
 * First entry is the canonical current header. Add new variants here as
 * Meesho mutates its exports.
 */
const ORDER_FILE_VARIANTS: Record<string, string[]> = {
  reason: ["reason for credit entry", "reason for credit"],
  subOrderNo: ["sub order no", "sub order number", "suborder no"],
  catalogId: ["catalog id", "catalogue id"],
  orderDate: ["order date"],
  orderSource: ["order source"],
  customerState: ["customer state", "state"],
  productName: ["product name"],
  sku: ["sku", "supplier sku"],
  size: ["size", "variation"],
  quantity: ["quantity", "qty"],
  listedPrice: [
    "supplier listed price incl gst commission",
    "supplier listed price incl gst commision",
    "supplier listed price",
  ],
  discountedPrice: [
    // note Meesho's misspelling "commision" — match both spellings
    "supplier discounted price incl gst and commision",
    "supplier discounted price incl gst and commission",
    "supplier discounted price",
  ],
  packetId: ["packet id"],
};

const PAYMENT_SHEET_VARIANTS: Record<string, string[]> = {
  subOrderNo: ["sub order no", "sub order number", "suborder no"],
  transactionId: ["transaction id", "txn id", "transaction no"],
  orderDate: ["order date"],
  dispatchDate: ["dispatch date"],
  productName: ["product name"],
  sku: ["supplier sku", "sku"],
  liveOrderStatus: ["live order status", "order status"],
  finalSettlement: ["final settlement amount", "final settlement"],
  quantity: ["quantity", "qty"],
  totalSaleAmount: [
    "total sale amount incl shipping gst",
    "total sale amount incl shipping and gst",
    "total sale amount",
  ],
  returnShippingCharge: ["return shipping charge incl gst"],
  tcs: ["tcs"],
  tds: ["tds"],
  compensation: ["compensation"],
  claims: ["claims"],
  recovery: ["recovery"],
  paymentDate: ["payment date"],
};

const ADS_SHEET_VARIANTS: Record<string, string[]> = {
  deductionDuration: ["deduction duration"],
  deductionDate: ["deduction date"],
  campaignId: ["campaign id"],
  adCost: ["ad cost"],
  totalAdsCost: [
    "total ads cost",
    "ad cost incl credits waivers discounts gst",
    "total ad cost",
  ],
};

export type FieldMap = Record<string, number>; // canonical field → column index

function buildMap(
  headers: string[],
  variants: Record<string, string[]>
): FieldMap {
  const normalized = headers.map(normalizeHeader);
  const map: FieldMap = {};
  for (const [field, names] of Object.entries(variants)) {
    // pass 1 — exact normalized match, honoring variant priority order
    let idx = -1;
    for (const v of names) {
      idx = normalized.indexOf(v);
      if (idx !== -1) break;
    }
    // pass 2 — fallback: header starts with the variant (Meesho appends
    // qualifiers like "(Incl. GST)" over time). Skip already-claimed columns.
    if (idx === -1) {
      const claimed = new Set(Object.values(map));
      for (const v of names) {
        idx = normalized.findIndex(
          (h, i) => !claimed.has(i) && h.startsWith(v)
        );
        if (idx !== -1) break;
      }
    }
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

export function mapOrderHeaders(headers: string[]): FieldMap {
  return buildMap(headers, ORDER_FILE_VARIANTS);
}
export function mapPaymentHeaders(headers: string[]): FieldMap {
  return buildMap(headers, PAYMENT_SHEET_VARIANTS);
}
export function mapAdsHeaders(headers: string[]): FieldMap {
  return buildMap(headers, ADS_SHEET_VARIANTS);
}

/** Fields that must resolve for a file to be accepted as valid. */
export const REQUIRED_ORDER_FIELDS = ["reason", "subOrderNo", "sku", "quantity"];
export const REQUIRED_PAYMENT_FIELDS = ["subOrderNo", "finalSettlement"];
