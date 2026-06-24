/**
 * Bank statement file parser. Supported formats:
 *   Tabular (column-mapped): CSV, TSV, XLS/XLSX, and pasted text.
 *   Structured (auto-parsed): OFX 1.x (SGML), OFX 2.x/QFX (XML),
 *                             QIF (Quicken), CAMT.053/.054 (ISO 20022 XML).
 * Returns normalized ParsedBankTxn[] ready for staging.
 */
import * as XLSX from "xlsx";

export interface ParsedBankTxn {
  id: string;
  txnDate: string;       // YYYY-MM-DD
  description: string;
  debit: number;         // money out (always positive, 0 if credit)
  credit: number;        // money in (always positive, 0 if debit)
  bankTxnId?: string;    // OFX FITID / CAMT ref — used for dedup
}

export interface SkippedRow {
  rowIndex: number;
  reason: string;
}

export type BankFormat = "CSV" | "TSV" | "XLS" | "OFX" | "QFX" | "QIF" | "CAMT" | "PASTE";

/** Tabular formats go through the column-mapping step. */
export type TabularFormat = "csv" | "tsv" | "xls" | "xlsx";

export interface ParseReport {
  fileName: string;
  format: BankFormat;
  totalRows: number;
  validRows: number;
  skippedRows: SkippedRow[];
}

export interface BankColumnMapping {
  date: number;
  description: number;
  debit: number;
  credit: number;    // may equal debit for a single signed-amount column
}

export interface CsvPreview {
  headers: string[];
  rows: string[][];       // first 5 data rows (display only)
  detectedMapping: BankColumnMapping | null;
}

// ── Date normalization ────────────────────────────────────────────────

const MON: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const DATE_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpMatchArray) => string }> = [
  // ISO: 2026-03-15 or 2026-03-15T...
  { re: /^(\d{4})-(\d{2})-(\d{2})/, parse: m => `${m[1]}-${m[2]}-${m[3]}` },
  // DD/MM/YYYY or DD-MM-YYYY
  { re: /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/, parse: m => `${m[3]}-${m[2]}-${m[1]}` },
  // MM/DD/YYYY
  { re: /^(\d{2})\/(\d{2})\/(\d{4})/, parse: m => `${m[3]}-${m[1]}-${m[2]}` },
  // OFX: 20260315000000 or 20260315
  { re: /^(\d{4})(\d{2})(\d{2})\d*$/, parse: m => `${m[1]}-${m[2]}-${m[3]}` },
  // "15 Mar 2026" or "15-Mar-2026"
  {
    re: /^(\d{1,2})[\s\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s\-](\d{4})/i,
    parse: m => `${m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`,
  },
  // "Mar 15, 2026"
  {
    re: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i,
    parse: m => `${m[3]}-${MON[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`,
  },
];

export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  for (const p of DATE_PATTERNS) {
    const m = s.match(p.re);
    if (m) {
      const d = p.parse(m);
      const dt = new Date(d);
      if (!isNaN(dt.getTime()) && d >= "2000-01-01") return d;
    }
  }
  return null;
}

