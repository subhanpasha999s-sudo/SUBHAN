const KNOWN_PARTNERS = [
  { names: ["ecom express", "wow express"], display: "Ecom Express" },
  { names: ["delhivery"], display: "Delhivery" },
  { names: ["shadowfax"], display: "Shadowfax" },
  { names: ["xpressbee", "xpressbees"], display: "Xpressbees" },
  { names: ["e-kart logistics", "flipkart logistics", "ekart"], display: "E-Kart Logistics" },
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
  marketplace: "meesho" | "flipkart" | "unknown";
  sku: string | null;
  qty: number | null;
  partner: string;
  payment: "prepaid" | "cod" | "exchange" | "unknown";
  brand: string | null;
}

function resolvePaymentMode(normalizedText: string): ExtractedFields["payment"] {
  const t = normalizedText.replace(/\s+/g, " ");
  const header = t.slice(0, 1200);
  const codPattern =
    /\b(?:COD(?:\s*:\s*Check\s+the\s+payable\s+amount\s+on\s+the\s+app)?|Cash\s+on\s+Delivery)\b/i;
  const exchangePattern = /\bExchange\b/i;
  if (exchangePattern.test(header)) return "exchange";
  if (codPattern.test(header)) return "cod";
  if (/\b(?:PREPAID|Pre\s*Paid|Paid\s+Online|Online\s+Payment)\b/i.test(header)) {
    return "prepaid";
  }
  if (exchangePattern.test(t)) return "exchange";
  if (codPattern.test(t)) return "cod";
  if (/\b(?:PREPAID|Pre\s*Paid|Paid\s+Online|Online\s+Payment)\b/i.test(t)) {
    return "prepaid";
  }
  return "unknown";
}

function detectMarketplace(normalizedText: string): ExtractedFields["marketplace"] {
  const t = normalizedText;
  const lc = t.toLowerCase();
  let flipkartScore = 0;
  if (/\bOD\d{12,}\b/i.test(t)) flipkartScore += 3;
  if (/\bSKU\s*ID\s*\|?\s*Description\s+QTY\b/i.test(t)) flipkartScore += 3;
  if (/\b(?:AWB|WB)\s*No\.?\b/i.test(t)) flipkartScore += 1;
  if (/\bProduct\s+Description\s+Qty\b/i.test(t)) flipkartScore += 2;
  if (/\bOrdered\s+through\b/i.test(t)) flipkartScore += 2;
  if (/\bTax\s+Invoice\b/i.test(t) && /\bOrdered\s+through\b/i.test(t)) flipkartScore += 1;
  if (/\bFlipkart\b/i.test(t)) flipkartScore += 1;
  if (flipkartScore >= 3) return "flipkart";

  let meeshoScore = 0;
  if (lc.includes("meesho")) meeshoScore += 3;
  if (lc.includes("sub_order")) meeshoScore += 3;
  if (lc.includes("product details")) meeshoScore += 2;
  if (/\bSKU\b/i.test(t) && /\bFree\s+Size\b/i.test(t)) meeshoScore += 1;
  if (/\b(?:COD|PREPAID|Exchange)\b/i.test(t) && /\bProduct\s+Details\b/i.test(t)) {
    meeshoScore += 1;
  }
  if (
    meeshoScore >= 3 ||
    (meeshoScore >= 2 && !/\b(?:OD\d{12,}|Flipkart|Ordered\s+through)\b/i.test(t))
  ) {
    return "meesho";
  }

  return "unknown";
}

function resolveFlipkartSku(normalizedText: string): string | null {
  const t = normalizedText.replace(/\s+/g, " ").trim();

  const table = t.match(
    /\bSKU\s*ID\s*\|\s*Description\s+QTY\s+\d+\s+(.+?)\s+\|\s+.+?\s+(\d{1,4})\b/i
  );
  if (table?.[1]) {
    const sku = table[1].trim();
    if (sku.length >= 2 && sku.length <= 80) return sku;
  }

  const product = t.match(
    /\bProduct\s+Description\s+Qty\b.+?\s([A-Za-z0-9][A-Za-z0-9._-]{1,80})\s+\|\s+\1\b/i
  );
  if (product?.[1]) return product[1].trim();

  const pipe = t.match(/\|\s*([A-Za-z0-9][A-Za-z0-9._-]{1,80})\s*\|\s*IMEI\/SrNo/i);
  if (pipe?.[1]) return pipe[1].trim();

  return null;
}

function resolveFlipkartQuantity(normalizedText: string): number | null {
  const t = normalizedText.replace(/\s+/g, " ").trim();
  const table = t.match(
    /\bSKU\s*ID\s*\|\s*Description\s+QTY\s+\d+\s+[^\|]{2,90}\s+\|.{0,240}?\s+(\d{1,4})\s+(?=[A-Z]{2,}[A-Z0-9]{6,}\b|\bTax\s+Invoice\b|\bOrder\s+Id\b)/i
  );
  if (table?.[1]) {
    const n = parseInt(table[1], 10);
    if (Number.isFinite(n)) return n;
  }

  const total = t.match(/\bTOTAL\s+QTY\s*:\s*(\d{1,4})\b/i);
  if (total?.[1]) {
    const n = parseInt(total[1], 10);
    if (Number.isFinite(n)) return n;
  }

  return resolveQuantity(normalizedText);
}

function resolveFlipkartPartner(normalizedText: string): string {
  const t = normalizedText.replace(/\s+/g, " ").trim();
  const known = resolvePickupPartner(t);
  if (known !== "Unknown") return known;

  const header = t.slice(0, 700);
  const beforeOrder = header.match(
    /\b([A-Z][A-Za-z&./ -]{2,48}?(?:Logistics|Express|Courier|Surface|Shipping|Transport|Services))\s+OD\d{12,}\b/i
  );
  if (beforeOrder?.[1]) return beforeOrder[1].replace(/\s+/g, " ").trim();

  const awb = t.match(/\b(?:AWB|WB)\s*No\.?\s*[:.-]?\s*([A-Z0-9-]{6,})\b/i);
  if (awb?.[1]) {
    const code = awb[1].toUpperCase();
    if (code.startsWith("FMP")) return "E-Kart Logistics";
    if (code.startsWith("SF")) return "Shadowfax";
    if (code.startsWith("DL")) return "Delhivery";
    if (code.startsWith("XB")) return "Xpressbees";
  }

  return "Unknown";
}

export function extractMeeshoFields(rawText: string): ExtractedFields {
  const normalized = rawText.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const marketplace = detectMarketplace(normalized);
  if (marketplace === "flipkart") {
    const partner = resolveFlipkartPartner(normalized);
    const qty = resolveFlipkartQuantity(normalized);
    const payment = resolvePaymentMode(normalized);
    const brand = resolveBrandIdentifier(normalized);
    const sku = resolveFlipkartSku(normalized);
    return { marketplace, sku, qty, partner, payment, brand };
  }

  const partner = resolvePickupPartner(normalized);
  const qty = resolveQuantity(normalized);
  const payment = resolvePaymentMode(normalized);
  const brand = resolveBrandIdentifier(normalized);
  let sku = resolveLabelSku(normalized);
  sku = sku ? sku.trim() : sku;
  if (sku?.length !== undefined && sku.length < 4) sku = null;
  return { marketplace, sku, qty, partner, payment, brand };
}
