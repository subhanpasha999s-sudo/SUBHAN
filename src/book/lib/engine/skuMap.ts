/**
 * V3 — LISTING SKU ↔ INVENTORY SKU MAPPING (spec section 2).
 *
 * Meesho's listing SKU often differs from the warehouse/inventory SKU
 * (variants, renames, bundles). This pure layer resolves a listing SKU into
 * the inventory units that should move, so inventory math stays correct.
 *
 * - many-to-one: several listing SKUs → one inventory SKU
 * - one-to-many (bundle/kit): one listing SKU → N units across components
 * - unmapped: returns null → caller routes to the "Unmapped SKUs" tray and
 *   EXCLUDES from inventory (but still counts in P&L).
 */

/** A bundle/kit component: deduct `qty` of this inventory SKU per sold unit. */
export interface BundleComponent {
  inventorySku: string;
  qty: number;
}

export interface SkuMapEntry {
  listingSku: string;
  /** Single inventory SKU (1:1 or many:1). Omit when using `components`. */
  inventorySku?: string;
  /** Bundle/kit definition (1:many). Takes precedence over inventorySku. */
  components?: BundleComponent[];
  marketplace?: string;
}

/** One resolved inventory movement for a listing SKU. */
export interface ResolvedComponent {
  inventorySku: string;
  /** Inventory units consumed per ONE sold listing unit. */
  qtyPerUnit: number;
}

export interface SkuResolution {
  listingSku: string;
  mapped: boolean;
  components: ResolvedComponent[];
}

function normalize(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

/** Build a fast lookup keyed by normalized listing SKU. */
export function buildSkuMap(entries: SkuMapEntry[]): Map<string, SkuMapEntry> {
  const map = new Map<string, SkuMapEntry>();
  for (const e of entries) {
    if (!e.listingSku) continue;
    map.set(normalize(e.listingSku), e);
  }
  return map;
}

/**
 * Resolve a listing SKU to the inventory components it consumes.
 * Unmapped → { mapped: false, components: [] }.
 */
export function resolveSku(
  listingSku: string,
  map: Map<string, SkuMapEntry>
): SkuResolution {
  const entry = map.get(normalize(listingSku));
  if (!entry) return { listingSku, mapped: false, components: [] };

  if (entry.components && entry.components.length > 0) {
    return {
      listingSku,
      mapped: true,
      components: entry.components.map((c) => ({
        inventorySku: c.inventorySku,
        qtyPerUnit: c.qty,
      })),
    };
  }
  if (entry.inventorySku) {
    return {
      listingSku,
      mapped: true,
      components: [{ inventorySku: entry.inventorySku, qtyPerUnit: 1 }],
    };
  }
  // entry exists but defines nothing usable — treat as unmapped
  return { listingSku, mapped: false, components: [] };
}

/**
 * Auto-suggest an inventory SKU for an unmapped listing SKU by similarity to
 * the inventory master (exact normalized match first, then token overlap).
 * Returns the best candidate's code + a 0–1 score, or null.
 */
export function suggestMapping(
  listingSku: string,
  inventorySkus: { skuCode: string; productName: string }[]
): { skuCode: string; score: number } | null {
  const target = normalize(listingSku);
  if (!target) return null;

  // exact normalized match on code
  const exact = inventorySkus.find((s) => normalize(s.skuCode) === target);
  if (exact) return { skuCode: exact.skuCode, score: 1 };

  // listing SKU often embeds the inventory code as a prefix (e.g. "KURTI-RED-M_v2")
  const tokens = (s: string) => new Set(normalize(s).split(/[^a-z0-9]+/).filter(Boolean));
  const targetTokens = tokens(`${listingSku}`);
  let best: { skuCode: string; score: number } | null = null;
  for (const s of inventorySkus) {
    const cand = tokens(`${s.skuCode} ${s.productName}`);
    if (cand.size === 0) continue;
    let overlap = 0;
    for (const t of targetTokens) if (cand.has(t)) overlap++;
    const score = overlap / Math.max(targetTokens.size, 1);
    // prefix containment is a strong signal
    const codePrefix = normalize(s.skuCode);
    const boosted = target.startsWith(codePrefix) && codePrefix.length >= 3 ? Math.max(score, 0.9) : score;
    if (boosted > 0 && (!best || boosted > best.score)) {
      best = { skuCode: s.skuCode, score: Math.min(1, boosted) };
    }
  }
  return best && best.score >= 0.5 ? best : null;
}

/** Listing SKUs present in orders that have no mapping yet (the tray). */
export function unmappedListingSkus(
  listingSkus: string[],
  map: Map<string, SkuMapEntry>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ls of listingSkus) {
    if (!ls) continue;
    const key = normalize(ls);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!resolveSku(ls, map).mapped) out.push(ls);
  }
  return out;
}