function normalizeAmount(raw: unknown): number {
  const s = String(raw ?? "").replace(/[₹$€£,\s]/g, "").trim();
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

let _seq = 0;
function makeId(): string {
  return `pt-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

// ── Tabular parsing (CSV / TSV / XLS / XLSX) ──────────────────────────

function parseTabular(
  content: string | ArrayBuffer,
  format: TabularFormat
): { headers: string[]; rows: unknown[][] } {
  let all: unknown[][];

  if (format === "xls" || format === "xlsx") {
    // Binary Excel: let SheetJS resolve real date cells, then format them to
    // ISO strings so normalizeDate can read them back.
    const wb = XLSX.read(content, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd" });
  } else {
    // Text (CSV/TSV/paste): raw:true keeps every cell as its original text —
    // critical so SheetJS doesn't coerce ISO dates like "2026-05-02" into Excel
    // serial numbers (46144.22…) that no date parser can recover. FS sets the
    // field delimiter (tab for TSV).
    const str = typeof content === "string" ? content : new TextDecoder().decode(content);
    const wb = XLSX.read(str, { type: "string", raw: true, FS: format === "tsv" ? "\t" : "," });
    const ws = wb.Sheets[wb.SheetNames[0]];
    all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
  }

  // Skip leading preamble rows — find the first row with ≥ 2 letter-containing cells
  let headerIdx = 0;
  for (let i = 0; i < Math.min(all.length, 15); i++) {
    const row = all[i] as unknown[];
    const letterCells = row.filter(c => /[a-zA-Z]{2,}/.test(String(c ?? ""))).length;
    if (letterCells >= 2) { headerIdx = i; break; }
  }

  const headers = (all[headerIdx] as unknown[]).map(c => String(c ?? "").trim());
  return { headers, rows: all.slice(headerIdx + 1) as unknown[][] };
}

/** Sniff whether pasted/loaded text is tab- or comma-delimited. */
export function detectDelimiter(text: string): TabularFormat {
  const firstLine = text.split(/\r?\n/).find(l => l.trim()) ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? "tsv" : "csv";
}

export function autoDetectMapping(headers: string[]): BankColumnMapping | null {
  const h = headers.map(s => s.toLowerCase().trim());

  const first = (needles: string[]) => {
    for (const n of needles) {
      const i = h.findIndex(s => s.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };

  const date = first(["date", " dt", "post", "value date", "txn date", "trans date", "transaction date"]);
  const desc = first(["description", "narration", "particulars", "remarks", "memo",
    "details", "narrative", "transaction detail", "cheque detail"]);
  const debit = first(["debit", "withdrawal", "dr amount", " dr", "amount debited", "chq/ref withdrawal"]);
  const credit = first(["credit", "deposit", "cr amount", " cr", "amount credited"]);
  const amount = first(["amount", "amt", "transaction amount", "net amount"]);

  if (date === -1 || desc === -1) return null;
  if (debit !== -1 && credit !== -1) return { date, description: desc, debit, credit };
  if (amount !== -1) return { date, description: desc, debit: amount, credit: amount };
  return null;
}

export function getCsvPreview(content: string | ArrayBuffer, format: TabularFormat = "csv"): CsvPreview {
  const { headers, rows } = parseTabular(content, format);
  return {
    headers,
    rows: rows.slice(0, 5).map(r => (r as unknown[]).map(c => String(c ?? ""))),
    detectedMapping: autoDetectMapping(headers),
  };
}

export function mapCsvToBankTxns(
  content: string | ArrayBuffer,
  mapping: BankColumnMapping,
  fileName: string,
  format: TabularFormat = "csv",
  reportFormat: BankFormat = "CSV"
): { txns: ParsedBankTxn[]; report: ParseReport } {
  const { rows } = parseTabular(content, format);
  const txns: ParsedBankTxn[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    if (!r || r.every(c => String(c ?? "").trim() === "")) continue;

    const rawDate = String(r[mapping.date] ?? "").trim();
    const date = normalizeDate(rawDate);
    if (!date) {
      skipped.push({ rowIndex: i + 2, reason: `Unrecognized date: "${rawDate}"` });
      continue;
    }

    const description = String(r[mapping.description] ?? "").trim();
    if (!description) {
      skipped.push({ rowIndex: i + 2, reason: "Empty description" });
      continue;
    }

    let debit = 0, credit = 0;
    if (mapping.debit === mapping.credit) {
      const raw = String(r[mapping.debit] ?? "").replace(/[₹$€£,\s]/g, "").trim();
      const amt = parseFloat(raw);
      if (!Number.isFinite(amt) || amt === 0) {
        skipped.push({ rowIndex: i + 2, reason: `Invalid amount: "${raw}"` });
        continue;
      }
      if (amt < 0) debit = Math.abs(amt);
      else credit = amt;
    } else {
      debit = normalizeAmount(r[mapping.debit]);
      credit = normalizeAmount(r[mapping.credit]);
    }

    if (debit === 0 && credit === 0) {
      skipped.push({ rowIndex: i + 2, reason: "Both debit and credit are zero" });
      continue;
    }

    txns.push({ id: makeId(), txnDate: date, description, debit, credit });
  }

  return {
    txns,
    report: {
      fileName,
      format: reportFormat,
      totalRows: rows.filter(r => (r as unknown[]).some(c => String(c ?? "").trim())).length,
      validRows: txns.length,
      skippedRows: skipped,
    },
  };
}

// ── OFX / QFX parsing ────────────────────────────────────────────────

function parseOfxDate(raw: string): string | null {
  return normalizeDate(raw.replace(/\[.*\]/, "").trim());
}

function extractSgmlValues(content: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([^<\n\r]*)`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const v = m[1].trim();
    if (v) results.push(v);
  }
  return results;
}

