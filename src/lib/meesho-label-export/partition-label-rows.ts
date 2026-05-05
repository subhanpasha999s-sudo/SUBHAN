import type { EnrichedMeeshoLabelRow } from "@/lib/meesho-label-export/master-lookup";

export interface MappedUnmappedPartition {
  mapped: EnrichedMeeshoLabelRow[];
  unmapped: EnrichedMeeshoLabelRow[];
}

/** Split enriched rows by presence of a resolved Master SKU name. */
export function partitionByMasterMapping(
  rows: EnrichedMeeshoLabelRow[]
): MappedUnmappedPartition {
  const mapped: EnrichedMeeshoLabelRow[] = [];
  const unmapped: EnrichedMeeshoLabelRow[] = [];
  for (const r of rows) {
    if (r.master_sku) mapped.push(r);
    else unmapped.push(r);
  }
  return { mapped, unmapped };
}
