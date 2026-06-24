/**
 * File-shape parsers. They take raw row arrays (string[][] / any[][]) so the
 * engine stays free of PapaParse / SheetJS imports — the UI layer does the
 * byte-level decoding and hands rows in.
 */
import {
  mapAdsHeaders,
  mapOrderHeaders,
  mapPaymentHeaders,
  REQUIRED_ORDER_FIELDS,
  REQUIRED_PAYMENT_FIELDS,
  FieldMap,
} from "./headerMatcher";
import { toNum, toStatus, toStr } from "./num";
import { AdsRow, OrderRow, PaymentRow } from "./types";

export class ParseError extends Error {}

/**
 * Per-import accounting so dropped rows are NEVER silent. `skippedNoKey` =
 * blank Sub Order No (banner/blank rows — not data). `skippedBadValue` = a row
 * that HAD a Sub Order No but was dropped because a required numeric field
 * (settlement) wasn't numeric — these are surfaced to the user as a warning.
 */
export interface ParseReport {
  skippedNoKey: number;
  skippedBadValue: number;
}

function cell(row: unknown[], map: FieldMap, field: string): unknown {
  const idx = map[field];
  return idx === undefined ? undefined : row[idx];
}

/**
 * Find the real header row. Meesho prepends a variable number of preamble rows
 * (a "Table 1" title, group banners like "Order Related Details", …) that drift
 * between exports, so we never assume a fixed header position — we scan the
 * first few rows for the one that actually resolves the required fields.
 */
function findHeaderRow(
  rows: unknown[][],
  mapHeaders: (headers: string[]) => FieldMap,
  required: string[],
  maxScan = 10
): { headerIdx: number; map: FieldMap } | null {
  const limit = Math.min(maxScan, rows.length);
  for (let i = 0; i < limit; i++) {
    const map = mapHeaders((rows[i] ?? []).map(toStr));
    if (required.every((f) => map[f] !== undefined)) return { headerIdx: i, map };
  }
  return null;
}

/** Order CSV: header row is row 1 (index 0), data follows. */
export function parseOrderRows(rows: unknown[][], report?: ParseReport): OrderRow[] {
  if (!rows.length) throw new ParseError("Order file is empty.");
  const found = findHeaderRow(rows, mapOrderHeaders, REQUIRED_ORDER_FIELDS);
  if (!found) {
    const probe = mapOrderHeaders((rows[0] ?? []).map(toStr));
    const missing = REQUIRED_ORDER_FIELDS.filter((f) => probe[f] === undefined);
    throw new ParseError(
      `This doesn't look like a Meesho order file — couldn't find column(s): ${missing.join(", ")}.`
    );
  }
  const { headerIdx, map } = found;
  const out: OrderRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const subOrderNo = toStr(cell(r, map, "subOrderNo"));
    if (!subOrderNo) { if (report) report.skippedNoKey++; continue; } // blank/trailing rows
    out.push({
      reason: toStr(cell(r, map, "reason")).toUpperCase(),
      subOrderNo,
      catalogId: toStr(cell(r, map, "catalogId")),
      orderDate: toStr(cell(r, map, "orderDate")),
      orderSource: toStr(cell(r, map, "orderSource")),
      customerState: toStr(cell(r, map, "customerState")),
      productName: toStr(cell(r, map, "productName")),
      sku: toStr(cell(r, map, "sku")),
      size: toStr(cell(r, map, "size")),
      quantity: toNum(cell(r, map, "quantity")) || 1,
      listedPrice: toNum(cell(r, map, "listedPrice")),
      discountedPrice: toNum(cell(r, map, "discountedPrice")),
      packetId: toStr(cell(r, map, "packetId")),
    });
  }
  return out;
}

/**
 * "Order Payments" sheet:
 *   row 0 = section title, row 1 = headers, row 2 = formula legend (SKIP),
 *   data from row 3 (0-indexed).
 */