function parseOfxSgml(content: string): ParsedBankTxn[] {
  const txns: ParsedBankTxn[] = [];
  // Split on STMTTRN open tags to find each block
  const parts = content.split(/<STMTTRN>/i);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const rawDate = extractSgmlValues(block, "DTPOSTED")[0] ?? extractSgmlValues(block, "DTUSER")[0];
    const rawAmt  = extractSgmlValues(block, "TRNAMT")[0];
    const fitid   = extractSgmlValues(block, "FITID")[0];
    const memo    = extractSgmlValues(block, "MEMO")[0] ?? extractSgmlValues(block, "NAME")[0] ?? "";

    if (!rawDate || !rawAmt) continue;
    const date = parseOfxDate(rawDate);
    if (!date) continue;
    const amt = parseFloat(rawAmt.replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(amt)) continue;

    txns.push({
      id: makeId(),
      txnDate: date,
      description: memo.trim() || `Transaction ${fitid ?? date}`,
      debit: amt < 0 ? Math.abs(amt) : 0,
      credit: amt > 0 ? amt : 0,
      bankTxnId: fitid,
    });
  }
  return txns;
}

function parseOfxXml(content: string): ParsedBankTxn[] {
  if (typeof window === "undefined") return parseOfxSgml(content);
  const doc = new window.DOMParser().parseFromString(content, "text/xml");
  const els = Array.from(doc.querySelectorAll("STMTTRN"));
  if (els.length === 0) return parseOfxSgml(content);

  return els.flatMap(el => {
    const g = (tag: string) => el.querySelector(tag)?.textContent?.trim() ?? "";
    const rawDate = g("DTPOSTED") || g("DTUSER");
    const rawAmt  = g("TRNAMT");
    const fitid   = g("FITID");
    const memo    = g("MEMO") || g("NAME");
    if (!rawDate || !rawAmt) return [];
    const date = parseOfxDate(rawDate);
    if (!date) return [];
    const amt = parseFloat(rawAmt.replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(amt)) return [];
    return [{
      id: makeId(),
      txnDate: date,
      description: memo || `Transaction ${fitid ?? date}`,
      debit: amt < 0 ? Math.abs(amt) : 0,
      credit: amt > 0 ? amt : 0,
      bankTxnId: fitid || undefined,
    }];
  });
}

export function parseOfxContent(
  content: string,
  format: "OFX" | "QFX",
  fileName: string
): { txns: ParsedBankTxn[]; report: ParseReport } {
  const isXml = /^<\?xml/i.test(content.trimStart()) || content.includes('OFXHEADER="200"');
  const txns = isXml ? parseOfxXml(content) : parseOfxSgml(content);
  return {
    txns,
    report: { fileName, format, totalRows: txns.length, validRows: txns.length, skippedRows: [] },
  };
}

// ── QIF parsing (Quicken Interchange Format) ──────────────────────────
// Entries separated by a line with just "^". Field codes: D=date, T/U=amount
// (signed; negative = withdrawal), P=payee, M=memo, N=ref/number.

export function parseQifContent(content: string, fileName: string): { txns: ParsedBankTxn[]; report: ParseReport } {
  const txns: ParsedBankTxn[] = [];
  const skipped: SkippedRow[] = [];
  // Drop the !Type header line(s), then split into entries on "^".
  const body = content.replace(/^!.*$/gm, "");
  const blocks = body.split(/^\s*\^\s*$/m).map(b => b.trim()).filter(Boolean);

  blocks.forEach((block, idx) => {
    let rawDate = "", rawAmt = "", payee = "", memo = "", ref = "";
    for (const line of block.split(/\r?\n/)) {
      const code = line[0];
      const val = line.slice(1).trim();
      if (code === "D") rawDate = val;
      else if (code === "T" || code === "U") rawAmt = rawAmt || val;
      else if (code === "P") payee = val;
      else if (code === "M") memo = val;
      else if (code === "N") ref = val;
    }
    const date = normalizeDate(rawDate);
    const amt = parseFloat(rawAmt.replace(/[^0-9.\-]/g, ""));
    if (!date || !Number.isFinite(amt)) {
      skipped.push({ rowIndex: idx + 1, reason: `Could not read QIF entry (date "${rawDate}", amount "${rawAmt}")` });
      return;
    }
    const description = [payee, memo].filter(Boolean).join(" — ") || `Transaction ${ref || date}`;
    txns.push({
      id: makeId(), txnDate: date, description,
      debit: amt < 0 ? Math.abs(amt) : 0,
      credit: amt > 0 ? amt : 0,
      bankTxnId: ref || undefined,
    });
  });

  return { txns, report: { fileName, format: "QIF", totalRows: blocks.length, validRows: txns.length, skippedRows: skipped } };
}

