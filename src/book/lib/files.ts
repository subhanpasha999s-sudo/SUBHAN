/**
 * Browser-side file decoding. Files are parsed entirely client-side
 * (SheetJS + PapaParse) — they never leave the browser in MVP mode.
 * PHASE2: optional server-side parsing for files uploaded to Supabase storage.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  AdsRow,
  OrderRow,
  ParseError,
  ParseReport,
  PaymentRow,
  parseAdsRows,
  parseOrderRows,
  parsePaymentRows,
  parseReferralTotal,
} from "./engine";

/** Fresh per-import skip accounting (so dropped rows are reported, not silent). */
function newReport(): ParseReport {
  return { skippedNoKey: 0, skippedBadValue: 0 };
}

export interface PaymentFileResult {
  paymentRows: PaymentRow[];
  adsRows: AdsRow[];
  referralTotal: number;
  sheetNames: string[];
}

export async function decodeOrderCsv(file: File, report?: ParseReport): Promise<OrderRow[]> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (result.errors.length && !result.data.length) {
    throw new ParseError("Couldn't read this CSV file. Is it a valid Meesho order export?");
  }
  return parseOrderRows(result.data as unknown[][], report);
}

function sheetToRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  // raw:true keeps numbers as numbers; defval:"" keeps row shapes rectangular
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
}

/** Find a sheet by fuzzy name (Meesho occasionally tweaks casing/spacing). */
function findSheet(wb: XLSX.WorkBook, want: string): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return wb.SheetNames.find((n) => norm(n) === norm(want)) ??
    wb.SheetNames.find((n) => norm(n).includes(norm(want))) ?? null;
}

function decodePaymentWorkbook(wb: XLSX.WorkBook, report?: ParseReport): PaymentFileResult {
  const orderPaymentsSheet = findSheet(wb, "Order Payments");
  if (!orderPaymentsSheet) {
    throw new ParseError(
      "This doesn't look like a Meesho payment file — expected sheet 'Order Payments'."
    );
  }
  const paymentRows = parsePaymentRows(sheetToRows(wb, orderPaymentsSheet), report);

  const adsSheet = findSheet(wb, "Ads Cost");
  const adsRows = adsSheet ? parseAdsRows(sheetToRows(wb, adsSheet)) : [];

  const referralSheet = findSheet(wb, "Referral Payments");
  const referralTotal = referralSheet
    ? parseReferralTotal(sheetToRows(wb, referralSheet))
    : 0;

  return { paymentRows, adsRows, referralTotal, sheetNames: wb.SheetNames };
}

export async function decodePaymentXlsx(file: File): Promise<PaymentFileResult> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch {
    throw new ParseError("Couldn't read this Excel file — it may be corrupted.");
  }
  return decodePaymentWorkbook(wb);
}

/**
 * Content-based file detection. Meesho's payment export is an XLSX workbook with
 * an "Order Payments" sheet; the order export is a CSV. But sellers sometimes
 * save the ORDER file as XLSX too — detecting purely by extension then misroutes
 * it to the payment parser (imports zero orders → nothing reconciles). So we
 * look at the actual content: a workbook with an "Order Payments" sheet is a
 * payment file; anything else is parsed as orders (CSV, or the first XLSX sheet
 * whose headers resolve the order columns).
 */
export type DecodedMeeshoFile =
  | { kind: "orders"; orderRows: OrderRow[]; report: ParseReport }
  | { kind: "payments"; payment: PaymentFileResult; report: ParseReport };

export async function decodeMeeshoFile(file: File): Promise<DecodedMeeshoFile> {
  const name = file.name.toLowerCase();
  const report = newReport();

  if (name.endsWith(".csv")) {
    return { kind: "orders", orderRows: await decodeOrderCsv(file, report), report };
  }

  // XLSX/XLS — decide by content.
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch {
    throw new ParseError("Couldn't read this Excel file — it may be corrupted.");
  }

  if (findSheet(wb, "Order Payments")) {
    return { kind: "payments", payment: decodePaymentWorkbook(wb, report), report };
  }

  // No payment sheet → an order export saved as XLSX. Find the sheet whose
  // headers resolve the order columns (usually the first/only one).
  for (const sheetName of wb.SheetNames) {
    try {
      const orderRows = parseOrderRows(sheetToRows(wb, sheetName), report);
      if (orderRows.length) return { kind: "orders", orderRows, report };
    } catch {
      /* try the next sheet */
    }
  }
  throw new ParseError(
    "Couldn't recognize this file — upload a Meesho order export (CSV/XLSX) or a payment XLSX with an 'Order Payments' sheet."
  );
}
