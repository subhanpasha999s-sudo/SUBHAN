import type { SkuSpreadsheetRowModel } from "@/types/sku-mapping-module";
import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";

/**
 * Join uploaded listing SKUs with `sku_map` + `master_skus` rows from Supabase.
 */
export function mergeListingUploadWithSnapshot(
  uploadedSkus: string[],
  masters: MasterSkuRecord[],
  skuMap: SkuMapRecord[]
): SkuSpreadsheetRowModel[] {
  const masterNameById = new Map(masters.map((m) => [m.id, m.name]));
  const masterCreatedById = new Map(
    masters.map((m) => [m.id, m.created_at])
  );
  const mapByListing = new Map<string, SkuMapRecord>();
  for (const r of skuMap) {
    const ls = r.listing_sku?.trim();
    if (ls) mapByListing.set(ls, r);
  }

  return uploadedSkus.map((listing_sku) => {
    const row = mapByListing.get(listing_sku);
    const mid = row?.master_sku_id ?? null;
    const master_name = mid ? masterNameById.get(mid) ?? null : null;
    const status: SkuSpreadsheetRowModel["status"] =
      master_name ? "mapped" : "unmapped";
    return {
      listing_sku,
      master_name,
      master_id: mid,
      status,
      mapping_created_at: row?.created_at ?? null,
      master_record_created_at: mid
        ? masterCreatedById.get(mid) ?? null
        : null,
    };
  });
}

export function countMappedUnmapped(rows: SkuSpreadsheetRowModel[]): {
  mapped: number;
  unmapped: number;
} {
  let mapped = 0;
  let unmapped = 0;
  for (const r of rows) {
    if (r.status === "mapped") mapped++;
    else unmapped++;
  }
  return { mapped, unmapped };
}
