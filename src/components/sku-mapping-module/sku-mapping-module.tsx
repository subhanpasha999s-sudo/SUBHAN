"use client";

import * as React from "react";
import Link from "next/link";
import { toast as notify } from "sonner";
import {
  Loader2,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import {
  WorkspaceModulePageStack,
  WorkspaceSurfaceCard,
} from "@/components/layout/workspace-layout";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SkuMasterFirstPanel } from "@/components/sku-mapping-module/sku-master-first-panel";
import { SkuSpreadsheetUploadZone } from "@/components/sku-mapping-module/sku-spreadsheet-upload-zone";
import {
  buildMasterFirstRowsFromMerged,
  flattenMasterFirstRows,
  newEmptyMasterRow,
} from "@/lib/sku-mapping-module/master-first-helpers";
import { computeAssignmentDiff } from "@/lib/sku-mapping-module/incremental-mapping-sync";
import {
  clearSkuWorkspaceLocalCache,
  readSkuWorkspaceLocalCache,
  writeSkuWorkspaceLocalCache,
} from "@/lib/sku-mapping-module/sku-workspace-local-cache";
import { mergeListingUploadWithSnapshot } from "@/lib/sku-mapping-module/merge-upload-with-snapshot";
import {
  applyLocalDraftOverlay,
  countLocalDraftMappings,
  readSkuMappingLocalDraft,
  writeSkuMappingLocalDraft,
} from "@/lib/sku-mapping-module/sku-mapping-local-draft";
import { parseListingSkuUpload } from "@/lib/sku-mapping-module/parse-listing-sku-upload";
import { useAuth } from "@/lib/supabase/auth-context";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import {
  SIGNIN_NUDGE_DISMISS_KEY,
  SIGNIN_NUDGE_SESSION_KEY,
} from "@/lib/auth/constants";
import { readSkuMapSnapshotCache } from "@/lib/supabase/sku-map-snapshot-cache";
import {
  batchApplyMasterMappingsRemote,
  fetchSkuMapSnapshot,
  getSkuMapAuthContext,
  unassignListingsRemote,
} from "@/lib/supabase/sku-map-remote";
import {
  fetchSkuMappingWorkspace,
  upsertSkuMappingWorkspace,
  deleteSkuMappingWorkspace,
} from "@/lib/supabase/sku-workspace-remote";
import {
  SkuMappingWorkspaceToolbar,
  type WorkspaceAutosaveState,
} from "@/components/sku-mapping-module/sku-mapping-workspace-toolbar";
import type { MappingStatusFilter, SkuMasterFirstRow } from "@/types/sku-mapping-module";
import { cn } from "@/lib/utils";
import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";

const SKU_MAPPING_UPLOAD_SESSION_KEY = "lable:sku-mapping:upload-v1";
const SKU_MAPPING_UPLOAD_LOCAL_PREFIX = "lable:sku-mapping:upload-user:";

function localUploadStorageKey(userId: string) {
  return `${SKU_MAPPING_UPLOAD_LOCAL_PREFIX}${userId}`;
}

type PersistedSkuUploadPayload = {
  listingSkus: string[];
  scannedRows: number;
  columnUsed: string | null;
  userId?: string;
};

function parseSkuUploadPayload(
  raw: string | null
): PersistedSkuUploadPayload | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(o.listingSkus)) return null;
    const listingSkus = o.listingSkus.filter(
      (x) => typeof x === "string"
    ) as string[];
    if (listingSkus.length === 0) return null;
    return {
      listingSkus,
      scannedRows:
        typeof o.scannedRows === "number" && Number.isFinite(o.scannedRows)
          ? o.scannedRows
          : 0,
      columnUsed: typeof o.columnUsed === "string" ? o.columnUsed : null,
      ...(typeof o.userId === "string" ? { userId: o.userId } : {}),
    };
  } catch {
    return null;
  }
}

/** Restores the last imported listing SKU list — cloud holds mappings only. */
function readPersistedSkuUpload(userId: string | undefined): {
  listingSkus: string[];
  scannedRows: number;
  columnUsed: string | null;
} | null {
  if (typeof window === "undefined") return null;

  try {
    if (userId && typeof localStorage !== "undefined") {
      const loc = parseSkuUploadPayload(
        localStorage.getItem(localUploadStorageKey(userId))
      );
      if (
        loc &&
        loc.listingSkus.length &&
        (!loc.userId || loc.userId === userId)
      ) {
        return {
          listingSkus: loc.listingSkus,
          scannedRows: loc.scannedRows,
          columnUsed: loc.columnUsed,
        };
      }
    }
  } catch {
    /* ignore */
  }

  if (typeof sessionStorage === "undefined") return null;
  try {
    const s = parseSkuUploadPayload(
      sessionStorage.getItem(SKU_MAPPING_UPLOAD_SESSION_KEY)
    );
    if (!s?.listingSkus.length) return null;
    if (userId) {
      if (s.userId && s.userId !== userId) return null;
    } else if (s.userId) {
      return null;
    }
    return {
      listingSkus: s.listingSkus,
      scannedRows: s.scannedRows,
      columnUsed: s.columnUsed,
    };
  } catch {
    return null;
  }
}

function persistSkuUpload(
  listingSkus: string[],
  meta: { scannedRows: number; columnUsed: string | null },
  userId: string | undefined
) {
  const payload = {
    listingSkus,
    scannedRows: meta.scannedRows,
    columnUsed: meta.columnUsed,
    ...(userId ? { userId } : {}),
  };

  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(SKU_MAPPING_UPLOAD_SESSION_KEY, JSON.stringify(payload));
    }
  } catch {
    /* quota / private mode */
  }

  if (userId && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(
        localUploadStorageKey(userId),
        JSON.stringify(payload)
      );
    } catch {
      /* quota / private mode */
    }
  }
}

function clearPersistedSkuUpload(userId: string | undefined) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SKU_MAPPING_UPLOAD_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
  if (userId && typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(localUploadStorageKey(userId));
    } catch {
      /* ignore */
    }
  }
}

function clearPersistedSkuWorkspaceShell(userId: string | undefined) {
  clearPersistedSkuUpload(userId);
  clearSkuWorkspaceLocalCache(userId);
}

const SESSION_RESUME_DISMISS_KEY = "lable:sku-mapping:dismiss-resume-session";

