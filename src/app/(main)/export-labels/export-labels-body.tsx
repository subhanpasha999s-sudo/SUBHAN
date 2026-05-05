"use client";

import { MeeshoLabelExportTool } from "@/components/meesho-export/meesho-label-export-tool";

/**
 * Loads the workspace synchronously — avoids flaky `import()` / Turbopack HMR chunk errors on LAN
 * and mobile Safari that looked like “upload does nothing”.
 */
export function ExportLabelsBody() {
  return <MeeshoLabelExportTool />;
}
