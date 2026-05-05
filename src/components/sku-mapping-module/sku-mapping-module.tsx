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
  Trash2,
} from "lucide-react";

import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";
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
  mergeGroupsForRemoteBatch,
  newEmptyMasterRow,
} from "@/lib/sku-mapping-module/master-first-helpers";
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
import { readSkuMapSnapshotCache } from "@/lib/supabase/sku-map-snapshot-cache";
import {
  batchApplyMasterMappingsRemote,
  fetchSkuMapSnapshot,
  getSkuMapAuthContext,
  unassignListingsRemote,
} from "@/lib/supabase/sku-map-remote";
import type { SkuMasterFirstRow } from "@/types/sku-mapping-module";
import { cn } from "@/lib/utils";
import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";

const SKU_MAPPING_UPLOAD_SESSION_KEY = "lable:sku-mapping:upload-v1";

function readSessionUpload(): {
  listingSkus: string[];
  scannedRows: number;
  columnUsed: string | null;
} | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SKU_MAPPING_UPLOAD_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as {
      listingSkus?: unknown;
      scannedRows?: unknown;
      columnUsed?: unknown;
    };
    if (!Array.isArray(o.listingSkus)) return null;
    const listingSkus = o.listingSkus.filter((x) => typeof x === "string") as string[];
    if (listingSkus.length === 0) return null;
    return {
      listingSkus,
      scannedRows:
        typeof o.scannedRows === "number" && Number.isFinite(o.scannedRows)
          ? o.scannedRows
          : 0,
      columnUsed: typeof o.columnUsed === "string" ? o.columnUsed : null,
    };
  } catch {
    return null;
  }
}

function writeSessionUpload(
  listingSkus: string[],
  meta: { scannedRows: number; columnUsed: string | null }
) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      SKU_MAPPING_UPLOAD_SESSION_KEY,
      JSON.stringify({
        listingSkus,
        scannedRows: meta.scannedRows,
        columnUsed: meta.columnUsed,
      })
    );
  } catch {
    /* quota / private mode */
  }
}