/** Session + enrichment cache for SKU listing workspace bundles. */
function persistWorkspaceBundle(
  listingSkus: string[],
  meta: { scannedRows: number; columnUsed: string | null },
  userId: string | undefined,
  bundle: {
    workspaceId: string;
    fileLabel: string;
    uploadedAtIso: string | null;
    cloudUpdatedIso?: string | null;
  }
) {
  persistSkuUpload(listingSkus, meta, userId);

  writeSkuWorkspaceLocalCache(userId, {
    workspaceId: bundle.workspaceId,
    fileName: bundle.fileLabel,
    uploadedAt:
      bundle.uploadedAtIso ??
      new Date().toISOString(),
    updatedAt: bundle.cloudUpdatedIso ?? new Date().toISOString(),
    listingSkus,
    columnUsed: meta.columnUsed,
    scannedRows: meta.scannedRows,
  });
}

export function SkuMappingModule() {
  const { user, authReady } = useAuth();
  const { requestAuthThenContinue, openOptionalSignIn } = useValueFirstAuth();
  const userId = user?.id;

  const cloudConfigured = React.useMemo(
    () => Boolean(getSupabaseBrowser()),
    []
  );

  const remoteAvailable = cloudConfigured && Boolean(userId);

  const [localDraft, setLocalDraft] = React.useState<Record<string, string>>(
    () =>
      typeof window !== "undefined" ? readSkuMappingLocalDraft() : {}
  );
  const [pushDraftBusy, setPushDraftBusy] = React.useState(false);

  const [snapshot, setSnapshot] = React.useState<{
    masters: MasterSkuRecord[];
    skuMap: SkuMapRecord[];
  } | null>(null);
  const [snapshotLoading, setSnapshotLoading] = React.useState(false);
  const [snapshotRefreshing, setSnapshotRefreshing] = React.useState(false);

  const [uploadedSkus, setUploadedSkus] = React.useState<string[]>([]);
  const [uploadMeta, setUploadMeta] = React.useState<{
    scannedRows: number;
    columnUsed: string | null;
  } | null>(null);
  const [parseBusy, setParseBusy] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const [masterRows, setMasterRows] = React.useState<SkuMasterFirstRow[]>([]);
  const [fileEpoch, setFileEpoch] = React.useState(0);
  const masterRowsRef = React.useRef(masterRows);
  React.useEffect(() => {
    masterRowsRef.current = masterRows;
  }, [masterRows]);

  const [editListingOpen, setEditListingOpen] = React.useState(false);
  const [editListingDraft, setEditListingDraft] = React.useState("");
  const [resetGroupingOpen, setResetGroupingOpen] = React.useState(false);
  const [removeUploadOpen, setRemoveUploadOpen] = React.useState(false);

  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [workspaceFileLabel, setWorkspaceFileLabel] = React.useState("");
  const [workspaceUploadedAtIso, setWorkspaceUploadedAtIso] = React.useState<
    string | null
  >(null);
  const [cloudWorkspaceUpdatedAt, setCloudWorkspaceUpdatedAt] = React.useState<
    string | null
  >(null);

  const [workspaceSearch, setWorkspaceSearch] =
    React.useState("");
  const [mappingStatusFilter, setMappingStatusFilter] =
    React.useState<MappingStatusFilter>("all");

  const [autosaveUi, setAutosaveUi] = React.useState<{
    state: WorkspaceAutosaveState;
    detail: string | null;
  }>({ state: "idle", detail: null });
  const [mappingLastSyncedAt, setMappingLastSyncedAt] = React.useState<
    string | null
  >(null);

  const [workspaceBootBusy, setWorkspaceBootBusy] = React.useState(false);
  const [resumeWorkspaceOpen, setResumeWorkspaceOpen] = React.useState(false);
  const [signinNudgeOpen, setSigninNudgeOpen] = React.useState(false);

  const workspaceIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const persistenceQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const enqueuePersistJob = React.useCallback((job: () => Promise<unknown>) => {
    persistenceQueueRef.current = persistenceQueueRef.current
      .then(() => job().then(() => undefined))
      .catch((e: unknown) => {
        console.warn(e);
      });
  }, []);

  const lastSyncedAssignmentFlatRef =
    React.useRef<Record<string, string>>({});
  /** First debounced autosave cycle after reset only syncs refs; no API churn. */
  const initialAutosaveBypassRef = React.useRef(true);
  const assignmentDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const workspaceListingDebounceRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const resumePromptShownRef = React.useRef(false);
  const previousUserIdRef = React.useRef<string | null>(null);

  const resetLocalWorkspaceView = React.useCallback(
    (previousUserId?: string | null) => {
      if (assignmentDebounceRef.current) {
        clearTimeout(assignmentDebounceRef.current);
        assignmentDebounceRef.current = null;
      }
      if (workspaceListingDebounceRef.current) {
        clearTimeout(workspaceListingDebounceRef.current);
        workspaceListingDebounceRef.current = null;
      }

      clearPersistedSkuUpload(previousUserId ?? undefined);
      clearPersistedSkuUpload(undefined);
      clearSkuWorkspaceLocalCache(previousUserId ?? undefined);
      clearSkuWorkspaceLocalCache(undefined);
      writeSkuMappingLocalDraft({});

      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(SESSION_RESUME_DISMISS_KEY);
          sessionStorage.removeItem(SIGNIN_NUDGE_SESSION_KEY);
        }
      } catch {
        /* ignore */
      }

      setLocalDraft({});
      setSnapshot(null);
      setSnapshotLoading(false);
      setSnapshotRefreshing(false);
      setUploadedSkus([]);
      setUploadMeta(null);
      setMasterRows([]);
      setEditListingOpen(false);
      setEditListingDraft("");
      setResetGroupingOpen(false);
      setRemoveUploadOpen(false);
      setWorkspaceId(null);
      setWorkspaceFileLabel("");
      setWorkspaceUploadedAtIso(null);
      setCloudWorkspaceUpdatedAt(null);
      setWorkspaceSearch("");
      setMappingStatusFilter("all");
      setAutosaveUi({ state: "idle", detail: null });
      setMappingLastSyncedAt(null);
      setWorkspaceBootBusy(false);
      setResumeWorkspaceOpen(false);
      setSigninNudgeOpen(false);
      lastSyncedAssignmentFlatRef.current = {};
      initialAutosaveBypassRef.current = true;
      resumePromptShownRef.current = false;
      setFileEpoch((n) => n + 1);
    },
    []
  );

  React.useEffect(() => {
    if (!authReady) return;
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && !userId) {
      resetLocalWorkspaceView(previousUserId);
    }
    previousUserIdRef.current = userId ?? null;
  }, [authReady, resetLocalWorkspaceView, userId]);

  const pullRemoteSkuSnapshot = React.useCallback(async () => {
    if (!cloudConfigured || !userId) return;
    const snap = await fetchSkuMapSnapshot();
    if (snap.ok && snap.masters && snap.skuMap) {
      setSnapshot({ masters: snap.masters, skuMap: snap.skuMap });
    } else {
      setSnapshot(null);
    }
  }, [cloudConfigured, userId]);

  React.useEffect(() => {
    if (!authReady) return;
    if (!cloudConfigured || !userId) {
      setSnapshot(null);
      setSnapshotLoading(false);
      return;
    }

    let cancelled = false;
    const c = readSkuMapSnapshotCache(userId);
    const hasCache = Boolean(c?.masters && c.skuMap);
    if (hasCache && c?.masters && c.skuMap) {
      setSnapshot({ masters: c.masters, skuMap: c.skuMap });
      setSnapshotLoading(false);
    } else {
      setSnapshotLoading(true);
    }

    const run = async () => {
      if (cancelled) return;
      try {
        await pullRemoteSkuSnapshot();
      } finally {
        if (!cancelled) setSnapshotLoading(false);
      }
    };

    if (typeof window === "undefined") return undefined;

    if (typeof window.requestIdleCallback !== "undefined") {
      const id = window.requestIdleCallback(() => void run(), {
        timeout: hasCache ? 14_000 : 6_000,
      });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }

    const t = window.setTimeout(() => void run(), hasCache ? 1600 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [authReady, cloudConfigured, userId, pullRemoteSkuSnapshot]);

  React.useEffect(() => {
    if (!authReady) return;
    if (uploadedSkus.length > 0) return;

    let cancelled = false;

    const pickLegacyEnvelope = (): {
      listingSkus: string[];
      scannedRows: number;
      columnUsed: string | null;
    } | null => readPersistedSkuUpload(userId);

    const hasDeviceMap = countLocalDraftMappings(readSkuMappingLocalDraft()) > 0;

    async function hydrateWorkspace() {
      if (!remoteAvailable) {
        setWorkspaceBootBusy(true);
        try {
          if (cancelled) return;
          if (!hasDeviceMap) {
            clearPersistedSkuWorkspaceShell(userId);
            return;
          }
          const cache = readSkuWorkspaceLocalCache(userId);
          const legacy = pickLegacyEnvelope();
          const listings =
            cache?.listingSkus?.length ? cache.listingSkus
            : legacy?.listingSkus?.length ? legacy.listingSkus
            : null;
          if (listings?.length) {
            const scanned =
              cache?.listingSkus?.length ?
                cache.scannedRows || cache.listingSkus.length
              : legacy!.scannedRows || listings.length;
            const col =
              cache?.listingSkus?.length ? cache.columnUsed : legacy!.columnUsed;
            if (cache?.workspaceId) setWorkspaceId(cache.workspaceId);
            if (cache?.fileName) setWorkspaceFileLabel(cache.fileName);
            if (cache?.uploadedAt) setWorkspaceUploadedAtIso(cache.uploadedAt);
            setUploadedSkus(listings);
            setUploadMeta({ scannedRows: scanned, columnUsed: col });
            setFileEpoch((n) => n + 1);
            initialAutosaveBypassRef.current = true;
          }
        } finally {
          if (!cancelled) setWorkspaceBootBusy(false);
        }
        return;
      }

      setWorkspaceBootBusy(true);

      try {
        const cached = readSkuWorkspaceLocalCache(userId);
        const legacy = pickLegacyEnvelope();
        const cloudWs = await fetchSkuMappingWorkspace();
        if (!cloudWs.ok && !cancelled) {
          setAutosaveUi({
            state: "offline",
            detail:
              `${cloudWs.message} — showing local cache until the cloud responds.`,
          });
        }

        let chosen:
          | {
              listingSkus: string[];
              scannedRows: number;
              columnUsed: string | null;
              workspaceId: string;
              fileName: string;
              uploadedAtIso: string;
              cloudUpdatedIso: string;
            }
          | null = null;

        const cloudListing =
          cloudWs.ok &&
          cloudWs.workspace &&
          cloudWs.workspace.listing_skus.length > 0 ?
            cloudWs.workspace
          : undefined;

        if (cloudListing) {
          const cloudTs = Date.parse(cloudListing.updated_at);
          const cachedTs =
            cached ? Date.parse(cached.updatedAt) : Number.NaN;
          const preferCached =
            Number.isFinite(cachedTs) &&
            Number.isFinite(cloudTs) &&
            cachedTs > cloudTs;

          const src = preferCached && cached?.listingSkus.length ? cached : null;
          if (preferCached && src) {
            chosen = {
              listingSkus: src.listingSkus,
              scannedRows:
                src.scannedRows || src.listingSkus.length,
              columnUsed:
                src.columnUsed ?? cloudListing.column_used,
              workspaceId:
                src.workspaceId || cloudListing.workspace_id,
              fileName:
                src.fileName || cloudListing.file_name || "(workspace)",
              uploadedAtIso:
                src.uploadedAt || cloudListing.uploaded_at,
              cloudUpdatedIso: new Date(
                Math.max(cloudTs, cachedTs || 0)
              ).toISOString(),
            };

            await upsertSkuMappingWorkspace({
              workspaceId: chosen.workspaceId,
              fileName: chosen.fileName,
              uploadedAt: chosen.uploadedAtIso,
              listingSkus: chosen.listingSkus,
              columnUsed: chosen.columnUsed,
              scannedRows:
                chosen.scannedRows || chosen.listingSkus.length,
            }).catch(() => {
              setAutosaveUi({
                state: "offline",
                detail: "Showing device copy • cloud reconnect will sync listings.",
              });
            });
          } else {
            chosen = {
              listingSkus: cloudListing.listing_skus,
              scannedRows:
                cloudListing.scanned_rows || cloudListing.listing_skus.length,
              columnUsed: cloudListing.column_used,
              workspaceId: cloudListing.workspace_id,
              fileName: cloudListing.file_name || "(workspace)",
              uploadedAtIso: cloudListing.uploaded_at,
              cloudUpdatedIso: cloudListing.updated_at,
            };
          }
        } else if (!cloudWs.ok && hasDeviceMap && cached?.listingSkus.length) {
          chosen = {
            listingSkus: cached.listingSkus,
            scannedRows: cached.scannedRows || cached.listingSkus.length,
            columnUsed: cached.columnUsed,
            workspaceId: cached.workspaceId,
            fileName: cached.fileName || "(import)",
            uploadedAtIso: cached.uploadedAt,
            cloudUpdatedIso: cached.updatedAt,
          };
          await upsertSkuMappingWorkspace({
            workspaceId: chosen.workspaceId,
            fileName: chosen.fileName,
            uploadedAt: chosen.uploadedAtIso,
            listingSkus: chosen.listingSkus,
            columnUsed: chosen.columnUsed,
            scannedRows: chosen.scannedRows,
          }).catch(() => {
            setAutosaveUi({
              state: "offline",
              detail: null,
            });
          });
        } else if (!cloudWs.ok && hasDeviceMap && legacy?.listingSkus.length) {
          const wid =
            crypto.randomUUID?.() ?? `ws-${Date.now().toString(36)}`;
          chosen = {
            listingSkus: legacy.listingSkus,
            scannedRows: legacy.scannedRows,
            columnUsed: legacy.columnUsed,
            workspaceId: wid,
            fileName: "(import)",
            uploadedAtIso: new Date().toISOString(),
            cloudUpdatedIso: new Date().toISOString(),
          };
          persistWorkspaceBundle(
            chosen.listingSkus,
            {
              scannedRows: chosen.scannedRows,
              columnUsed: chosen.columnUsed,
            },
            userId,
            {
              workspaceId: chosen.workspaceId,
              fileLabel: chosen.fileName,
              uploadedAtIso: chosen.uploadedAtIso,
              cloudUpdatedIso: chosen.cloudUpdatedIso,
            }
          );
          await upsertSkuMappingWorkspace({
            workspaceId: chosen.workspaceId,
            fileName: chosen.fileName,
            uploadedAt: chosen.uploadedAtIso,
            listingSkus: chosen.listingSkus,
            columnUsed: chosen.columnUsed,
            scannedRows: chosen.scannedRows,
          }).catch(() => {
            setAutosaveUi({
              state: "offline",
              detail: null,
            });
          });
        } else if (cloudWs.ok && !cloudListing) {
          clearPersistedSkuWorkspaceShell(userId);
        }

        if (chosen && !cancelled) {
          setUploadedSkus(chosen.listingSkus);
          setUploadMeta({
            scannedRows:
              chosen.scannedRows || chosen.listingSkus.length,
            columnUsed: chosen.columnUsed,
          });
          setWorkspaceId(chosen.workspaceId);
          setWorkspaceFileLabel(chosen.fileName);
          setWorkspaceUploadedAtIso(chosen.uploadedAtIso);
          setCloudWorkspaceUpdatedAt(chosen.cloudUpdatedIso);
          persistWorkspaceBundle(
            chosen.listingSkus,
            {
              scannedRows:
                chosen.scannedRows || chosen.listingSkus.length,
              columnUsed: chosen.columnUsed,
            },
            userId,
            {
              workspaceId: chosen.workspaceId,
              fileLabel: chosen.fileName,
              uploadedAtIso: chosen.uploadedAtIso,
              cloudUpdatedIso: chosen.cloudUpdatedIso,
            }
          );
          initialAutosaveBypassRef.current = true;
          setFileEpoch((n) => n + 1);
        }

        await pullRemoteSkuSnapshot();
      } finally {
        if (!cancelled) setWorkspaceBootBusy(false);
      }
    }

    void hydrateWorkspace();
    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    uploadedSkus.length,
    remoteAvailable,
    userId,
    pullRemoteSkuSnapshot,
  ]);

  async function onManualRefresh() {
    if (!cloudConfigured || !userId) return;
    setSnapshotRefreshing(true);
    try {
      await pullRemoteSkuSnapshot();
      notify.success("Changes synced", {
        description: "Latest Tulmin SKU map pulled from cloud.",
      });
    } finally {
      setSnapshotRefreshing(false);
    }
  }

  const mergedRows = React.useMemo(() => {
    if (!uploadedSkus.length) return [];
    const base = mergeListingUploadWithSnapshot(
      uploadedSkus,
      snapshot?.masters ?? [],
      snapshot?.skuMap ?? []
    );
    if (remoteAvailable) return base;
    return applyLocalDraftOverlay(base, localDraft);
  }, [uploadedSkus, snapshot, localDraft, remoteAvailable]);

  React.useEffect(() => {
    if (!uploadedSkus.length) {
      setMasterRows([]);
      return;
    }
    setMasterRows((prev) => {
      const base = buildMasterFirstRowsFromMerged(mergedRows);
      const emptyDrafts = prev.filter(
        (r) => !r.masterName.trim() && r.listingSkus.length === 0
      );
      return [...emptyDrafts, ...base];
    });
  }, [uploadedSkus, mergedRows, fileEpoch]);

  const counts = React.useMemo(() => {
    const assigned = new Set(masterRows.flatMap((r) => r.listingSkus));
    return {
      mapped: assigned.size,
      unmapped: Math.max(0, uploadedSkus.length - assigned.size),
    };
  }, [masterRows, uploadedSkus.length]);

  const completedPercent = React.useMemo(() => {
    if (!uploadedSkus.length) return 0;
    return Math.min(
      100,
      Math.round((counts.mapped / uploadedSkus.length) * 100)
    );
  }, [counts.mapped, uploadedSkus.length]);

  const runAssignmentPersistence = React.useCallback(async (): Promise<boolean> => {
    if (!remoteAvailable || !userId) return false;

    const flat = flattenMasterFirstRows(masterRowsRef.current);

    if (initialAutosaveBypassRef.current) {
      initialAutosaveBypassRef.current = false;
      lastSyncedAssignmentFlatRef.current = { ...flat };
      setAutosaveUi({ state: "idle", detail: null });
      return true;
    }

    const diff = computeAssignmentDiff(
      lastSyncedAssignmentFlatRef.current,
      flat
    );

    if (diff.groupsToAssign.length === 0 && diff.listingSkusToUnassign.length === 0)
      return true;

    try {
      setAutosaveUi({ state: "syncing", detail: null });
      const auth = await getSkuMapAuthContext();
      if (!auth.ok) {
        throw new Error(auth.message);
      }

      if (diff.listingSkusToUnassign.length > 0) {
        const u = await unassignListingsRemote(diff.listingSkusToUnassign);
        if (!u.ok) throw new Error(u.message);
      }

      if (diff.groupsToAssign.length > 0) {
        const res = await batchApplyMasterMappingsRemote(diff.groupsToAssign);
        if (!res.ok) throw new Error(res.message);
      }

      await pullRemoteSkuSnapshot();
      lastSyncedAssignmentFlatRef.current = { ...flat };
      setMappingLastSyncedAt(new Date().toISOString());
      setAutosaveUi({ state: "saved", detail: null });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAutosaveUi({ state: "error", detail: msg });
      notify.error(msg);
      return false;
    }
  }, [remoteAvailable, userId, pullRemoteSkuSnapshot]);

  React.useEffect(() => {
    if (!remoteAvailable || !userId || uploadedSkus.length === 0) return;
    if (bulkBusy || parseBusy) return;
    if (assignmentDebounceRef.current) {
      clearTimeout(assignmentDebounceRef.current);
    }
    assignmentDebounceRef.current = setTimeout(() => {
      const nextFlat = flattenMasterFirstRows(masterRowsRef.current);
      if (!initialAutosaveBypassRef.current) {
        const pending = computeAssignmentDiff(
          lastSyncedAssignmentFlatRef.current,
          nextFlat
        );
        if (
          pending.groupsToAssign.length === 0 &&
          pending.listingSkusToUnassign.length === 0
        )
          return;
      }
      enqueuePersistJob(() => runAssignmentPersistence());
    }, 1850);
    return () => {
      if (assignmentDebounceRef.current) {
        clearTimeout(assignmentDebounceRef.current);
        assignmentDebounceRef.current = null;
      }
    };
  }, [
    masterRows,
    uploadedSkus.length,
    remoteAvailable,
    userId,
    enqueuePersistJob,
    runAssignmentPersistence,
    bulkBusy,
    parseBusy,
  ]);

  React.useEffect(() => {
    if (!remoteAvailable || !userId || uploadedSkus.length === 0) return;
    if (bulkBusy || parseBusy) return;
    if (workspaceListingDebounceRef.current) {
      clearTimeout(workspaceListingDebounceRef.current);
    }
    workspaceListingDebounceRef.current = setTimeout(() => {
      enqueuePersistJob(async () => {
        const wid = workspaceIdRef.current;
        if (!wid) return;
        const up = await upsertSkuMappingWorkspace({
          workspaceId: wid,
          fileName: workspaceFileLabel || "Inventory import",
          uploadedAt: workspaceUploadedAtIso ?? undefined,
          listingSkus: uploadedSkus,
          columnUsed: uploadMeta?.columnUsed ?? null,
          scannedRows: uploadMeta?.scannedRows ?? uploadedSkus.length,
        });
        if (!up.ok) {
          setAutosaveUi({ state: "error", detail: up.message });
          return;
        }
        if (up.workspace) {
          setWorkspaceId(up.workspace.workspace_id);
          setCloudWorkspaceUpdatedAt(up.workspace.updated_at);
          persistWorkspaceBundle(
            uploadedSkus,
            {
              scannedRows: uploadMeta?.scannedRows ?? uploadedSkus.length,
              columnUsed: uploadMeta?.columnUsed ?? null,
            },
            userId,
            {
              workspaceId: up.workspace.workspace_id,
              fileLabel: workspaceFileLabel || up.workspace.file_name,
              uploadedAtIso:
                workspaceUploadedAtIso ?? up.workspace.uploaded_at,
              cloudUpdatedIso: up.workspace.updated_at,
            }
          );
        }
      });
    }, 1100);
    return () => {
      if (workspaceListingDebounceRef.current) {
        clearTimeout(workspaceListingDebounceRef.current);
        workspaceListingDebounceRef.current = null;
      }
    };
  }, [
    uploadedSkus,
    uploadMeta,
    workspaceFileLabel,
    workspaceUploadedAtIso,
    remoteAvailable,
    userId,
    enqueuePersistJob,
    bulkBusy,
    parseBusy,
  ]);

  React.useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (workspaceBootBusy) return;
    if (uploadedSkus.length === 0 || counts.unmapped === 0) return;
    if (resumePromptShownRef.current) return;
    if (sessionStorage.getItem(SESSION_RESUME_DISMISS_KEY) === "1") return;
    resumePromptShownRef.current = true;
    setResumeWorkspaceOpen(true);
  }, [workspaceBootBusy, uploadedSkus.length, counts.unmapped]);

  async function ingestFile(file: File) {
    setParseBusy(true);
    try {
      const res = await parseListingSkuUpload(file);
      if (res.error) {
        notify.error(res.error);
        return;
      }
      if (res.listingSkus.length === 0) {
        notify.error("No listing SKUs found", {
          description: res.columnUsed
            ? `Column “${res.columnUsed}” is empty after scanning ${res.scannedRows.toLocaleString()} rows.`
            : `Scanned ${res.scannedRows.toLocaleString()} row(s).`,
        });
        return;
      }
      resumePromptShownRef.current = false;
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(SESSION_RESUME_DISMISS_KEY);
      }

      const upAt = new Date().toISOString();
      const wsId =
        crypto.randomUUID?.() ?? `ws-${Date.now().toString(36)}`;
      initialAutosaveBypassRef.current = true;

      setUploadedSkus(res.listingSkus);
      setUploadMeta({
        scannedRows: res.scannedRows,
        columnUsed: res.columnUsed,
      });
      setWorkspaceId(wsId);
      setWorkspaceFileLabel(file.name || "Import");
      setWorkspaceUploadedAtIso(upAt);
      setCloudWorkspaceUpdatedAt(upAt);
      persistWorkspaceBundle(
        res.listingSkus,
        {
          scannedRows: res.scannedRows,
          columnUsed: res.columnUsed,
        },
        userId,
        {
          workspaceId: wsId,
          fileLabel: file.name || "Import",
          uploadedAtIso: upAt,
          cloudUpdatedIso: upAt,
        }
      );
      setFileEpoch((n) => n + 1);
      notify.success(
        `${res.listingSkus.length.toLocaleString()} listing SKUs imported`
      );

      if (remoteAvailable && userId) {
        enqueuePersistJob(async () => {
          const cw = await upsertSkuMappingWorkspace({
            workspaceId: wsId,
            fileName: file.name || "Import",
            uploadedAt: upAt,
            listingSkus: res.listingSkus,
            columnUsed: res.columnUsed,
            scannedRows: res.scannedRows || res.listingSkus.length,
          });
          if (cw.ok && cw.workspace) {
            setWorkspaceId(cw.workspace.workspace_id);
            setCloudWorkspaceUpdatedAt(cw.workspace.updated_at);
            persistWorkspaceBundle(
              res.listingSkus,
              {
                scannedRows: res.scannedRows,
                columnUsed: res.columnUsed,
              },
              userId,
              {
                workspaceId: cw.workspace.workspace_id,
                fileLabel: cw.workspace.file_name,
                uploadedAtIso: cw.workspace.uploaded_at,
                cloudUpdatedIso: cw.workspace.updated_at,
              }
            );
          }
        });
      }

      await pullRemoteSkuSnapshot();
    } finally {
      setParseBusy(false);
    }
  }

  /** Drop persisted import, clear grid, prune device-only drafts for dropped SKUs. */
  function removeUploadedListing(skusToRemove: readonly string[]) {
    const drop = new Set(skusToRemove);
    clearPersistedSkuUpload(userId);
    clearSkuWorkspaceLocalCache(userId);
    if (remoteAvailable && userId) {
      void deleteSkuMappingWorkspace();
    }
    setLocalDraft((prev) => {
      const next = { ...prev };
      for (const sku of drop) delete next[sku];
      writeSkuMappingLocalDraft(next);
      return next;
    });
    setUploadedSkus([]);
    setUploadMeta(null);
    setMasterRows([]);
    setWorkspaceId(null);
    setWorkspaceFileLabel("");
    setWorkspaceUploadedAtIso(null);
    setCloudWorkspaceUpdatedAt(null);
    lastSyncedAssignmentFlatRef.current = {};
    initialAutosaveBypassRef.current = true;
    setMappingLastSyncedAt(null);
    setFileEpoch((n) => n + 1);
  }

  function confirmRemoveUpload() {
    removeUploadedListing(uploadedSkus);
    setRemoveUploadOpen(false);
    notify.success("Upload cleared", {
      description:
        "The imported listing list is cleared on this device. Saved workspace mappings stay in the cloud.",
    });
  }

  function confirmResetGrouping() {
    const base = buildMasterFirstRowsFromMerged(mergedRows);
    setMasterRows(base.length > 0 ? base : [newEmptyMasterRow()]);
    setResetGroupingOpen(false);
    notify.success("Grouping reset", {
      description:
        "SKU rows rebuilt from saved mappings for this listing set. Sheet edits weren’t saved.",
    });
  }

  function submitEditListing() {
    const lines = editListingDraft
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const uniq = [...new Set(lines)];
    if (uniq.length === 0) {
      notify.error("Add at least one listing SKU.");
      return;
    }
    const keepSet = new Set(uniq);
    setLocalDraft((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!keepSet.has(k)) delete next[k];
      }
      writeSkuMappingLocalDraft(next);
      return next;
    });
    const wid =
      workspaceId ??
      (crypto.randomUUID?.() ?? `ws-${Date.now().toString(36)}`);
    if (!workspaceId) setWorkspaceId(wid);
    const upAt = workspaceUploadedAtIso ?? new Date().toISOString();
    if (!workspaceUploadedAtIso) setWorkspaceUploadedAtIso(upAt);

    setUploadedSkus(uniq);
    setUploadMeta({ scannedRows: uniq.length, columnUsed: null });
    persistWorkspaceBundle(
      uniq,
      { scannedRows: uniq.length, columnUsed: null },
      userId,
      {
        workspaceId: wid,
        fileLabel: workspaceFileLabel || "Manual list",
        uploadedAtIso: upAt,
        cloudUpdatedIso: new Date().toISOString(),
      }
    );
    initialAutosaveBypassRef.current = true;
    if (remoteAvailable && userId) {
      enqueuePersistJob(() =>
        upsertSkuMappingWorkspace({
          workspaceId: wid,
          fileName: workspaceFileLabel || "Manual list",
          uploadedAt: upAt,
          listingSkus: uniq,
          columnUsed: null,
          scannedRows: uniq.length,
        }).then((cw) => {
          if (cw.ok && cw.workspace) {
            setCloudWorkspaceUpdatedAt(cw.workspace.updated_at);
          }
        })
      );
    }
    setFileEpoch((n) => n + 1);
    setEditListingOpen(false);
    notify.success(
      `${uniq.length.toLocaleString()} listing SKU${uniq.length === 1 ? "" : "s"} updated`,
      {
        description: "Local drafts for removed SKUs were cleared.",
      }
    );
  }

  async function flushMappingsManual() {
    if (!uploadedSkus.length) return;

    if (!cloudConfigured) {
      notify.error("Connect Supabase in Settings to save.", {
        description: "Add your project keys to `.env.local`, then reload.",
      });
      return;
    }

    setBulkBusy(true);
    try {
      const auth = await getSkuMapAuthContext();
      if (!auth.ok) {
        notify.error(auth.message);
        return;
      }

      initialAutosaveBypassRef.current = false;
      const ok = await runAssignmentPersistence();

      if (!ok) return;

      setLocalDraft((prev) => {
        const next = { ...prev };
        for (const sku of uploadedSkus) delete next[sku];
        writeSkuMappingLocalDraft(next);
        return next;
      });

      if (workspaceId) {
        persistWorkspaceBundle(
          uploadedSkus,
          uploadMeta ?? {
            scannedRows: uploadedSkus.length,
            columnUsed: null,
          },
          userId,
          {
            workspaceId: workspaceId,
            fileLabel: workspaceFileLabel || "Inventory import",
            uploadedAtIso:
              workspaceUploadedAtIso ?? new Date().toISOString(),
            cloudUpdatedIso: cloudWorkspaceUpdatedAt ?? new Date().toISOString(),
          }
        );
      }

      notify.success("Changes synced", {
        description:
          "Tulmin saved your mappings. Your import list stays visible—finish any remaining SKUs anytime.",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  const flushMappingsManualRef = React.useRef(flushMappingsManual);
  flushMappingsManualRef.current = flushMappingsManual;

  function handleProtectedSaveMappings() {
    if (!uploadedSkus.length) return;
    if (!cloudConfigured) {
      notify.error("Connect Supabase in Settings to save.", {
        description: "Add keys, reload, then try again.",
      });
      return;
    }
    if (!authReady) return;
    if (!userId) {
      requestAuthThenContinue(
        () => void flushMappingsManualRef.current(),
        "save-sku-mapping"
      );
      return;
    }
    void flushMappingsManual();
  }

  async function pushLocalDraftToCloud() {
    if (!remoteAvailable || pushDraftBusy) return;
    const n = countLocalDraftMappings(localDraft);
    if (n === 0) return;

    const byMaster = new Map<string, string[]>();
    for (const [sku, name] of Object.entries(localDraft)) {
      const m = name.trim();
      const s = sku.trim();
      if (!m || !s) continue;
      const arr = byMaster.get(m) ?? [];
      arr.push(s);
      byMaster.set(m, arr);
    }

    const groups = [...byMaster.entries()].map(([masterName, listingSkus]) => ({
      masterName,
      listingSkus,
    }));

    setPushDraftBusy(true);
    try {
      const res = await batchApplyMasterMappingsRemote(groups);
      if (!res.ok) {
        notify.error(res.message);
        return;
      }
      writeSkuMappingLocalDraft({});
      setLocalDraft({});
      await pullRemoteSkuSnapshot();
      notify.success("Changes synced", {
        description: "Local Tulmin drafts merged into your workspace.",
      });
    } finally {
      setPushDraftBusy(false);
    }
  }

  const globalBusy =
    snapshotLoading ||
    parseBusy ||
    bulkBusy ||
    snapshotRefreshing ||
    pushDraftBusy;

  const pendingLocalOnlyCount = countLocalDraftMappings(localDraft);

  React.useEffect(() => {
    if (!authReady || userId || !cloudConfigured || uploadedSkus.length === 0)
      return;
    if (resumeWorkspaceOpen || signinNudgeOpen) return;

    try {
      if (localStorage.getItem(SIGNIN_NUDGE_DISMISS_KEY) === "1") return;
      if (sessionStorage.getItem(SIGNIN_NUDGE_SESSION_KEY) === "1") return;
      sessionStorage.setItem(SIGNIN_NUDGE_SESSION_KEY, "1");
    } catch {
      /* private browsing can block storage; still show once for this render path */
    }

    const id = window.setTimeout(() => setSigninNudgeOpen(true), 700);
    return () => window.clearTimeout(id);
  }, [
    authReady,
    cloudConfigured,
    resumeWorkspaceOpen,
    signinNudgeOpen,
    uploadedSkus.length,
    userId,
  ]);

  function closeSigninNudge() {
    setSigninNudgeOpen(false);
  }

  function dismissSigninNudgeForever() {
    try {
      localStorage.setItem(SIGNIN_NUDGE_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    closeSigninNudge();
  }

  function acceptSigninNudge() {
    closeSigninNudge();
    openOptionalSignIn();
  }

  const headerBadges = !cloudConfigured
    ? null
    : !userId ? (
    <span className="inline-flex max-w-xl flex-wrap items-center gap-x-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-50">
      Everything stays on this device until you choose backup. Optional:{" "}
      <button
        type="button"
        onClick={openOptionalSignIn}
        className="interaction-press rounded px-0.5 font-semibold text-primary underline-offset-2 hover:bg-primary/10 hover:underline"
      >
        Sign in or create an account
      </button>{" "}
      to store your SKU map in your private cloud workspace—free forever.
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-50">
      <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" aria-hidden />
      Workspace synced
    </span>
  );

  return (
    <>
      <div data-tour="sku-map-link">
        <ModulePageHeader
          breadcrumb={[
            { label: "Labels", href: "/export-labels" },
            { label: "SKU Mapping" },
          ]}
          title="SKU Mapping"
          description="Build your master SKU map once. Tulmin remembers it and keeps every future label run ready to filter."
          badges={headerBadges}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {remoteAvailable && pendingLocalOnlyCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  className="font-semibold disabled:opacity-40"
                  disabled={pushDraftBusy || globalBusy}
                  onClick={() => void pushLocalDraftToCloud()}
                >
                  {pushDraftBusy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  ) : null}
                  Sync local drafts ({pendingLocalOnlyCount})
                </Button>
              ) : null}
              {cloudConfigured && userId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={snapshotRefreshing}
                  onClick={() => void onManualRefresh()}
                >
                  {snapshotRefreshing ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="mr-2 size-4" aria-hidden />
                  )}
                  Refresh workspace
                </Button>
              ) : null}
            </div>
          }
        />
      </div>

      <Dialog
        open={resumeWorkspaceOpen}
        onOpenChange={(open) => {
          if (
            !open &&
            typeof sessionStorage !== "undefined"
          ) {
            sessionStorage.setItem(SESSION_RESUME_DISMISS_KEY, "1");
          }
          setResumeWorkspaceOpen(open);
        }}
      >
        <DialogContent className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Continue previous SKU mapping?</DialogTitle>
            <DialogDescription>
              An unfinished workspace is ready with{" "}
              <span className="tabular-nums font-semibold text-foreground">
                {counts.unmapped.toLocaleString()}
              </span>{" "}
              SKU Missing rows. Continue where you left off, or clear this import and upload a fresh file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                removeUploadedListing(uploadedSkus);
                if (typeof sessionStorage !== "undefined") {
                  sessionStorage.setItem(SESSION_RESUME_DISMISS_KEY, "1");
                }
                setResumeWorkspaceOpen(false);
                notify.info("Starting fresh — upload a new inventory file anytime.");
              }}
            >
              Start new upload
            </Button>
            <Button
              type="button"
              className="font-semibold sm:order-first"
              onClick={() => {
                if (typeof sessionStorage !== "undefined") {
                  sessionStorage.setItem(SESSION_RESUME_DISMISS_KEY, "1");
                }
                setResumeWorkspaceOpen(false);
              }}
            >
              Continue workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signinNudgeOpen} onOpenChange={setSigninNudgeOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[460px]">
          <div className="border-b border-border/60 bg-[linear-gradient(135deg,rgb(63_108_255/0.12),rgb(16_185_129/0.08))] p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
                <ShieldCheck className="size-6" strokeWidth={1.8} aria-hidden />
              </span>
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  Save this SKU map for next time?
                </DialogTitle>
                <DialogDescription className="text-sm leading-6">
                  Sign in once and Tulmin can keep this SKU mapping in your private cloud workspace, so you do not repeat the same mapping on your next label run.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="grid gap-3">
              {[
                ["Future runs", "Reuse mapped SKU names when you upload labels again."],
                ["Browser continuity", "Continue from another browser after signing in."],
                ["Optional", "You can skip this and keep working locally."],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-xl border border-border/55 bg-muted/25 p-3">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={dismissSigninNudgeForever}
              >
                Don&apos;t show again
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={closeSigninNudge}
              >
                Maybe later
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl font-semibold"
                onClick={acceptSigninNudge}
              >
                Sign in to save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <WorkspaceModulePageStack>
      <WorkspaceSurfaceCard padding="p-5 sm:p-6">
        <SkuSpreadsheetUploadZone
          busy={parseBusy}
          onFile={(f) => void ingestFile(f)}
        />
      </WorkspaceSurfaceCard>

      {snapshotLoading && cloudConfigured && userId ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-6 py-4 text-[13px] text-muted-foreground shadow-layer-card ring-1 ring-border/15">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          Syncing workspace…
        </div>
      ) : null}

      {uploadedSkus.length > 0 ? (
        <WorkspaceSurfaceCard padding="px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-[12px] font-semibold uppercase text-primary">
                  Import ready
                </p>
                <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
                  {uploadedSkus.length.toLocaleString()} listing SKUs loaded
                </h2>
              </div>
              {uploadMeta?.columnUsed ? (
                <p className="text-[13px] text-muted-foreground">
                  Detected from column{" "}
                  <span className="font-mono font-medium text-foreground">
                    {uploadMeta.columnUsed}
                  </span>
                  {uploadMeta.scannedRows > 0 ? (
                    <span className="tabular-nums">
                      {" "}
                      · {uploadMeta.scannedRows.toLocaleString()} rows scanned
                    </span>
                  ) : null}
                </p>
              ) : uploadMeta?.scannedRows != null &&
                uploadMeta.scannedRows > 0 &&
                !uploadMeta.columnUsed ? (
                <p className="text-[13px] text-muted-foreground">
                  Manual list · {uploadMeta.scannedRows.toLocaleString()} SKU
                  {uploadMeta.scannedRows === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="grid min-w-[230px] grid-cols-2 overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
                <div className="border-r border-border/60 px-4 py-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Mapped
                  </p>
                  <p className="mt-1 text-[20px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {counts.mapped.toLocaleString()}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Open
                  </p>
                  <p className="mt-1 text-[20px] font-semibold tabular-nums text-amber-800 dark:text-amber-400">
                    {counts.unmapped.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  type="button"
                  disabled={globalBusy}
                  aria-label="Manage listing import"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-9 shrink-0 gap-1.5 px-3 text-[12px] font-semibold disabled:pointer-events-none disabled:opacity-50"
                  )}
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                  Manage
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditListingDraft(uploadedSkus.join("\n"));
                      setEditListingOpen(true);
                    }}
                  >
                    <PencilLine className="size-4" aria-hidden />
                    Edit listings…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setResetGroupingOpen(true)}
                    disabled={globalBusy || bulkBusy}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    Reset rows…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setRemoveUploadOpen(true)}
                    disabled={globalBusy || bulkBusy}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Clear import…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
          </div>
          {workspaceFileLabel.trim() ? (
            <details className="mt-4 rounded-xl border border-border/60 bg-muted/18 px-3 py-2 text-[12px] text-muted-foreground">
              <summary className="cursor-pointer list-none font-medium text-foreground">
                Source file
              </summary>
              <p className="mt-1 break-all">
                {workspaceFileLabel}
              </p>
            </details>
          ) : null}
        </WorkspaceSurfaceCard>
      ) : workspaceBootBusy && remoteAvailable && userId ? (
        <WorkspaceSurfaceCard padding="px-8 py-14 sm:py-16">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <Loader2
              className="size-10 animate-spin text-primary"
              aria-hidden
            />
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-foreground">
                Restoring SKU mapping workspace…
              </p>
              <p className="max-w-md text-[13px] text-muted-foreground">
                Loading your latest import list and mapping progress from this device and your workspace.
              </p>
            </div>
          </div>
        </WorkspaceSurfaceCard>
      ) : null}

      {uploadedSkus.length > 0 ? (
        <WorkspaceSurfaceCard padding="p-4 sm:p-5">
          <SkuMappingWorkspaceToolbar
            total={uploadedSkus.length}
            mapped={counts.mapped}
            remaining={counts.unmapped}
            completedPercent={completedPercent}
            searchValue={workspaceSearch}
            onSearchChange={setWorkspaceSearch}
            statusFilter={mappingStatusFilter}
            onStatusFilterChange={setMappingStatusFilter}
            autosaveState={autosaveUi.state}
            autosaveMessage={autosaveUi.detail}
            lastSyncedAtForMappings={mappingLastSyncedAt}
          />
          <div className="mt-5">
            <SkuMasterFirstPanel
              uploadedSkus={uploadedSkus}
              masterRows={masterRows}
              setMasterRows={setMasterRows}
              globalBusy={globalBusy}
              remoteAvailable={remoteAvailable}
              cloudConfigured={cloudConfigured}
              workspaceSearch={workspaceSearch}
              mappingStatusFilter={mappingStatusFilter}
              onFlushSaveNow={handleProtectedSaveMappings}
              flushSaveBusy={bulkBusy}
            />
          </div>
        </WorkspaceSurfaceCard>
      ) : null}

      {uploadedSkus.length > 0 && !cloudConfigured ? (
        <div className="rounded-lg border border-border border-l-[3px] border-l-muted-foreground/55 bg-muted/35 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          Cloud backend is not configured yet, so mappings stay{" "}
          <span className="font-semibold text-foreground">on this device</span>. Add
          keys in{" "}
          <Link
            href="/settings"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Settings
          </Link>{" "}
          to unlock secure sync and full workspace continuity.
        </div>
      ) : null}

      {uploadedSkus.length > 0 &&
      cloudConfigured &&
      !userId &&
      counts.mapped > 0 ? (
        <div className="rounded-lg border border-border border-l-[3px] border-l-primary bg-muted/35 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">You&apos;ve already mapped valuable SKU data.</span>{" "}
          Optional secure backup - {" "}
          <button
            type="button"
            onClick={openOptionalSignIn}
            className="interaction-press rounded px-0.5 font-semibold text-primary underline-offset-2 hover:bg-primary/10 hover:underline"
          >
            Sign in or create an account
          </button>{" "}
          to store this map securely in your cloud workspace so your team can continue from any
          browser.           Local work and exports stay fully available.
        </div>
      ) : null}
      </WorkspaceModulePageStack>

      <Dialog open={editListingOpen} onOpenChange={setEditListingOpen}>
        <DialogContent className="gap-5 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit listings</DialogTitle>
            <DialogDescription>
              One SKU per line. Blanks and duplicates are dropped—the grid updates from
              this list.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={editListingDraft}
            spellCheck={false}
            aria-label="Listing SKUs (one per line)"
            rows={14}
            onChange={(e) => setEditListingDraft(e.target.value)}
            className={cn(
              "min-h-[220px] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2.5 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditListingOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="font-semibold disabled:opacity-50"
              disabled={globalBusy}
              onClick={submitEditListing}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetGroupingOpen} onOpenChange={setResetGroupingOpen}>
        <DialogContent className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset SKU rows?</DialogTitle>
            <DialogDescription>
              Rebuild rows from the saved map for this listing set—including Supabase
              and any unsaved edits on{" "}
              <span className="font-semibold text-foreground">this device</span>. The
              sheet above will revert.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetGroupingOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="font-semibold"
              disabled={globalBusy || bulkBusy}
              onClick={confirmResetGrouping}
            >
              Reset rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeUploadOpen} onOpenChange={setRemoveUploadOpen}>
        <DialogContent className="gap-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear this import?</DialogTitle>
            <DialogDescription>
              Remove this listing set from{" "}
              <span className="font-semibold text-foreground">this session</span>
              , including the grid. Nothing already saved in Supabase is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="font-semibold"
              disabled={globalBusy || bulkBusy}
              onClick={confirmRemoveUpload}
            >
              Clear import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
