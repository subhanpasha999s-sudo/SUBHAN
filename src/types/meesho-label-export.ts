/** One Meesho label page after PDF text extraction (strict scope: no PII fields). */
export interface MeeshoLabelRecord {
  id: string;
  listing_sku: string;
  quantity: number | null;
  delivery_partner: string;
  /** 1-based PDF page index */
  page: number;
  /**
   * Which imported PDF this row belongs to (client assigns per upload). Empty in raw parse;
   * always set before rows are shown in the workspace.
   */
  importId: string;
}
