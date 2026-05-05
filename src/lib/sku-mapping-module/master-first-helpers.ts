import type {
  SkuMasterFirstRow,
  SkuSpreadsheetRowModel,
} from "@/types/sku-mapping-module";

function rowRecencyMs(r: SkuSpreadsheetRowModel): number {
  const tryParse = (s: string | null | undefined) => {
    if (!s) return NaN;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : NaN;
  };
  const fromMap = tryParse(r.mapping_created_at ?? undefined);
  if (!Number.isNaN(fromMap)) return fromMap;
  const fromMaster = tryParse(r.master_record_created_at ?? undefined);
  if (!Number.isNaN(fromMaster)) return fromMaster;
  return 0;
}

export function buildMasterFirstRowsFromMerged(
  merged: SkuSpreadsheetRowModel[]
): SkuMasterFirstRow[] {
  type Acc = { listingSkus: string[]; lastActivityMs: number };
  const map = new Map<string, Acc>();
  for (const r of merged) {
    const n = r.master_name?.trim();
    if (!n) continue;
    const acc = map.get(n) ?? { listingSkus: [], lastActivityMs: 0 };
    acc.listingSkus.push(r.listing_sku);
    acc.lastActivityMs = Math.max(acc.lastActivityMs, rowRecencyMs(r));
    map.set(n, acc);
  }
  return [...map.entries()]
    .sort((a, b) => {
      const dt = b[1].lastActivityMs - a[1].lastActivityMs;
      if (dt !== 0) return dt;
      return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
    })
    .map(([masterName, acc]) => ({
      id: `m:${masterName}`,
      masterName,
      listingSkus: [...new Set(acc.listingSkus)].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    }));
}

/** listing_sku → master name (only assigned rows). */
export function flattenMasterFirstRows(
  rows: SkuMasterFirstRow[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const m = r.masterName.trim();
    if (!m) continue;
    for (const ls of r.listingSkus) {
      const sku = ls.trim();
      if (sku) out[sku] = m;
    }
  }
  return out;
}

/** Merge duplicate master names into one group per remote batch call. */
export function mergeGroupsForRemoteBatch(rows: SkuMasterFirstRow[]): {
  masterName: string;
  listingSkus: string[];
}[] {
  const byName = new Map<string, Set<string>>();
  for (const r of rows) {
    const m = r.masterName.trim();
    if (!m) continue;
    const set = byName.get(m) ?? new Set<string>();
    for (const ls of r.listingSkus) {
      const s = ls.trim();
      if (s) set.add(s);
    }
    byName.set(m, set);
  }
  return [...byName.entries()].map(([masterName, listingSkus]) => ({
    masterName,
    listingSkus: [...listingSkus].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    ),
  }));
}

export function newEmptyMasterRow(): SkuMasterFirstRow {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    masterName: "",
    listingSkus: [],
  };
}
