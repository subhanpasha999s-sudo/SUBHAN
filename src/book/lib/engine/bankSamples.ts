/**
 * Sample bank-statement generators — one canonical dataset rendered into every
 * supported import format, so users can download an example and see exactly
 * what a clean file looks like. All generated client-side from SAMPLE_ROWS.
 */
import * as XLSX from "xlsx";

export interface SampleRow {
  date: string;       // YYYY-MM-DD
  withdrawal: number; // debit (money out)
  deposit: number;    // credit (money in)
  payee: string;
  description: string;
  ref: string;
}

/** Realistic month for an Indian Meesho seller — tuned so the starter rules fire. */
export const SAMPLE_ROWS: SampleRow[] = [
  { date: "2026-05-02", withdrawal: 0,     deposit: 48250, payee: "Meesho Payments",     description: "Meesho weekly settlement payout",      ref: "REF-MSH-50012" },
  { date: "2026-05-03", withdrawal: 3540,  deposit: 0,     payee: "Delhivery Ltd",        description: "Delhivery courier charges April",      ref: "REF-2134" },
  { date: "2026-05-05", withdrawal: 1890,  deposit: 0,     payee: "Bluedart Express",     description: "Bluedart shipping invoice",            ref: "REF-2210" },
  { date: "2026-05-06", withdrawal: 2750,  deposit: 0,     payee: "Uflex Packaging",      description: "Packaging material - polybags & tape", ref: "REF-2298" },
  { date: "2026-05-08", withdrawal: 12000, deposit: 0,     payee: "Google Ads",           description: "Google Ads campaign spend",            ref: "REF-GADS-771" },
  { date: "2026-05-09", withdrawal: 6500,  deposit: 0,     payee: "Meta Platforms",       description: "Meta Ads - Instagram promotion",       ref: "REF-META-455" },
  { date: "2026-05-12", withdrawal: 0,     deposit: 15000, payee: "Owner Capital",        description: "Owner deposit into business account",  ref: "REF-CAP-009" },
  { date: "2026-05-14", withdrawal: 18000, deposit: 0,     payee: "Rajesh Kumar",         description: "Salary payment - staff",               ref: "REF-SAL-004" },
  { date: "2026-05-15", withdrawal: 22000, deposit: 0,     payee: "Skyline Estates",      description: "Monthly office & warehouse rent",      ref: "REF-RENT-05" },
  { date: "2026-05-18", withdrawal: 1420,  deposit: 0,     payee: "BESCOM",               description: "Electricity bill payment",             ref: "REF-ELEC-88" },
  { date: "2026-05-20", withdrawal: 2310,  deposit: 0,     payee: "Amazon Seller",        description: "Amazon supplies - stationery",         ref: "REF-AMZN-321" },
  { date: "2026-05-22", withdrawal: 0,     deposit: 52100, payee: "Meesho Payments",      description: "Meesho weekly settlement payout",      ref: "REF-MSH-50188" },
  { date: "2026-05-24", withdrawal: 999,   deposit: 0,     payee: "Tata Sky Broadband",   description: "Internet broadband monthly",           ref: "REF-NET-12" },
  { date: "2026-05-27", withdrawal: 4800,  deposit: 0,     payee: "DTDC Courier",         description: "DTDC return shipment charges",          ref: "REF-2455" },
  { date: "2026-05-29", withdrawal: 3100,  deposit: 0,     payee: "Reliance General",     description: "Insurance premium - stock cover",      ref: "REF-INS-77" },
];

export type SampleFormat = "csv" | "tsv" | "xls" | "ofx" | "qif" | "camt053" | "camt054";

export interface SampleFile {
  blob: Blob;
  filename: string;
}

const HEADERS = ["Date", "Withdrawals", "Deposits", "Payee", "Description", "Reference Number"];
const rowCells = (r: SampleRow) => [r.date, String(r.withdrawal), String(r.deposit), r.payee, r.description, r.ref];

