export interface CachedSkuWorkspace {
  workspaceId: string;
  fileName: string;
  uploadedAt: string;
  /** Local or cloud touch time (ISO) */
  updatedAt: string;
  listingSkus: string[];
  columnUsed: string | null;
  scannedRows: number;
}
