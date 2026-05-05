import type { MeeshoLabelRecord } from "@/types/meesho-label-export";
import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";

/** Label row with resolved master name from sku_map / session. */
export interface EnrichedMeeshoLabelRow extends MeeshoLabelRecord {
  master_sku: string | null;
}

export function buildListingToMaster(
  masters: MasterSkuRecord[],
  skuMap: SkuMapRecord[]
): Map<string, string> {
  const byId = new Map<string, string>();
  for (const m of masters) {
    const n = (m.name ?? "").trim();
    if (n) byId.set(m.id, n);
  }
  const out = new Map<string, string>();
  for (const row of skuMap) {
    const ls = row.listing_sku?.trim();
    if (!ls || !row.master_sku_id) continue;
    const name = byId.get(row.master_sku_id);
    if (name) out.set(ls, name);
  }
  return out;
}

/** Session overrides win (same browser, PDF workflow). */
export function mergeListingToMasterMaps(
  remote: Map<string, string>,
  session: Record<string, string>
): Map<string, string> {
  const out = new Map(remote);
  for (const [listing, masterName] of Object.entries(session)) {
    const ls = listing.trim();
    const mn = masterName.trim();
    if (ls && mn) out.set(ls, mn);
  }
  return out;
}

export function enrichLabelRows(
  rows: MeeshoLabelRecord[],
  listingToMaster: Map<string, string>
): EnrichedMeeshoLabelRow[] {
  return rows.map((r) => {
    const ls = r.listing_sku.trim();
    const resolved =
      ls ? listingToMaster.get(ls) ?? listingToMaster.get(r.listing_sku) ?? null : null;
    const mn = resolved?.trim() ?? "";
    return {
      ...r,
      master_sku: mn ? mn : null,
    };
  });
}
