import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Run Labels · Filter, Sort & Crop Marketplace Shipping Labels",
  description:
    "Upload Meesho, Flipkart, and Amazon label PDFs, then filter by SKU, quantity, payment mode, courier, and marketplace. Auto-crop shipping labels or invoices and export clean dispatch PDFs.",
  alternates: { canonical: `${getSiteUrl()}/export-labels` },
  keywords: [
    "label filter software",
    "meesho label filter",
    "flipkart label sorter",
    "amazon shipping label software",
    "sku-wise label sorting",
    "quantity-wise label filtering",
    "courier-wise label sorter",
    "payment mode label filtering",
    "shipping label crop tool",
    "amazon invoice label matcher",
    "bulk label processing",
    "ecommerce dispatch software",
  ],
};

export default function ExportLabelsPage() {
  return <ExportLabelsBody />;
}
