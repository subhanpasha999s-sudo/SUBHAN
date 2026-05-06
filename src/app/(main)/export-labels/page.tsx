import type { Metadata } from "next";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Meesho label PDF import, filters & grouped export",
  description:
    "Upload a Meesho label PDF page-by-page, filter by mapped SKU (single or multi-select), quantity, courier, listing SKU search, preview the grid, and export grouped or selected PDFs for dispatch teams.",
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
        breadcrumb={[{ label: "Label PDF" }]}
        title="Label PDF"
        description="Parse your Meesho label PDF once. Filters use your SKU map (cloud or device). Export only the pages you select."
      />
      <ExportLabelsBody />
    </>
  );
}
