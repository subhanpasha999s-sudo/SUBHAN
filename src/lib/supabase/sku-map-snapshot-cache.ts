import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";

const STORAGE_PREFIX = "label_iq_sku_map_snapshot_v2:";

export interface CachedSkuMapSnapshot {
  masters: MasterSkuRecord[];
  skuMap: SkuMapRecord[];
  fetchedAt: number;
}

function keyForUser(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readSkuMapSnapshotCache(
  userId: string | null | undefined
): CachedSkuMapSnapshot | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(keyForUser(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as CachedSkuMapSnapshot;
    if (!Array.isArray(p.masters) || !Array.isArray(p.skuMap)) return null;
    if (typeof p.fetchedAt !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export function writeSkuMapSnapshotCache(
  snapshot: {
    masters: MasterSkuRecord[];
    skuMap: SkuMapRecord[];
  },
  userId: string
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedSkuMapSnapshot = {
      masters: snapshot.masters,
      skuMap: snapshot.skuMap,
      fetchedAt: Date.now(),
    };
    window.localStorage.setItem(keyForUser(userId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}
