import type { Metadata } from "next";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { getSiteUrl } from "@/lib/seo/site-url";

import { ExportLabelsBody } from "./export-labels-body";

export const metadata: Metadata = {
  title: "Faster dispatch with smart Meesho label workflows",
  description:
    "Turn one Meesho label PDF into a clean dispatch workflow: filter by mapped SKU, quantity, and courier, then export exactly what your team needs to reduce manual sorting and save packing time.",
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
        description="Upload once, filter instantly, and export only what dispatch needs. Reduce repetitive sorting and move from PDF to packed orders faster."
      />
      <ExportLabelsBody />
    </>
  );
}
