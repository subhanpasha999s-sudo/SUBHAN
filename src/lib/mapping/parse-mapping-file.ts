"use client";

import type { SkuMappingRow } from "@/types/label";

type Raw = Record<string, unknown>;

/** Result of parsing CSV / XLS for mapping uploads */
export type ParseMappingResult = {
  rows: Omit<SkuMappingRow, "id" | "updatedAt">[];
  /** Spreadsheet columns from the header row */
  headers: string[];
  /** Data rows inspected (excluding only header for tabular parsers) */
  scannedRows: number;
};

/**
 * Column aliases → listing / child SKU (first match wins).
 * Style ID must beat plain "Product ID": catalog exports put numeric product ids in E
 * and human-readable label SKUs (child) in Style ID (e.g. column F).
 */
const LIST_KEYS = [
  "style id",
  "style_id",
  "styleid",
  "product id/styleid",
  "product id / styleid",
  "product id/style id",
  "product id / style id",
  "style id/product id",
  "style id / product id",
  "style id/productid",
  "meesho sku",
  "meesho_sku",
  "label sku",
  "listing sku",
  "listing_sku",
  "channel sku",
  "channel_sku",
  "seller sku",
  "seller_sku",
  "meesho listing",
  "listing id",
  "product listing sku",
  "meso sku",
  "meso_sku",
  "fce sku",
  "marketplace sku",
  "merchant sku",
  "platform sku",
  "sale sku",
  "shop sku",
  "seller item id",
  "seller-item-id",
  "product sku",
  "product_sku",
  "vendor sku",
  "vendor_sku",
  "item sku",
  "item_sku",
  "sku id",
  "sku_id",
  "sku code",
  "sku_code",
  "style code",
  "style_code",
  "style sku",
  "variant sku",
  "variant id",
  "variant_id",
  "article no",
  "article number",
  "article code",
  "item code",
  "item_number",
  /** After Style ID: numeric catalog product ids are a weaker listing key */
  "product id",
  "product_code",
  "factory sku",
  "new sku",
  "child sku",
  "sku",
];

/** Prefer these for ERP / inventory key before falling back to heuristics */
const MASTER_KEYS = [
  "master sku",
  "master_sku",
  "master key",
  "master_key",
  "inventory sku",
  "inventory_sku",
  "warehouse sku",
  "warehouse_sku",
  "erp sku",
  "erp_sku",
  "primary sku",
  "internal sku",
  "internal_sku",
  "canonical sku",
  "supply sku",
  "supplier sku",
  "bom sku",
  "parent sku",
  "group sku",
  "group id",
  "old sku",
  "legacy sku",
  "main sku",
  "principal sku",
  "core sku",
  "base sku",
  "system sku",
  "fc sku",
  "wh sku",
  "whse sku",
  "bin sku",
  "style master",
  "manufacturer sku",
  "factory code",
];

const CAT_KEYS = ["category", "cat", "product category", "product_category", "class", "group name"];

const MASTER_HEADER_RE =
  /\b(master|erp|inventory|warehouse|internal|canonical|supply|supplier|bom|principal|legacy|main|primary|parent|group|canonical|supplier|vendor\s*sku|fact(?:ory)?\s*(?:sku|code)|whse|wh\b|system)\b/;
const LISTING_HEADER_RE =
  /\b(listing|channel|seller|market|meesho|meso|label|fba|merchant|fce|amazon|flipkart|shopify|platform|merchant|fce|sale|child|listing|fce)\b/;
const SKUISH_HEADER_SUB =
  /sku|\b(style|asin|article|ean|gtin)\b|\bvariant\b|item\s*(code|no|number|sku)|product\s*(id|code)|vendor\s*(code|id)|seller\s*(item\s*)?(id)?/;

/** Headers like "STYLE ID" / "Product ID/StyleID" — preferred child / label SKU */
function isStyleListingHeader(nk: string): boolean {
  return (
    /\bstyle\s*id\b/.test(nk) ||
    /\bstyleid\b/.test(nk) ||
    (/style/.test(nk) && /(id|sku|code)/.test(nk))
  );
}

/** Numeric internal product id (column E), not Style ID or combined Product ID/Style ID */
function isBareProductIdHeader(nk: string): boolean {
  if (isStyleListingHeader(nk)) return false;
  return /\bproduct\s*id\b/.test(nk);
}

