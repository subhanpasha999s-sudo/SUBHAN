import type { CachedSkuWorkspace } from "@/lib/sku-mapping-module/sku-workspace-types";

export type { CachedSkuWorkspace };

const prefix = "lable:sku-workspace-v1:";

export function workspaceLocalCacheKey(userId: string | undefined) {
  return `${prefix}${userId ?? "anon"}`;
}

export function readSkuWorkspaceLocalCache(
  userId: string | undefined
): CachedSkuWorkspace | null {
  if (typeof window === "undefined" || !localStorage) return null;
  try {
    const raw = localStorage.getItem(workspaceLocalCacheKey(userId));
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.workspaceId !== "string" || !Array.isArray(o.listingSkus))
      return null;
    const listingSkus = o.listingSkus.filter((x) => typeof x === "string") as string[];
    if (listingSkus.length === 0) return null;
    return {
      workspaceId: o.workspaceId,
      fileName: typeof o.fileName === "string" ? o.fileName : "",
      uploadedAt: typeof o.uploadedAt === "string" ? o.uploadedAt : "",
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
      listingSkus,
      columnUsed: typeof o.columnUsed === "string" ? o.columnUsed : null,
      scannedRows:
        typeof o.scannedRows === "number" && Number.isFinite(o.scannedRows)
          ? o.scannedRows
          : listingSkus.length,
    };
  } catch {
    return null;
  }
}

export function writeSkuWorkspaceLocalCache(
  userId: string | undefined,
  payload: CachedSkuWorkspace
) {
  if (typeof window === "undefined" || !localStorage) return;
  try {
    localStorage.setItem(
      workspaceLocalCacheKey(userId),
      JSON.stringify(payload)
    );
  } catch {
    /* quota */
  }
}

export function clearSkuWorkspaceLocalCache(userId: string | undefined) {
  if (typeof window === "undefined" || !localStorage) return;
  try {
    localStorage.removeItem(workspaceLocalCacheKey(userId));
  } catch {
    /* ignore */
  }
}
