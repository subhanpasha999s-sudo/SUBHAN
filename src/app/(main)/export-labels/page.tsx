import type { Metadata } from "next";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Meesho label crop and print tool online",
  description:
    "Use Tulmin as a Meesho label crop, label cropper, label cutter, PDF export, and label print tool. Filter by SKU, courier, quantity, then export dispatch-ready PDFs.",
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
        title="Labels"
        description="Turn hours of manual PDF work into a 3‑minute Tulmin run—built for high‑volume dispatch teams. Filter, organize, and export Meesho labels in minutes."
      />
      <ExportLabelsBody />
    </>
  );
}
