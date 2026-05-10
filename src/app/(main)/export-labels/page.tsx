import type { Metadata } from "next";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Meesho label filter SaaS by SKU, QTY, and courier partner",
  description:
    "Tulmin is a Meesho label filter SaaS for sellers. Filter labels by SKU, quantity, and courier partner, find labels instantly, and export only the exact dispatch-ready set.",
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
        description="Tulmin is a Meesho label filter SaaS built for dispatch teams. Filter labels by SKU, QTY, and courier partner, then export only the exact labels you need in minutes."
      />
      <ExportLabelsBody />
    </>
  );
}
