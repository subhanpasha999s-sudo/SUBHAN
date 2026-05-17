export type MarketplaceKind = "meesho" | "flipkart" | "amazon" | "unknown";
export type PaymentKind = "prepaid" | "cod" | "exchange" | "unknown";
export type LabelFileType = "shipping_label" | "invoice" | "label";
export type LabelMatchStatus =
  | "Matched"
  | "Invoice Missing"
  | "Shipping Label Missing"
  | "Not Required";

/** One marketplace label page after PDF text extraction (strict scope: no PII fields). */
export interface MeeshoLabelRecord {
  id: string;
  listing_sku: string;
  quantity: number | null;
  delivery_partner: string;
  marketplace: MarketplaceKind;
  payment: PaymentKind;
  fileType?: LabelFileType;
  orderId?: string;
  awb?: string;
  customerName?: string;
  shippingAddress?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  productName?: string;
  matchStatus?: LabelMatchStatus;
  /** 1-based PDF page index */
  page: number;
  /** 0-based page index from the source PDF. */
  rawPageIndex: number;
  /**
   * Which imported PDF this row belongs to (client assigns per upload). Empty in raw parse;
   * always set before rows are shown in the workspace.
   */
  importId: string;
  /** Original uploaded filename for mixed multi-file runs. */
  sourceFile: string;
}
