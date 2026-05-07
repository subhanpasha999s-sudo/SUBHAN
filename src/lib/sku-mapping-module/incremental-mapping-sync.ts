/** Diff listing→master assignments for incremental persistence (sku_map upserts only). */

export type MappingAssignmentFlat = Record<string, string>; // listing SKU → trimmed master SKU name

export function computeAssignmentDiff(prev: MappingAssignmentFlat, next: MappingAssignmentFlat): {
  listingSkusToUnassign: string[];
  groupsToAssign: { masterName: string; listingSkus: string[] }[];
} {
  const norm = (m: MappingAssignmentFlat) => {
    const out: MappingAssignmentFlat = {};
    for (const [k, v] of Object.entries(m)) {
      const lk = k.trim();
      const mv = v.trim();
      if (!lk) continue;
      if (mv) out[lk] = mv;
    }
    return out;
  };

  const a = norm(prev);
  const b = norm(next);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  const listingSkusToUnassign: string[] = [];
  const assignBuckets = new Map<string, Set<string>>();

  for (const sku of keys) {
    const p = a[sku]?.trim() ?? "";
    const n = b[sku]?.trim() ?? "";
    if (p === n) continue;
    if (p && !n) listingSkusToUnassign.push(sku);
    if (n) {
      if (!assignBuckets.has(n)) assignBuckets.set(n, new Set());
      assignBuckets.get(n)!.add(sku);
    }
  }

  const groupsToAssign = [...assignBuckets.entries()]
    .map(([masterName, set]) => ({
      masterName,
      listingSkus: [...set].sort((x, y) =>
        x.localeCompare(y, undefined, { sensitivity: "base" })
      ),
    }))
    .filter((g) => g.masterName.length > 0 && g.listingSkus.length > 0);

  return { listingSkusToUnassign, groupsToAssign };
}