function delimited(sep: string, quote: boolean): string {
  const esc = (c: string) => (quote ? `"${c.replace(/"/g, '""')}"` : c);
  const lines = [HEADERS.map(esc).join(sep), ...SAMPLE_ROWS.map(r => rowCells(r).map(esc).join(sep))];
  return lines.join("\n") + "\n";
}

function xlsBlob(): Blob {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...SAMPLE_ROWS.map(rowCells)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Statement");
  const out = XLSX.write(wb, { bookType: "xls", type: "array" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.ms-excel" });
}

function ofxText(): string {
  const dt = (d: string) => d.replace(/-/g, "") + "120000";
  const txns = SAMPLE_ROWS.map((r, i) => {
    const amt = r.deposit > 0 ? r.deposit : -r.withdrawal;
    return `      <STMTTRN>
        <TRNTYPE>${r.deposit > 0 ? "CREDIT" : "DEBIT"}
        <DTPOSTED>${dt(r.date)}
        <TRNAMT>${amt.toFixed(2)}
        <FITID>${r.ref || `TXN${i + 1}`}
        <NAME>${r.payee}
        <MEMO>${r.description}
      </STMTTRN>`;
  }).join("\n");
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>INR
<BANKTRANLIST>
${txns}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;
}

function qifText(): string {
  const body = SAMPLE_ROWS.map(r => {
    const amt = r.deposit > 0 ? r.deposit : -r.withdrawal;
    return `D${r.date}\nT${amt.toFixed(2)}\nP${r.payee}\nM${r.description}\nN${r.ref}\n^`;
  }).join("\n");
  return `!Type:Bank\n${body}\n`;
}

function camtXml(kind: "053" | "054"): string {
  const tag = kind === "053" ? "BkToCstmrStmt" : "BkToCstmrDbtCdtNtfctn";
  const stmtTag = kind === "053" ? "Stmt" : "Ntfctn";
  const entries = SAMPLE_ROWS.map(r => {
    const credit = r.deposit > 0;
    const amt = (credit ? r.deposit : r.withdrawal).toFixed(2);
    return `      <Ntry>
        <NtryRef>${r.ref}</NtryRef>
        <Amt Ccy="INR">${amt}</Amt>
        <CdtDbtInd>${credit ? "CRDT" : "DBIT"}</CdtDbtInd>
        <BookgDt><Dt>${r.date}</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties><Cdtr><Nm>${r.payee}</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>${r.description}</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.${kind}.001.02">
  <${tag}>
    <${stmtTag}>
      <Acct><Id><Othr><Id>MEESHO-SELLER-001</Id></Othr></Id></Acct>
${entries}
    </${stmtTag}>
  </${tag}>
</Document>
`;
}

export function buildSample(format: SampleFormat): SampleFile {
  const text = (s: string, type: string, ext: string): SampleFile => ({
    blob: new Blob([s], { type }),
    filename: `sample_bankstatement.${ext}`,
  });
  switch (format) {
    case "csv":     return text(delimited(",", true), "text/csv", "csv");
    case "tsv":     return text(delimited("\t", false), "text/tab-separated-values", "tsv");
    case "xls":     return { blob: xlsBlob(), filename: "sample_bankstatement.xls" };
    case "ofx":     return text(ofxText(), "application/x-ofx", "ofx");
    case "qif":     return text(qifText(), "application/qif", "qif");
    case "camt053": return text(camtXml("053"), "application/xml", "camt053.xml");
    case "camt054": return text(camtXml("054"), "application/xml", "camt054.xml");
  }
}

export const SAMPLE_FORMATS: { format: SampleFormat; label: string; ext: string }[] = [
  { format: "csv",     label: "CSV",          ext: "csv" },
  { format: "tsv",     label: "TSV",          ext: "tsv" },
  { format: "xls",     label: "Excel (XLS)",  ext: "xls" },
  { format: "ofx",     label: "OFX",          ext: "ofx" },
  { format: "qif",     label: "QIF",          ext: "qif" },
  { format: "camt053", label: "CAMT.053 XML", ext: "xml" },
  { format: "camt054", label: "CAMT.054 XML", ext: "xml" },
];