/** Mappings live in Supabase or local draft — the sheet is only parsed in-memory; drop session copy after save. */
function clearSessionUpload() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SKU_MAPPING_UPLOAD_SESSION_KEY);
  } catch {
    /* ignore */
  }
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

  const [editListingOpen, setEditListingOpen] = React.useState(false);
  const [editListingDraft, setEditListingDraft] = React.useState("");
  const [resetGroupingOpen, setResetGroupingOpen] = React.useState(false);
  const [removeUploadOpen, setRemoveUploadOpen] = React.useState(false);

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

  /** Restore last uploaded listing SKUs after refresh (session only); mappings come from Supabase. */
  React.useEffect(() => {
    if (!authReady) return;
    if (uploadedSkus.length > 0) return;
    const stored = readSessionUpload();
    if (!stored) return;
    setUploadedSkus(stored.listingSkus);
    setUploadMeta({
      scannedRows: stored.scannedRows,
      columnUsed: stored.columnUsed,
    });
    setFileEpoch((n) => n + 1);
  }, [authReady, uploadedSkus]);

  async function onManualRefresh() {
    if (!cloudConfigured || !userId) return;
    setSnapshotRefreshing(true);
    try {
      await pullRemoteSkuSnapshot();
      notify.success("Mappings updated");
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
      setUploadedSkus(res.listingSkus);
      setUploadMeta({
        scannedRows: res.scannedRows,
        columnUsed: res.columnUsed,
      });
      writeSessionUpload(res.listingSkus, {
        scannedRows: res.scannedRows,
        columnUsed: res.columnUsed,
      });
      setFileEpoch((n) => n + 1);
      notify.success(
        `${res.listingSkus.length.toLocaleString()} listing SKUs imported`
      );
      await pullRemoteSkuSnapshot();
    } finally {
      setParseBusy(false);
    }
  }

  function discardUploadAfterSuccessfulSave() {
    clearSessionUpload();
    setUploadedSkus([]);
    setUploadMeta(null);
    setFileEpoch((n) => n + 1);
  }

  /** Drop session upload, clear grid, prune device-only drafts for dropped SKUs. */
  function removeUploadedListing(skusToRemove: readonly string[]) {
    const drop = new Set(skusToRemove);
    clearSessionUpload();
    setLocalDraft((prev) => {
      const next = { ...prev };
      for (const sku of drop) delete next[sku];
      writeSkuMappingLocalDraft(next);
      return next;
    });
    setUploadedSkus([]);
    setUploadMeta(null);
    setMasterRows([]);
    setFileEpoch((n) => n + 1);
  }

  function confirmRemoveUpload() {
    removeUploadedListing(uploadedSkus);
    setRemoveUploadOpen(false);
    notify.success("Upload cleared", {
      description:
        "This session’s listing list is cleared. Saved workspace mappings are unchanged.",
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
    setUploadedSkus(uniq);
    writeSessionUpload(uniq, {
      scannedRows: uniq.length,
      columnUsed: null,
    });
    setUploadMeta({ scannedRows: uniq.length, columnUsed: null });
    setFileEpoch((n) => n + 1);
    setEditListingOpen(false);
    notify.success(
      `${uniq.length.toLocaleString()} listing SKU${uniq.length === 1 ? "" : "s"} updated`,
      {
        description: "Local drafts for removed SKUs were cleared.",
      }
    );
  }

  async function saveAllMasterMappings() {
    if (!uploadedSkus.length) return;

    if (!cloudConfigured) {
      notify.error("Connect Supabase in Settings to save.", {
        description: "Add your project keys to `.env.local`, then reload.",
      });
      return;
    }

    const flat = flattenMasterFirstRows(masterRows);

    setBulkBusy(true);
    try {
      const auth = await getSkuMapAuthContext();
      if (!auth.ok) {
        notify.error(auth.message);
        return;
      }

      const groups = mergeGroupsForRemoteBatch(masterRows).filter(
        (g) => g.listingSkus.length > 0
      );

      if (groups.length > 0) {
        const res = await batchApplyMasterMappingsRemote(groups);
        if (!res.ok) {
          notify.error(res.message);
          return;
        }
      }

      const toUnassign = uploadedSkus.filter((sku) => {
        if (flat[sku]) return false;
        const prev = mergedRows.find((r) => r.listing_sku === sku);
        return Boolean(prev?.master_name?.trim());
      });

      if (toUnassign.length > 0) {
        const u = await unassignListingsRemote(toUnassign);
        if (!u.ok) {
          notify.error(u.message);
          return;
        }
      }

      setLocalDraft((prev) => {
        const next = { ...prev };
        for (const sku of uploadedSkus) delete next[sku];
        writeSkuMappingLocalDraft(next);
        return next;
      });

      await pullRemoteSkuSnapshot();
      discardUploadAfterSuccessfulSave();
      notify.success("Mappings saved", {
        description:
          "This listing import is cleared from the browser—your map lives in Supabase.",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  const saveMappingsRef = React.useRef(saveAllMasterMappings);
  saveMappingsRef.current = saveAllMasterMappings;

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
        () => void saveMappingsRef.current(),
        "save-sku-mapping"
      );
      return;
    }
    void saveAllMasterMappings();
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
      notify.success("Local drafts synced to your workspace");
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

  const mastersForDatalist = React.useMemo(() => {
    const fromCloud = [...(snapshot?.masters ?? [])];
    const seen = new Set(fromCloud.map((m) => m.name.trim().toLowerCase()));
    const extra: MasterSkuRecord[] = [];
    for (const v of Object.values(localDraft)) {
      const n = v.trim();
      const k = n.toLowerCase();
      if (n && !seen.has(k)) {
        seen.add(k);
        extra.push({
          id: `local:${n}`,
          name: n,
          created_at: new Date(0).toISOString(),
        });
      }
    }
    for (const r of masterRows) {
      const n = r.masterName.trim();
      const k = n.toLowerCase();
      if (n && !seen.has(k)) {
        seen.add(k);
        extra.push({
          id: `row:${r.id}`,
          name: n,
          created_at: new Date(0).toISOString(),
        });
      }
    }
    return [...fromCloud, ...extra].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [snapshot?.masters, localDraft, masterRows]);

  const pendingLocalOnlyCount = countLocalDraftMappings(localDraft);

  const headerBadges = !cloudConfigured ? (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-[12px] text-muted-foreground">
      Sync paused —{" "}
      <Link
        href="/settings"
        className="ml-1 font-semibold text-primary underline-offset-2 hover:underline"
      >
        Settings
      </Link>
    </span>
  ) : !userId ? (
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
      Workspace connected
    </span>
  );

  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Label PDF", href: "/export-labels" },
          { label: "SKU Mapping" },
        ]}
        title="SKU Mapping"
        description="Set SKUs, attach listings, save once—Label PDF picks it up automatically."
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
                Push local drafts ({pendingLocalOnlyCount})
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
                Pull latest
              </Button>
            ) : null}
          </div>
        }
      />

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
        <WorkspaceSurfaceCard padding="px-6 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="text-[15px] font-semibold tracking-tight text-foreground">
                {uploadedSkus.length.toLocaleString()} listing SKUs imported
              </p>
              {uploadMeta?.columnUsed ? (
                <p className="text-[13px] text-muted-foreground">
                  Column{" "}
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-semibold tabular-nums text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/45 dark:text-emerald-50">
                <span
                  className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"
                  aria-hidden
                />
                {counts.mapped.toLocaleString()} mapped
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] font-semibold tabular-nums text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-50">
                <span
                  className="size-1.5 rounded-full bg-amber-400 dark:bg-amber-500"
                  aria-hidden
                />
                {counts.unmapped.toLocaleString()} open
              </span>
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
        </WorkspaceSurfaceCard>
      ) : (
        <WorkspaceSurfaceCard padding="px-8 py-14 sm:py-16">
          <div className="rounded-[14px] border border-dashed border-border bg-muted/25 px-6 py-10 text-center dark:bg-muted/10">
          <p className="text-[15px] font-medium text-foreground">
            Import a listing SKU sheet to continue
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Meesho-style layout:{" "}
            <span className="font-semibold text-foreground">column F</span>, values from{" "}
            <span className="font-semibold text-foreground">row 3</span> (rows 1–2 skipped).
            CSV or Excel—then the mapping grid opens.
          </p>
          </div>
        </WorkspaceSurfaceCard>
      )}

      {uploadedSkus.length > 0 ? (
        <WorkspaceSurfaceCard padding="p-5 sm:p-6">
          <SkuMasterFirstPanel
            uploadedSkus={uploadedSkus}
            masterRows={masterRows}
            setMasterRows={setMasterRows}
            masterNameSuggestions={mastersForDatalist}
            globalBusy={globalBusy}
            remoteAvailable={remoteAvailable}
            cloudConfigured={cloudConfigured}
            onSaveAll={handleProtectedSaveMappings}
            saveBusy={bulkBusy}
          />
        </WorkspaceSurfaceCard>
      ) : null}

      {uploadedSkus.length > 0 && !cloudConfigured ? (
        <div className="rounded-lg border border-border border-l-[3px] border-l-muted-foreground/55 bg-muted/35 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          Backend not configured—maps stay{" "}
          <span className="font-semibold text-foreground">on this device</span>. Add
          keys in{" "}
          <Link
            href="/settings"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Settings
          </Link>{" "}
          to enable sync and full Label PDF features.
        </div>
      ) : null}

      {uploadedSkus.length > 0 &&
      cloudConfigured &&
      !userId &&
      counts.mapped > 0 ? (
        <div className="rounded-lg border border-border border-l-[3px] border-l-primary bg-muted/35 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">You&apos;ve mapped SKUs.</span>{" "}
          Optional workspace backup — {" "}
          <button
            type="button"
            onClick={openOptionalSignIn}
            className="interaction-press rounded px-0.5 font-semibold text-primary underline-offset-2 hover:bg-primary/10 hover:underline"
          >
            Sign in or create an account
          </button>{" "}
          to save this map securely in our cloud workspace for the long haul—accessible from any
          browser whenever you&apos;re ready. Downloads and local work remain unrestricted.
        </div>
      ) : null}

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
