/** Cloud row in `public.sku_mapping_workspace`. */
export interface SkuMappingWorkspaceRecord {
  user_id: string;
  workspace_id: string;
  file_name: string;
  uploaded_at: string;
  updated_at: string;
  listing_skus: string[];
  column_used: string | null;
  scanned_rows: number;
  revision: number;
}
