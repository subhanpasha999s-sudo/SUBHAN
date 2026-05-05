import type { SkuSpreadsheetRowModel } from "@/types/sku-mapping-module";

const STORAGE_KEY = "sku_mapping_local_draft_v1";

function cleanDraft(
  draft: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft)) {
    const sku = k?.trim();
    const name = v?.trim();
    if (sku && name) out[sku] = name;
  }
  return out;
}

export function readSkuMappingLocalDraft(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const draft: Record<string, string> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string") draft[k] = v;
    }
    return cleanDraft(draft);
  } catch {
    return {};
  }
}

export function writeSkuMappingLocalDraft(draft: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    const cleaned = cleanDraft(draft);
    if (Object.keys(cleaned).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    /* quota */
  }
}

export function countLocalDraftMappings(draft: Record<string, string>): number {
  return Object.keys(cleanDraft(draft)).length;
}

/** Apply browser-only mappings when not signed in (or cloud off). */
export function applyLocalDraftOverlay(
  rows: SkuSpreadsheetRowModel[],
  draft: Record<string, string>
): SkuSpreadsheetRowModel[] {
  return rows.map((r) => {
    const name = draft[r.listing_sku]?.trim();
    if (!name) return r;
    return {
      ...r,
      master_name: name,
      master_id: null,
      status: "mapped",
    };
  });
}
