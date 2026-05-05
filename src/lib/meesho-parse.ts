const KNOWN_PARTNERS = [
  { names: ["ecom express", "wow express"], display: "Ecom Express" },
  { names: ["delhivery"], display: "Delhivery" },
  { names: ["shadowfax"], display: "Shadowfax" },
  { names: ["xpressbee", "xpressbees"], display: "Xpressbees" },
  { names: ["flipkart logistics", "ekart"], display: "Ekart" },
  { names: ["india post", "speed post"], display: "India Post" },
  { names: ["blue dart", "bluedart"], display: "Blue Dart" },
  { names: ["amazon logistic", "amazon shipping"], display: "Amazon" },
];

const SKU_SEGMENT = `[A-Za-z0-9][A-Za-z0-9._-]{0,30}`;
const SKU_LIKE_PATTERN = new RegExp(
  `\\b${SKU_SEGMENT}(?:-[A-Za-z0-9][A-Za-z0-9._-]*){2,}\\b`,
  "g"
);

function scanPartnerInText(lc: string): string | null {
  for (const { names, display } of KNOWN_PARTNERS) {
    if (names.some((n) => lc.includes(n))) return display;
  }
  if (/\becom\b/.test(lc)) return "Ecom Express";
  return null;
}

/** Prefer partner keywords in the barcode / pickup band; fall back to full label */
export function resolvePickupPartner(normalizedText: string): string {
  const lc = normalizedText.toLowerCase();
  const anchors = ["pickup", "barcode", "scan", "logistic", "courier", "shipping"];
  const windows: string[] = [];
  for (const a of anchors) {
    let from = 0;
    while (from < lc.length) {
      const idx = lc.indexOf(a, from);
      if (idx < 0) break;
      windows.push(lc.slice(Math.max(0, idx - 450), Math.min(lc.length, idx + 500)));
      from = idx + a.length;
    }
  }
  for (const w of windows) {
    const hit = scanPartnerInText(w);
    if (hit) return hit;
  }
  return scanPartnerInText(lc) ?? "Unknown";
}

export function resolveQuantity(normalizedText: string): number | null {
  const direct =
    normalizedText.match(/\bQty\b\s*[.:]?\s*(\d{1,4})\b/i) ??
    normalizedText.match(/\bQuantity\b\s*[.:]?\s*(\d{1,4})\b/i);
  if (direct?.[1]) {
    const n = parseInt(direct[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  /* Meesho table row often streams as: "… But-D-IV Free Size 1 White …" */
  const pd = normalizedText.toLowerCase().indexOf("product details");
  if (pd >= 0) {
    const focal = normalizedText.slice(pd, pd + 1000);
    const freeSize = focal.match(/\bFree\s+Size\s+(\d{1,4})\b/i);
    if (freeSize?.[1]) {
      const n = parseInt(freeSize[1], 10);
      return Number.isFinite(n) ? n : null;
    }
  }

  const freeSizeGlobal =
    normalizedText.match(/\bFree\s+Size\s+(\d{1,4})\b/i);
  if (freeSizeGlobal?.[1]) {
    const n = parseInt(freeSizeGlobal[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function cleanBrandLine(raw: string): string {
  const t = raw.replace(/\s+/g, " ").replace(/[,;]+$/g, "").trim();
  if (t.length < 2 || t.length > 90) return "";
  return t;
}

/** “Sold by”, seller block, or return address heuristics (e.g. Gharloom) */
export function resolveBrandIdentifier(normalizedText: string): string | null {
  const t = normalizedText.replace(/\u00a0/g, " ");

  const soldTight = t.match(
    /\bSold\s+by\s*[.:]?\s*(.+?)(?=\s+GSTIN\b|\s+Invoice\b|\s+Purchase\s+Order|\s+BILL TO\b|\s+TAX\s+INVOICE\b|$)/i
  );
  if (soldTight?.[1]) {
    const c = cleanBrandLine(soldTight[1].split(/,/)[0] ?? soldTight[1]);
    if (c) return c;
  }

  const patterns: RegExp[] = [
    /\bSeller\s*(?:name)?\s*[.:]?\s*([^\n|]+?)(?:\s{2,}|\||$)/i,
    /\bBrand\s*[.:]?\s*([^\n|]+?)(?:\s{2,}|\||$)/i,
    /\bReturn\s+address\s*[.:]?\s*([^\n]{2,120})/i,
    /\bShips?\s+from\s*[.:]?\s*([^\n|]+?)(?:\s{2,}|\||$)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const c = cleanBrandLine(m[1]);
      if (c) return c;
    }
  }
  return null;
}

function collectSkuHintsNearKeywords(text: string): string[] {
  const hits: string[] = [];
  const keys = [/product\s*details/gi, /\bsku\b/gi];
  for (const re of keys) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags.replace("g", "") + "g");
    while ((m = r.exec(text)) !== null) {
      const slice = text.slice(m.index, m.index + Math.min(text.length - m.index, 900));
      let sm: RegExpExecArray | null;
      const pr = new RegExp(SKU_LIKE_PATTERN.source, "g");
      while ((sm = pr.exec(slice)) !== null) {
        hits.push(sm[0]);
      }
    }
  }
  return hits;
}

/** Locate Meesho label SKU usually shown under Product Details using layout-tolerant scans */
export function resolveLabelSku(normalizedText: string): string | null {
  const sectionIdx = normalizedText.toLowerCase().indexOf("product details");
  const focal =
    sectionIdx >= 0
      ? normalizedText.slice(sectionIdx, sectionIdx + 1200)
      : normalizedText;

  /* Row shape: “But-D-IV Free Size 1 White …” common on Sub_Order labels */
  const rowWithFreeSize = focal.match(
    /\b([A-Za-z0-9][A-Za-z0-9._-]*(?:-[A-Za-z0-9][A-Za-z0-9._-]*)+)\s+Free\s+Size\s+\d+/i
  );
  if (rowWithFreeSize?.[1]) return rowWithFreeSize[1].trim();

  const explicit = focal.match(/\bSKU\b\s*[.:]?\s*([^\s|,]+(?:-[^\s|,]+)+)/i);
  if (explicit) return explicit[1].trim();

  const nearKw = collectSkuHintsNearKeywords(focal);
  const allMatchesPattern = new RegExp(SKU_LIKE_PATTERN.source, "g");
  const allMatches = normalizedText.match(allMatchesPattern) ?? [];
  const scored = Array.from(new Set([...nearKw, ...allMatches]));

  scored.sort((a, b) => b.length - a.length);
  if (scored.length === 0) return null;
  return scored[0] ?? null;
}

export interface ExtractedFields {
  sku: string | null;
  qty: number | null;
  partner: string;
  brand: string | null;
}

export function extractMeeshoFields(rawText: string): ExtractedFields {
  const normalized = rawText.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const partner = resolvePickupPartner(normalized);
  const qty = resolveQuantity(normalized);
  const brand = resolveBrandIdentifier(normalized);
  let sku = resolveLabelSku(normalized);
  sku = sku ? sku.trim() : sku;
  if (sku?.length !== undefined && sku.length < 4) sku = null;
  return { sku, qty, partner, brand };
}
