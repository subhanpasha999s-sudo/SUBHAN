/** Row from `public.master_skus`. */
export interface MasterSkuRecord {
  id: string;
  name: string;
  created_at: string;
  user_id?: string;
}

/** Row from `public.sku_map`. */
export interface SkuMapRecord {
  id: string;
  listing_sku: string;
  master_sku_id: string | null;
  category: string;
  created_at: string;
  user_id?: string;
}
