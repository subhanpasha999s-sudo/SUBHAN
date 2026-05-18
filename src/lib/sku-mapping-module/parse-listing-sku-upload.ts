"use client";

import { isLikelyNonListingSkuLabel } from "@/lib/sku-mapping-module/sku-close-match";

/**
 * Primary upload path: Tulmin's neutral sample file with a `SKU` column.
 * Fallback path: Meesho inventory export layout where listing SKUs are in
 * column F, row 3 onward.
 */
const LISTING_SKU_COL_0 = 5; // column F
const LISTING_SKU_FIRST_DATA_ROW_1_BASED = 3;
const LISTING_SKU_FIRST_DATA_ROW_0 = LISTING_SKU_FIRST_DATA_ROW_1_BASED - 1;

/** Shown in UI / toasts alongside row counts */
export const LISTING_SKU_COLUMN_LABEL = "SKU column";
const MEESHO_LISTING_SKU_COLUMN_LABEL = "Column F (Meesho stock export)";

export type ParseListingSkuResult = {
  listingSkus: string[];
  headers: string[];
  scannedRows: number;
  /** Human-readable source column (fixed layout) */
  columnUsed: string | null;
  error?: string;
};

type RawRow = unknown[];

function dedupePreserveOrder(skus: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skus) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function cellAt(row: RawRow | undefined, col0: number): string {
  if (!row || col0 < 0) return "";
  const v = row[col0];
  if (v == null) return "";
  return String(v).replace(/^\ufeff/, "").trim();
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSkuHeader(value: string): boolean {
  const h = normalizeHeader(value);
  return (
    h === "sku" ||
    h === "listingsku" ||
    h === "sellersku" ||
    h === "msku" ||
    h === "productsku"
  );
}

function findSkuHeader(rows: RawRow[]): {
  row0: number;
  col0: number;
  label: string;
} | null {
  const scanRows = Math.min(rows.length, 24);
  for (let row0 = 0; row0 < scanRows; row0++) {
    const row = rows[row0];
    if (!Array.isArray(row)) continue;
    for (let col0 = 0; col0 < row.length; col0++) {
      const value = cellAt(row, col0);
      if (value && isSkuHeader(value)) {
        return {
          row0,
          col0,
          label: value.trim() || LISTING_SKU_COLUMN_LABEL,
        };
      }
    }
  }
  return null;
}

function extractFromHeaderColumn(
  rows: RawRow[],
  header: { row0: number; col0: number; label: string }
): {
  listingSkus: string[];
  scannedRows: number;
  columnUsed: string;
} {
  const raw: string[] = [];
  let scannedRows = 0;

  for (let i = header.row0 + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    scannedRows += 1;
    const v = cellAt(row, header.col0);
    if (v && !isLikelyNonListingSkuLabel(v)) raw.push(v);
  }

  return {
    listingSkus: dedupePreserveOrder(raw),
    scannedRows,
    columnUsed: header.label,
  };
}

/**
 * Read column F from row 3 (1-based) to the end of the sheet.
 */
function extractFromGrid(rows: RawRow[]): {
  listingSkus: string[];
  scannedRows: number;
  columnUsed: string;
} {
  const raw: string[] = [];
  let scannedRows = 0;
  const start = LISTING_SKU_FIRST_DATA_ROW_0;

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    scannedRows += 1;
    const v = cellAt(row, LISTING_SKU_COL_0);
    if (v && !isLikelyNonListingSkuLabel(v)) raw.push(v);
  }

  return {
    listingSkus: dedupePreserveOrder(raw),
    scannedRows,
    columnUsed: MEESHO_LISTING_SKU_COLUMN_LABEL,
  };
}

function extractListingSkus(rows: RawRow[]): {
  listingSkus: string[];
  scannedRows: number;
  columnUsed: string;
} {
  const header = findSkuHeader(rows);
  if (header) {
    const byHeader = extractFromHeaderColumn(rows, header);
    if (byHeader.listingSkus.length > 0) return byHeader;
  }
  return extractFromGrid(rows);
}

export async function parseListingSkuUpload(
  file: File
): Promise<ParseListingSkuResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const parsed = Papa.parse<RawRow>(text, {
      header: false,
      skipEmptyLines: "greedy",
    });

    const rows = (parsed.data ?? []).filter(
      (r): r is RawRow => Array.isArray(r)
    );
    const { listingSkus, scannedRows, columnUsed } = extractListingSkus(rows);

    return {
      listingSkus,
      headers: [],
      scannedRows,
      columnUsed,
    };
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) {
      return {
        listingSkus: [],
        headers: [],
        scannedRows: 0,
        columnUsed: null,
        error: "Workbook has no sheets.",
      };
    }

    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as RawRow[];

    const { listingSkus, scannedRows, columnUsed } = extractListingSkus(rows);

    return {
      listingSkus,
      headers: [],
      scannedRows,
      columnUsed,
    };
  }

  return {
    listingSkus: [],
    headers: [],
    scannedRows: 0,
    columnUsed: null,
    error: "Unsupported file type. Use .csv, .xlsx, or .xls.",
  };
}