export function parsePaymentRows(rows: unknown[][], report?: ParseReport): PaymentRow[] {
  if (rows.length < 2) {
    throw new ParseError(
      "This doesn't look like a Meesho payment file — expected sheet 'Order Payments'."
    );
  }
  const found = findHeaderRow(rows, mapPaymentHeaders, REQUIRED_PAYMENT_FIELDS);
  if (!found) {
    // best-effort missing-columns message from the most likely header row
    const probe = mapPaymentHeaders((rows[1] ?? []).map(toStr));
    const missing = REQUIRED_PAYMENT_FIELDS.filter((f) => probe[f] === undefined);
    throw new ParseError(
      `Payment sheet is missing column(s): ${missing.join(", ")}. Expected Meesho's "Order Payments" headers (e.g. Sub Order No, Final Settlement Amount).`
    );
  }
  const { headerIdx, map } = found;
  const isNum = (v: unknown) =>
    Number.isFinite(parseFloat(String(v ?? "").replace(/[₹,\s]/g, "")));
  const out: PaymentRow[] = [];
  // Data starts after the header row. The row right after the headers is
  // Meesho's formula legend ("A", "B + C", …) — it has a non-numeric Final
  // Settlement Amount, so it (and any banner row) is skipped here. Real payout
  // rows always carry a numeric settlement, so this never drops actual data.
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const subOrderNo = toStr(cell(r, map, "subOrderNo"));
    if (!subOrderNo) { if (report) report.skippedNoKey++; continue; }
    if (!isNum(cell(r, map, "finalSettlement"))) { if (report) report.skippedBadValue++; continue; } // legend / banner / malformed
    out.push({
      subOrderNo,
      transactionId: toStr(cell(r, map, "transactionId")),
      orderDate: toStr(cell(r, map, "orderDate")),
      dispatchDate: toStr(cell(r, map, "dispatchDate")),
      productName: toStr(cell(r, map, "productName")),
      sku: toStr(cell(r, map, "sku")),
      liveOrderStatus: toStatus(cell(r, map, "liveOrderStatus")),
      finalSettlement: toNum(cell(r, map, "finalSettlement")),
      quantity: toNum(cell(r, map, "quantity")) || 1,
      totalSaleAmount: toNum(cell(r, map, "totalSaleAmount")),
      returnShippingCharge: toNum(cell(r, map, "returnShippingCharge")),
      tcs: toNum(cell(r, map, "tcs")),
      tds: toNum(cell(r, map, "tds")),
      compensation: toNum(cell(r, map, "compensation")),
      claims: toNum(cell(r, map, "claims")),
      recovery: toNum(cell(r, map, "recovery")),
      paymentDate: toStr(cell(r, map, "paymentDate")),
    });
  }
  return out;
}

/** "Ads Cost" sheet — same title/header/legend layout as Order Payments. */
export function parseAdsRows(rows: unknown[][]): AdsRow[] {
  if (rows.length < 2) return [];
  // Empty months contain "No data is available for these dates."
  if (rows.some((r) => toStr(r?.[0]).toLowerCase().startsWith("no data is available"))) {
    return [];
  }
  const found = findHeaderRow(rows, mapAdsHeaders, ["totalAdsCost"]);
  if (!found) return [];
  const { headerIdx, map } = found;
  const isNum = (v: unknown) =>
    Number.isFinite(parseFloat(String(v ?? "").replace(/[₹,\s]/g, "")));
  const out: AdsRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => toStr(c) === "")) continue;
    // skip the formula-legend row right after the headers ("A", "B", "(A + B)")
    if (!isNum(cell(r, map, "adCost")) && !isNum(cell(r, map, "totalAdsCost"))) continue;
    out.push({
      deductionDuration: toStr(cell(r, map, "deductionDuration")),
      deductionDate: toStr(cell(r, map, "deductionDate")),
      campaignId: toStr(cell(r, map, "campaignId")),
      adCost: toNum(cell(r, map, "adCost")),
      totalAdsCost: toNum(cell(r, map, "totalAdsCost")),
    });
  }
  return out;
}

/**
 * "Referral Payments" sheet → total referral income.
 * Often just "No data is available for these dates."
 */
export function parseReferralTotal(rows: unknown[][]): number {
  if (rows.length < 4) return 0;
  if (rows.some((r) => toStr(r?.[0]).toLowerCase().startsWith("no data is available"))) {
    return 0;
  }
  const headers = (rows[1] ?? []).map(toStr);
  // find an amount-ish column; referral sheets vary, so be permissive
  let col = headers.findIndex((h) => /amount|payment|payout/i.test(h));
  if (col === -1) col = headers.length - 1;
  let total = 0;
  for (let i = 3; i < rows.length; i++) total += toNum(rows[i]?.[col]);
  return total;
}
