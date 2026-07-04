/**
 * India GST pack (Phase 7) — pure filing-support math on top of engine/gst.ts.
 *
 * Scope (operator-confirmed): regular scheme only. Everything here is a
 * WORKING SUMMARY — the UI must keep the "verify with your CA before filing"
 * disclaimer. No statutory percentage is hardcoded: rates ride on each item
 * (SKU.gstRate) and amounts are backed out of GST-inclusive B2C prices.
 *
 * GST state codes are reference identifiers (not rates) and are safe to ship.
 */
import { splitInclusiveGst } from "../engine/gst";
import { round2 } from "./journal";
import type { PaymentEvent } from "../engine";

// ── Place of supply ───────────────────────────────────────────────────

/** GST state codes (census codes used in GSTIN / GSTR place-of-supply). */
export const GST_STATE_CODES: Record<string, string> = {
  "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03",
  "chandigarh": "04", "uttarakhand": "05", "haryana": "06", "delhi": "07",
  "rajasthan": "08", "uttar pradesh": "09", "bihar": "10", "sikkim": "11",
  "arunachal pradesh": "12", "nagaland": "13", "manipur": "14", "mizoram": "15",
  "tripura": "16", "meghalaya": "17", "assam": "18", "west bengal": "19",
  "jharkhand": "20", "odisha": "21", "chhattisgarh": "22", "madhya pradesh": "23",
  "gujarat": "24", "dadra and nagar haveli and daman and diu": "26",
  "maharashtra": "27", "andhra pradesh": "37", "karnataka": "29", "goa": "30",
  "lakshadweep": "31", "kerala": "32", "tamil nadu": "33", "puducherry": "34",
  "andaman and nicobar islands": "35", "telangana": "36", "ladakh": "38",
};

const STATE_ALIASES: Record<string, string> = {
  "orissa": "odisha", "pondicherry": "puducherry", "nct of delhi": "delhi",
  "new delhi": "delhi", "uttaranchal": "uttarakhand", "bengaluru": "karnataka",
};

