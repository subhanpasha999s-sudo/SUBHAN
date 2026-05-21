import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Run Labels for Meesho, Flipkart, and Amazon sellers",
  description:
    "Tulmin filters and crops Meesho, Flipkart, and Amazon label PDFs by SKU, quantity, payment type, courier partner, and marketplace. Upload mixed marketplace labels and export clean dispatch-ready PDFs.",
  alternates: { canonical: `${getSiteUrl()}/export-labels` },
  keywords: [
    "meesho label crop",
    "meesho label cropper",
    "crop meesho label",
    "meesho label",
    "meesho label cutter",
    "meesho label crop tool",
    "meesho label crop free",
    "meesho label crop online",
    "meesho label crop pdf",
    "meesho label crop ai",
    "meesho label crop 4x6",
    "meesho label cut",
    "meesho label crop with invoice",
    "meesho label print",
    "meesho label cropping",
    "meesho label printer",
    "meesho label size",
    "quick meesho label crop",
    "meesho label crop a4",
    "meesho label generator",
    "Meesho PDF labels",
    "Flipkart label filter",
    "Flipkart label crop",
    "Flipkart SKU label PDF",
    "Flipkart courier label filter",
    "Amazon label filter",
    "Amazon SKU QTY shipping label",
    "Amazon invoice label matching",
    "Meesho dispatch PDF",
    "Meesho bulk label export",
    "Meesho ecommerce operator tool",
    "label filter by SKU quantity courier",
    "courier-wise label bundle",
    "SKU mapped filter",
  ],
};

export default function ExportLabelsPage() {
  return <ExportLabelsBody />;
}