// ── CAMT.053 / CAMT.054 parsing (ISO 20022 XML) ───────────────────────
// Both wrap transactions in <Ntry>. Namespace prefixes are stripped first so
// plain tag regexes work regardless of how the bank namespaced the document.

export function parseCamtContent(content: string, fileName: string): { txns: ParsedBankTxn[]; report: ParseReport } {
  const clean = content.replace(/<(\/?)[A-Za-z0-9_]+:/g, "<$1");
  const txns: ParsedBankTxn[] = [];
  const skipped: SkippedRow[] = [];

  const blocks = clean.split(/<Ntry>/i).slice(1).map(b => b.split(/<\/Ntry>/i)[0]);
  const pick = (s: string, tag: string) => {
    const m = s.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"));
    return m ? m[1].trim() : "";
  };

  blocks.forEach((b, idx) => {
    const rawAmt = pick(b, "Amt");
    const ind = pick(b, "CdtDbtInd").toUpperCase();   // CRDT | DBIT
    const rawDate = pick(b, "Dt") || pick(b, "DtTm");  // first BookgDt/ValDt
    const desc = pick(b, "Ustrd") || pick(b, "AddtlNtryInf") || pick(b, "Nm");
    const ref = pick(b, "NtryRef") || pick(b, "AcctSvcrRef") || pick(b, "TxId");

    const date = normalizeDate(rawDate);
    const amt = parseFloat(rawAmt.replace(/[^0-9.\-]/g, ""));
    if (!date || !Number.isFinite(amt) || !ind) {
      skipped.push({ rowIndex: idx + 1, reason: `Could not read CAMT entry (date "${rawDate}", amount "${rawAmt}")` });
      return;
    }
    const isCredit = ind.startsWith("CRDT");
    txns.push({
      id: makeId(), txnDate: date,
      description: desc || `Transaction ${ref || date}`,
      debit: isCredit ? 0 : Math.abs(amt),
      credit: isCredit ? Math.abs(amt) : 0,
      bankTxnId: ref || undefined,
    });
  });

  return { txns, report: { fileName, format: "CAMT", totalRows: blocks.length, validRows: txns.length, skippedRows: skipped } };
}

// ── Duplicate detection ───────────────────────────────────────────────

type ExistingTxn = {
  txnDate: string; description: string; debit: number; credit: number; bankTxnId?: string;
};

export function detectDuplicates(
  existing: ExistingTxn[],
  incoming: ParsedBankTxn[]
): { fresh: ParsedBankTxn[]; duplicates: ParsedBankTxn[] } {
  const fitidSet = new Set(existing.map(t => t.bankTxnId).filter((id): id is string => !!id));
  const descKey  = (t: ExistingTxn) =>
    `${t.txnDate}|${t.debit.toFixed(2)}|${t.credit.toFixed(2)}|${t.description.toLowerCase().trim()}`;
  const descSet = new Set(existing.map(descKey));
  const seenFitid = new Set<string>();
  const seenDesc  = new Set<string>();

  const fresh: ParsedBankTxn[] = [];
  const duplicates: ParsedBankTxn[] = [];

  for (const t of incoming) {
    if (t.bankTxnId && (fitidSet.has(t.bankTxnId) || seenFitid.has(t.bankTxnId))) {
      duplicates.push(t); continue;
    }
    const dk = descKey(t);
    if (descSet.has(dk) || seenDesc.has(dk)) {
      duplicates.push(t);
    } else {
      fresh.push(t);
      seenDesc.add(dk);
      if (t.bankTxnId) seenFitid.add(t.bankTxnId);
    }
  }
  return { fresh, duplicates };
}
