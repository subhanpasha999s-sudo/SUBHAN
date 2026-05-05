export type QtyBucket = "all" | "single" | "multi";

/**
 * Mapping is many-to-one: several Meesho **listing SKUs** can point at one **master / inventory SKU**.
 */
export interface SkuMappingRow {
  id: string;
  /** SKU text from the marketplace listing / label extraction (distinct per listing variant). */
  meeshoSku: string;
  /** Canonical inventory / ERP “master key” shared across listings. */
  masterSku: string;
  category: string;
  updatedAt: number;
}

export interface ProcessedLabel {
  id: string;
  batchId: string;
  sourceFileName: string;
  pageIndexOneBased: number;
  /** Meesho listing SKU read from Product Details — used to lookup {@link masterSku}. */
  sku: string | null;
  qty: number | null;
  partner: string;
  /** Brand / seller from “Sold by” or return-address style lines */
  brand: string | null;
  /** Resolved via mapping: Meesho listing SKU → master key (inventory). */
  masterSku: string | null;
  category: string | null;
  singlePagePdfBytes: Uint8Array;
  thumbDataUrl: string | null;
}

export interface LabelBatch {
  id: string;
  name: string;
  createdAt: number;
}
