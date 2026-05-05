import { ModulePageHeader } from "@/components/layout/module-page-header";

import { ExportLabelsBody } from "./export-labels-body";

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
