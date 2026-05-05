"use client";

import { isLikelyNonListingSkuLabel } from "@/lib/sku-mapping-module/sku-close-match";

/**
 * Meesho inventory export layout for SKU mapping uploads:
 * - Listing SKUs are in column **F** (1-based column index 6 → 0-based **5**).
 * - **Row 1** = header (ignored), **row 2** = sub-header / empty (ignored).
 * - **Row 3 onward** = listing SKU values.
 */
const LISTING_SKU_COL_0 = 5; // column F
const LISTING_SKU_FIRST_DATA_ROW_1_BASED = 3;
const LISTING_SKU_FIRST_DATA_ROW_0 = LISTING_SKU_FIRST_DATA_ROW_1_BASED - 1;

/** Shown in UI / toasts alongside row counts */
export const LISTING_SKU_COLUMN_LABEL = "Column F (data from row 3)";

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

/**
 * Read column F from row 3 (1-based) to the end of the sheet.
 */
function extractFromGrid(rows: RawRow[]): {
  listingSkus: string[];
  scannedRows: number;
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
  };
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
    const { listingSkus, scannedRows } = extractFromGrid(rows);

    return {
      listingSkus,
      headers: [],
      scannedRows,
      columnUsed: LISTING_SKU_COLUMN_LABEL,
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

    const { listingSkus, scannedRows } = extractFromGrid(rows);

    return {
      listingSkus,
      headers: [],
      scannedRows,
      columnUsed: LISTING_SKU_COLUMN_LABEL,
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
