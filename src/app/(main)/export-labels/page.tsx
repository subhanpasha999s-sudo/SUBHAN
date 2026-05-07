import type { Metadata } from "next";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Meesho labels — filter & export in minutes",
  description:
    "Tulmin parses your Meesho label PDF so you filter by SKU, courier, and quantity, then download only what dispatch ships. Built for sellers who need fast operations—not another warehouse ERP.",
  alternates: { canonical: `${getSiteUrl()}/export-labels` },
  keywords: [
    "Meesho PDF labels",
    "Meesho dispatch PDF",
    "Meesho bulk label export",
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
        description="Filter, organize, and export Meesho labels in minutes. Turn hours of manual PDF work into a 3‑minute Tulmin run—built for high‑volume dispatch teams."
      />
      <ExportLabelsBody />
    </>
  );
}
