import type { Metadata } from "next";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Run Labels for Meesho, Flipkart, and Amazon dispatch",
  description:
    "Tulmin filters Meesho, Flipkart, and Amazon label PDFs by SKU, quantity, payment type, and courier partner. Upload mixed marketplace labels together and export only the exact dispatch-ready set.",
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
    "Flipkart SKU label PDF",
    "Flipkart courier label filter",
    "Meesho dispatch PDF",
    "Meesho bulk label export",
    "Meesho ecommerce operator tool",
    "label filter by SKU quantity courier",
    "courier-wise label bundle",
    "SKU mapped filter",
  ],
};

export default function ExportLabelsPage() {
  return (
    <>
      <ModulePageHeader
        breadcrumb={[{ label: "Labels" }]}
        title="Run Labels"
        description="Upload Meesho, Flipkart, and Amazon PDFs together. Tulmin detects labels and invoices, filters by SKU, qty, payment, and courier, then exports the exact dispatch-ready set."
      />
      <ExportLabelsBody />
    </>
  );
}