function normalizeHeaderKey(key: string): string {
  return key
    .replace(/^\ufeff/, "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeRowKeysLookup(row: Raw): Map<string, string> {
  const byNorm = new Map<string, string>();
  for (const k of Object.keys(row)) {
    const nk = normalizeHeaderKey(k);
    if (!byNorm.has(nk)) byNorm.set(nk, k);
  }
  return byNorm;
}

function pickCol(row: Raw, keys: string[]): string {
  const byNorm = normalizeRowKeysLookup(row);
  for (const want of keys) {
    const orig = byNorm.get(normalizeHeaderKey(want));
    if (orig === undefined) continue;
    const v = row[orig];
    return v == null ? "" : String(v).trim();
  }
  return "";
}

interface ColHit {
  nk: string;
  value: string;
  order: number;
}

function skuishHits(row: Raw): ColHit[] {
  const hits: ColHit[] = [];
  let order = 0;
  for (const [key, val] of Object.entries(row)) {
    const nk = normalizeHeaderKey(key);
    const raw = val == null ? "" : String(val).trim();
    if (!raw) continue;
    if (SKUISH_HEADER_SUB.test(nk)) hits.push({ nk, value: raw, order });
    order++;
  }
  return hits;
}

/** When headers are generic, infer listing ↔ master using hints or column order. */
function inferSkuPair(row: Raw): {
  listing: string;
  master: string;
} | null {
  const hits = skuishHits(row);
  if (hits.length === 0) return null;

  /** Strong split: marketplace-ish vs ERP-ish */
  const strongListing = hits.filter((h) => LISTING_HEADER_RE.test(h.nk));
  const strongMaster = hits.filter((h) => MASTER_HEADER_RE.test(h.nk));

  if (strongListing.length >= 1 && strongMaster.length >= 1) {
    const lh = [...strongListing].sort((a, b) => a.order - b.order)[0];
    const mh = [...strongMaster].sort((a, b) => a.order - b.order)[0];
    if (lh?.value?.trim()) {
      return {
        listing: lh.value.trim(),
        master: mh?.value?.trim() !== lh.value.trim() ? (mh?.value ?? "").trim() : "",
      };
    }
  }

  /** Two+ SKU-ish columns: prefer Style ID as listing; never use bare Product ID as master */
  if (hits.length >= 2) {
    const sorted = [...hits].sort((a, b) => a.order - b.order);
    const styleHits = sorted.filter((h) => isStyleListingHeader(h.nk));
    const listingHit = styleHits[0] ?? sorted[0]!;
    const listing = listingHit.value.trim();
    if (!listing) return null;

    let master = "";
    for (const h of sorted) {
      if (h === listingHit) continue;
      const v = h.value.trim();
      if (!v || v === listing) continue;
      if (isBareProductIdHeader(h.nk)) continue;
      master = v;
      break;
    }
    return { listing, master };
  }

  /** Single SKU column → listing-only (user fills master in app) */
  if (hits.length === 1 && hits[0]!.value.trim()) {
    return { listing: hits[0]!.value.trim(), master: "" };
  }

  return null;
}

function rowToMappingPart(row: Raw): Omit<SkuMappingRow, "id" | "updatedAt"> | null {
  let meeshoSku = pickCol(row, LIST_KEYS);
  let masterSku = pickCol(row, MASTER_KEYS);
  const category = pickCol(row, CAT_KEYS);

  if (!meeshoSku.trim() || !masterSku.trim()) {
    const inf = inferSkuPair(row);
    if (inf) {
      if (!meeshoSku.trim()) meeshoSku = inf.listing;
      if (!masterSku.trim()) masterSku = inf.master ?? "";
    }
  }

  /** Drop completely empty spreadsheet rows */
  const listingFinal = meeshoSku.trim();
  if (!listingFinal) return null;

  return {
    meeshoSku: listingFinal,
    masterSku: (masterSku ?? "").trim(),
    category: (category ?? "").trim(),
  };
}

function normSku(s: string) {
  return s.trim().toUpperCase();
}

/** One row per unique listing SKU — importing the same listing twice keeps the last occurrence. */
function dedupeByListingSku(
  rows: Omit<SkuMappingRow, "id" | "updatedAt">[]
): Omit<SkuMappingRow, "id" | "updatedAt">[] {
  const byListing = new Map<string, Omit<SkuMappingRow, "id" | "updatedAt">>();
  for (const r of rows) {
    byListing.set(normSku(r.meeshoSku), r);
  }
  return Array.from(byListing.values());
}

function rowHasAnyCell(row: Raw): boolean {
  return Object.values(row).some((v) => String(v ?? "").trim() !== "");
}

export async function parseMappingUpload(file: File): Promise<ParseMappingResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const parsed = Papa.parse<Raw>(text, {
      header: true,
      skipEmptyLines: "greedy",
    });

    const fromMeta = parsed.meta.fields?.filter((f) => f != null && String(f).trim() !== "").map(String) ?? [];
    const first = parsed.data[0];
    const headerFromData =
      first && typeof first === "object" && first !== null
        ? Object.keys(first as Raw)
        : [];
    const resolvedHeaders = fromMeta.length > 0 ? fromMeta : headerFromData;

    const out: Omit<SkuMappingRow, "id" | "updatedAt">[] = [];
    let scannedRows = 0;

    for (const row of parsed.data) {
      if (!row || typeof row !== "object") continue;
      if (!rowHasAnyCell(row)) continue;
      scannedRows++;
      const m = rowToMappingPart(row);
      if (m) out.push(m);
    }

    return {
      rows: dedupeByListingSku(out),
      headers: resolvedHeaders,
      scannedRows,
    };
  }

  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!sheet) {
    return { rows: [], headers: [], scannedRows: 0 };
  }

  const json = XLSX.utils.sheet_to_json<Raw>(sheet, { defval: "" });

  /** Header row derived from workbook column order where possible */
  const headers: string[] =
    typeof json[0] === "object" && json[0] !== null
      ? Object.keys(json[0] as Raw)
      : [];

  const out: Omit<SkuMappingRow, "id" | "updatedAt">[] = [];
  let scannedRows = 0;
  for (const row of json) {
    if (!rowHasAnyCell(row)) continue;
    scannedRows++;
    const m = rowToMappingPart(row);
    if (m) out.push(m);
  }

  return {
    rows: dedupeByListingSku(out),
    headers,
    scannedRows,
  };
}
