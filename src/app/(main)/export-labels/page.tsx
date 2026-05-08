import type { Metadata } from "next";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Meesho label filter tool for ecommerce operators",
  description:
    "Tulmin helps ecommerce operators, especially Meesho teams, filter labels by SKU, courier partner, and quantity, then export only the exact set needed for dispatch.",
  alternates: { canonical: `${getSiteUrl()}/export-labels` },
  keywords: [
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