export function normalizeStateName(raw: string | undefined | null): string {
  const s = String(raw ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return STATE_ALIASES[s] ?? s;
}

export function gstStateCode(raw: string | undefined | null): string | null {
  return GST_STATE_CODES[normalizeStateName(raw)] ?? null;
}

export interface PlaceOfSupply {
  stateName: string;   // normalized buyer state ("unknown" when unresolvable)
  stateCode: string;   // "OT" when unknown
  interState: boolean; // unknown buyer state defaults to inter-state (IGST)
}

export function placeOfSupply(orgState: string | undefined, buyerState: string | undefined): PlaceOfSupply {
  const org = gstStateCode(orgState);
  const buyer = gstStateCode(buyerState);
  if (!buyer) return { stateName: "unknown", stateCode: "OT", interState: true };
  return {
    stateName: normalizeStateName(buyerState),
    stateCode: buyer,
    interState: org === null ? true : org !== buyer,
  };
}

/** Split a GST amount into CGST/SGST (intra) or IGST (inter). */
export function splitByPlace(gstAmount: number, interState: boolean): { cgst: number; sgst: number; igst: number } {
  if (interState) return { cgst: 0, sgst: 0, igst: round2(gstAmount) };
  const half = round2(gstAmount / 2);
  return { cgst: half, sgst: round2(gstAmount - half), igst: 0 };
}

// ── GSTR-1 (B2C through an e-commerce operator) ──────────────────────

export interface Gstr1SaleRow {
  buyerState: string | undefined;
  grossInclusive: number;  // customer-paid, GST-inclusive
  ratePct: number;
  qty?: number;
  hsn?: string;
  isReturn?: boolean;      // credit note — nets against sales
}

export interface Gstr1B2CRow {
  stateCode: string;
  stateName: string;
  ratePct: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  count: number;           // net document count (sales − returns)
}

/** Net B2C table by place-of-supply × rate; returns subtract. */
export function gstr1B2C(rows: Gstr1SaleRow[], orgState: string | undefined): Gstr1B2CRow[] {
  const by = new Map<string, Gstr1B2CRow>();
  for (const r of rows) {
    const pos = placeOfSupply(orgState, r.buyerState);
    const sign = r.isReturn ? -1 : 1;
    const { taxableValue, gstAmount } = splitInclusiveGst(Math.abs(r.grossInclusive), r.ratePct);
    const split = splitByPlace(gstAmount, pos.interState);
    const key = `${pos.stateCode}|${r.ratePct}`;
    const row = by.get(key) ?? {
      stateCode: pos.stateCode, stateName: pos.stateName, ratePct: r.ratePct,
      taxableValue: 0, igst: 0, cgst: 0, sgst: 0, count: 0,
    };
    row.taxableValue = round2(row.taxableValue + sign * taxableValue);
    row.igst = round2(row.igst + sign * split.igst);
    row.cgst = round2(row.cgst + sign * split.cgst);
    row.sgst = round2(row.sgst + sign * split.sgst);
    row.count += sign;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => a.stateCode.localeCompare(b.stateCode) || a.ratePct - b.ratePct);
}

// ── HSN summary (GSTR-1 table 12) ─────────────────────────────────────

export interface HsnSummaryRow {
  hsn: string;
  qty: number;
  taxableValue: number;
  gstAmount: number;
}

export function hsnSummary(rows: Gstr1SaleRow[]): HsnSummaryRow[] {
  const by = new Map<string, HsnSummaryRow>();
  for (const r of rows) {
    const hsn = (r.hsn ?? "").trim() || "(no HSN)";
    const sign = r.isReturn ? -1 : 1;
    const { taxableValue, gstAmount } = splitInclusiveGst(Math.abs(r.grossInclusive), r.ratePct);
    const row = by.get(hsn) ?? { hsn, qty: 0, taxableValue: 0, gstAmount: 0 };
    row.qty += sign * (r.qty ?? 1);
    row.taxableValue = round2(row.taxableValue + sign * taxableValue);
    row.gstAmount = round2(row.gstAmount + sign * gstAmount);
    by.set(hsn, row);
  }
  return [...by.values()].sort((a, b) => a.hsn.localeCompare(b.hsn));
}

// ── GSTR-3B working summary ───────────────────────────────────────────

export interface Gstr3bSummary {
  outwardTaxable: number;  // 3.1(a) taxable value
  igst: number;
  cgst: number;
  sgst: number;
  itc: number;             // 4(A) input tax credit (purchases + expenses GST)
  tcsCredit: number;       // marketplace GST-TCS (cash-ledger credit)
  netPayable: number;      // output − ITC (floor 0, informational)
}

export function gstr3b(b2c: Gstr1B2CRow[], itc: number, tcsCredit: number): Gstr3bSummary {
  const outwardTaxable = round2(b2c.reduce((s, r) => s + r.taxableValue, 0));
  const igst = round2(b2c.reduce((s, r) => s + r.igst, 0));
  const cgst = round2(b2c.reduce((s, r) => s + r.cgst, 0));
  const sgst = round2(b2c.reduce((s, r) => s + r.sgst, 0));
  const output = round2(igst + cgst + sgst);
  return {
    outwardTaxable, igst, cgst, sgst,
    itc: round2(itc),
    tcsCredit: round2(tcsCredit),
    netPayable: Math.max(0, round2(output - itc)),
  };
}

// ── TCS / TDS credit ledgers (per marketplace) ────────────────────────

export interface TcsTdsLedgerRow {
  month: string;      // YYYY-MM (payment-date basis)
  marketplace: string;
  tcs: number;
  tds: number;
  cumTcs: number;
  cumTds: number;
}

/**
 * Monthly GST-TCS and income-tax-TDS withheld by the marketplace, with
 * running cumulative credits — what should appear in the GST cash ledger /
 * 26AS to be claimed back. Payment-date basis (falls back to monthBucket).
 */
export function tcsTdsLedger(events: PaymentEvent[], marketplace = "Meesho"): TcsTdsLedgerRow[] {
  const by = new Map<string, { tcs: number; tds: number }>();
  for (const e of events) {
    const m = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
    if (!m) continue;
    const row = by.get(m) ?? { tcs: 0, tds: 0 };
    row.tcs = round2(row.tcs + (e.tcs || 0));
    row.tds = round2(row.tds + (e.tds || 0));
    by.set(m, row);
  }
  const months = [...by.keys()].sort();
  let cumTcs = 0, cumTds = 0;
  return months.map((month) => {
    const r = by.get(month)!;
    cumTcs = round2(cumTcs + r.tcs);
    cumTds = round2(cumTds + r.tds);
    return { month, marketplace, tcs: r.tcs, tds: r.tds, cumTcs, cumTds };
  });
}
