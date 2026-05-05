/** One row in the spreadsheet SKU mapping grid (upload ∩ Supabase). */
export interface SkuSpreadsheetRowModel {
  listing_sku: string;
  master_name: string | null;
  master_id: string | null;
  status: "mapped" | "unmapped";
  /** `sku_map.created_at` — used to sort masters by latest mapping activity */
  mapping_created_at?: string | null;
  /** `master_skus.created_at` — fallback when map row has no timestamp */
  master_record_created_at?: string | null;
}

export type MappingStatusFilter = "all" | "mapped" | "unmapped";

/** One master-first row: master name + chosen listing SKUs from the upload. */
export interface SkuMasterFirstRow {
  id: string;
  masterName: string;
  listingSkus: string[];
}
