"use client";

import * as React from "react";

import { toast as notify } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  FileUp,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyMeeshoLabelFilters,
  sortMeeshoLabels,
  type MappedSkuMasterFilter,
  type MeeshoLabelFilters,
  type SortKey,
} from "@/lib/meesho-label-export/filter-labels";
import type { EnrichedMeeshoLabelRow } from "@/lib/meesho-label-export/master-lookup";
import {
  buildListingToMaster,
  enrichLabelRows,
  mergeListingToMasterMaps,
} from "@/lib/meesho-label-export/master-lookup";
import { partitionByMasterMapping } from "@/lib/meesho-label-export/partition-label-rows";
import { parseMeeshoLabelPdf } from "@/lib/meesho-label-export/parse-meesho-label-pdf";
import {
  exportPdfPages,
  exportPdfPagesInOrder,
  triggerPdfDownload,
  triggerZipDownload,
} from "@/lib/meesho-label-export/export-selected-pages";
import { readSkuMappingLocalDraft } from "@/lib/sku-mapping-module/sku-mapping-local-draft";
import { useAuth } from "@/lib/supabase/auth-context";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { fetchSkuMapSnapshot } from "@/lib/supabase/sku-map-remote";
import { readSkuMapSnapshotCache } from "@/lib/supabase/sku-map-snapshot-cache";
import { trackEvent } from "@/lib/analytics/posthog-client";
import type { MeeshoLabelRecord } from "@/types/meesho-label-export";
import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";
import {
  WorkspaceModulePageStack,
  WorkspaceSurfaceCard,
} from "@/components/layout/workspace-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRuntimePerformanceProfile } from "@/hooks/use-runtime-performance-profile";
import { cn } from "@/lib/utils";
import type { VirtualListTuning } from "@/lib/runtime/performance-tier";

const ROW_H = 42;
/** Virtual row estimate — mapped rows add a “Mapped to” line; refined by `measureElement`. */
const CARD_ROW_H = 108;

/** Session key for “already exported” hints — scoped per imported PDF fingerprint. */
const MEESHO_SKU_EXPORT_MARK_STORAGE = "lable.meeshoSkuExported.v1";
const ROW_MASTER_EXPORT_KEY_UNMAPPED = "__unmapped__";

function rowMasterExportKey(r: EnrichedMeeshoLabelRow): string {
  const m = r.master_sku?.trim();
  return m ? m : ROW_MASTER_EXPORT_KEY_UNMAPPED;
}

function collectDistinctExportKeys(
  rows: readonly EnrichedMeeshoLabelRow[]
): string[] {
  const out = new Set<string>();
  for (const r of rows) out.add(rowMasterExportKey(r));
  return [...out];
}

function loadExportedMasterKeysFromSession(fp: string): Set<string> {
  if (!fp) return new Set();
  try {
    const raw = sessionStorage.getItem(`${MEESHO_SKU_EXPORT_MARK_STORAGE}:${fp}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

function saveExportedMasterKeysToSession(fp: string, keys: ReadonlySet<string>) {
  if (!fp) return;
  try {
    sessionStorage.setItem(
      `${MEESHO_SKU_EXPORT_MARK_STORAGE}:${fp}`,
      JSON.stringify([...keys])
    );
  } catch {
    /* private mode / quota */
  }
}

/** One row per distinct SKU label in the selection: mapped SKU if set, else listing SKU. */
function aggregateSelectedSkuQtys(
  selectedRows: readonly EnrichedMeeshoLabelRow[]
): { name: string; qtySum: number }[] {
  const map = new Map<string, { name: string; qtySum: number }>();
  for (const r of selectedRows) {
    const name =
      (r.master_sku?.trim() || r.listing_sku?.trim() || "Unmapped").trim() ||
      "Unmapped";
    const mergeKey = name.toLowerCase();
    const q = r.quantity;
    const add = q != null && Number.isFinite(q) ? q : 1;
    const cur = map.get(mergeKey);
    if (cur) cur.qtySum += add;
    else map.set(mergeKey, { name, qtySum: add });
  }
  return [...map.values()].sort((a, b) =>
    b.qtySum !== a.qtySum
      ? b.qtySum - a.qtySum
      : a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function sanitizeExportFilenameSegment(s: string, maxLen: number): string {
  const t = s
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, maxLen);
  return t.length > 0 ? t : "SKU";
}

const SELECTED_EXPORT_FILENAME_MAX = 180;
const BULK_EXPORT_ZIP_FILENAME = "tulmin-sku-labels.zip";
const SELECTED_MULTI_SKU_ZIP_FILENAME = "tulmin-selected-skus.zip";

/**
 * Selected export filename: `{SKU1_SKU2_…}-{qty1_qty2_…}.pdf` — SKU names sorted by
 * total quantity descending; suffix quantities follow that same order.
 */
function buildSelectedExportFilename(
  selectedRows: readonly EnrichedMeeshoLabelRow[]
): string {
  const rows = aggregateSelectedSkuQtys(selectedRows);
  if (rows.length === 0) {
    return "labels-selected.pdf";
  }
  const nameParts = rows.map((r) => sanitizeExportFilenameSegment(r.name, 40));
  const qtyParts = rows.map((r) => String(Math.max(0, Math.round(r.qtySum))));
  const skuPrefix = nameParts.join("_");
  const qtySuffix = qtyParts.join("_");
  let name = `${skuPrefix}-${qtySuffix}.pdf`;
  if (name.length > SELECTED_EXPORT_FILENAME_MAX) {
    const n = rows.length;
    const shortSku = sanitizeExportFilenameSegment(`${n}-SKUs`, 24);
    name = `${shortSku}-${qtySuffix}.pdf`;
    if (name.length > SELECTED_EXPORT_FILENAME_MAX) {
      name = `export-${qtySuffix}.pdf`;
    }
  }
  return name;
}

function makeSkuBucketFileLabel(masterSku: string | null | undefined): string {
  const raw = masterSku?.trim();
  if (!raw) return "SKU-MISSING";
  return sanitizeExportFilenameSegment(raw, 80);
}

function dedupeFilename(baseName: string, usedLower: Set<string>): string {
  const clean = baseName.trim() || "SKU";
  let next = clean;
  let i = 2;
  while (usedLower.has(next.toLowerCase())) {
    next = `${clean}-${i}`;
    i += 1;
  }
  usedLower.add(next.toLowerCase());
  return next;
}

type BulkSkuZipState =
  | { phase: "preparing"; done: number; total: number }
  | { phase: "zipping"; done: number; total: number }
  | { phase: "starting" };

/** Compact hint that this mapped SKU bucket was already included in a successful export. */
function ExportedSkuHint({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border border-emerald-600/25 bg-emerald-500/12 px-1 py-px font-sans text-[9px] font-bold leading-none tracking-tight text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/12 dark:text-emerald-100",
        className
      )}
      title="Exported this file · re-export OK"
      aria-label="Exported earlier for this PDF"
    >
      ✓
    </span>
  );
}

function describeExportFailure(e: unknown): string {
  if (e instanceof Error && e.message.trim()) {
    const m = e.message.trim();
    return m.length > 220 ? `${m.slice(0, 217)}…` : m;
  }
  return "Retry or try a smaller PDF.";
}

const SKELETON_PULSE =
  "animate-pulse rounded-md bg-muted/45 dark:bg-muted/30";

/** Shown until viewport mode hydrates — matches filter + grid density without layout shift shock. */
function LabelsWorkspaceHydrationSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Preparing workspace"
    >
      <div className="flex flex-wrap gap-2">
        {[32, 40, 28, 36].map((w, i) => (
          <div
            key={i}
            className={cn(SKELETON_PULSE, "h-9")}
            style={{ width: `${w * 4}px` }}
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border/45 bg-muted/10 ring-1 ring-black/[0.03] dark:bg-muted/[0.06] dark:ring-white/[0.04]">
        <div
          className={cn(
            "grid gap-3 border-b border-border/40 px-3 py-2.5 sm:grid-cols-[auto_1fr_1fr_80px]",
            "bg-muted/[0.12] dark:bg-muted/[0.08]"
          )}
        >
          <div className={cn(SKELETON_PULSE, "size-4")} />
          <div className={cn(SKELETON_PULSE, "hidden h-3 sm:block")} />
          <div className={cn(SKELETON_PULSE, "hidden h-3 sm:block")} />
          <div className={cn(SKELETON_PULSE, "h-3 max-w-[3.5rem]")} />
        </div>
        <div className="divide-y divide-border/35 p-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className={cn(SKELETON_PULSE, "size-4 shrink-0")} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className={cn(SKELETON_PULSE, "h-3 w-[min(100%,14rem)]")} />
                <div className={cn(SKELETON_PULSE, "h-2.5 w-[min(100%,10rem)]")} />
              </div>
              <div className={cn(SKELETON_PULSE, "h-3 w-10 shrink-0 tabular-nums")} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Qty / courier selects use plain `"__all__"` (same sentinel as masters in filter module). */
const QTY_PARTNER_FILTER_ALL = "__all__";

/** Base UI positioning: keeps menu under its trigger — avoids drifting over neighbors. */
const FILTER_SELECT_POPUP_SIDE = {
  alignItemWithTrigger: false as const,
  align: "start" as const,
  side: "bottom" as const,
  sideOffset: 8 as const,
};

/** Cleaner SaaS menu shell (muted border + depth). */
const FILTER_SELECT_MENU_SURFACE_CLASS =
  "rounded-xl border-border/65 bg-popover px-1.5 py-1.5 text-[13px] shadow-lg shadow-slate-200/65 ring-1 ring-border/30 dark:bg-popover dark:shadow-black/40 dark:ring-white/[0.06]";

/** Raised filter strip — fully curved chrome to match pill fields. */
const PREMIUM_FILTER_TOOLBAR_CLASS =
  "rounded-2xl border border-border/70 bg-card p-4 shadow-layer-card ring-1 ring-black/[0.04] sm:rounded-3xl sm:p-5 dark:border-border dark:bg-card dark:shadow-elevate-xs dark:ring-white/[0.045]";

const PREMIUM_FILTER_INNER_CLASS =
  "rounded-xl bg-muted/35 p-3 ring-1 ring-border/55 sm:rounded-2xl sm:p-4 dark:bg-muted/25 dark:ring-border/40";

const PREMIUM_FIELD_LABEL_CLASS =
  "mb-1.5 block text-[12px] font-semibold leading-none tracking-tight text-foreground/55 dark:text-muted-foreground";

/** Sentence case — easier to scan than all-caps; matches premium SaaS filter panels. */
const MOBILE_FILTER_LABEL_CLASS =
  "mb-1.5 block text-[13px] font-semibold leading-snug tracking-tight text-foreground/80 dark:text-foreground/75";

/** Dense controls inside mobile filter sheet (less visual noise than full pills). */
const MOBILE_FIELD_CONTROL_CLASS =
  "w-full min-w-0 rounded-lg border border-border/85 bg-background px-3 py-2 text-[13px] font-medium text-foreground shadow-sm outline-none transition-[border-color,box-shadow] duration-150 ease-smooth placeholder:text-muted-foreground/55 hover:border-border focus-visible:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-primary/[0.12] dark:bg-card dark:border-border dark:shadow-inner";

/** Pill fields — matches search + selects; focus ring follows the same radius. */
const PREMIUM_FIELD_CONTROL_CLASS =
  "w-full min-w-0 rounded-full border border-border/80 bg-background/95 px-4 text-[13px] font-semibold tracking-tight text-foreground outline-none shadow-[inset_0_1px_1px_rgb(15_23_42/0.04)] ring-0 transition-[border-color,box-shadow,background-color,color] duration-200 ease-smooth placeholder:font-normal placeholder:text-muted-foreground/55 hover:border-border hover:bg-background focus-visible:border-primary/55 focus-visible:ring-[3px] focus-visible:ring-primary/[0.13] dark:border-border/85 dark:bg-background/85 dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)] dark:hover:border-muted-foreground/35 dark:focus-visible:border-primary";

/** Matches DropdownMenu checkbox rows — visible unchecked frame for every theme */
const MASTER_FILTER_RADIO_BOX_FRAME_CLASS =
  "pointer-events-none flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background shadow-[inset_0_1px_1px_rgb(15_23_42/0.04)] dark:border-input dark:bg-input/30 dark:shadow-none";

/** Label/page counts per mapped SKU in this PDF (not order quantity). */
type MappedSkuLabelStats = {
  perName: Record<string, number>;
  unmapped: number;
  /** Every row (labels/pages) in this file. */
  total: number;
};

function mappedMasterFilterTriggerText(
  f: MappedSkuMasterFilter,
  stats: MappedSkuLabelStats,
): string {
  if (f.mode === "all") return `All (${stats.total.toLocaleString()})`;
  if (f.mode === "unmapped")
    return `SKU Missing (${stats.unmapped.toLocaleString()})`;
  const names = f.names;
  if (names.length === 0) return `All (${stats.total.toLocaleString()})`;
  if (names.length === 1) {
    const name = names[0];
    const n = stats.perName[name] ?? 0;
    return n > 0 ? `${name} (${n.toLocaleString()})` : name;
  }
  let sum = 0;
  for (const name of names) sum += stats.perName[name] ?? 0;
  return `${names.length} SKUs (${sum.toLocaleString()})`;
}

/** Label/page counts derived from enriched rows — same basis as SKU filter. */
type QtyCarrierFilterStats = {
  totalLabels: number;
  /** Sum of numeric `quantity` across all labels (order qty on the PDF). */
  totalOrderQty: number;
  perQty: Record<number, number>;
  perPartner: Record<string, number>;
  /** Sum of `quantity` per carrier (labels without qty omitted from the sum). */
  partnerOrderQtySum: Record<string, number>;
  quantitiesSortedDesc: number[];
  partnersSortedDesc: string[];
};

function qtyFilterTriggerDisplay(
  value: string | number | unknown,
  stats: QtyCarrierFilterStats,
): string {
  if (typeof value !== "string" || value === QTY_PARTNER_FILTER_ALL) {
    return `All (${stats.totalLabels.toLocaleString()})`;
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return String(value);
  const c = stats.perQty[n] ?? 0;
  return `${n.toLocaleString()} (${c.toLocaleString()})`;
}

function carrierFilterTriggerDisplay(
  value: string | unknown,
  stats: QtyCarrierFilterStats,
): string {
  if (typeof value !== "string" || value === QTY_PARTNER_FILTER_ALL) {
    return `All (${stats.totalLabels.toLocaleString()})`;
  }
  const c = stats.perPartner[value] ?? 0;
  return c > 0 ? `${value} (${c.toLocaleString()})` : value;
}

function FilterMenuCountRow({
  primary,
  count,
  orderQtySum,
  title: titleOverride,
}: {
  primary: React.ReactNode;
  count: number;
  /** When set, show `labels · Σqty` in the value column (dense menus). */
  orderQtySum?: number;
  /** Tooltip for the count column (e.g. carrier rows: labels + total qty without cluttering the label). */
  title?: string;
}) {
  const countTitle =
    titleOverride ??
    (orderQtySum != null
      ? `${count.toLocaleString()} label(s) · Σ ${orderQtySum.toLocaleString()} qty`
      : `${count.toLocaleString()} in this file`);
  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-4">
      <span className="min-w-0 flex-1 truncate text-[13px] leading-snug">{primary}</span>
      <span
        className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground sm:text-[12px]"
        title={countTitle}
      >
        {orderQtySum != null ? (
          <>
            {count.toLocaleString()}
            <span className="mx-0.5 font-normal text-muted-foreground/55" aria-hidden>
              ·
            </span>
            <span title="Sum of qty on these labels">Σ{orderQtySum.toLocaleString()}</span>
          </>
        ) : (
          count.toLocaleString()
        )}
      </span>
    </span>
  );
}

function MobileFilterChip({
  active,
  children,
  onClick,
  className,
  title,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "touch-manipulation shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold tracking-tight transition-[transform,box-shadow,background-color,color] duration-150 ease-smooth active:scale-[0.98]",
        active
          ? "bg-primary text-primary-foreground shadow-[0_0_24px_-4px_rgb(96_165_250/0.45)] ring-1 ring-white/15"
          : "bg-muted/55 text-muted-foreground shadow-sm ring-1 ring-white/[0.04] hover:bg-muted/80 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function LabelPdfFilterFields({
  layout,
  listingSkuSearch,
  onListingSkuSearch,
  mappedMasterFilter,
  onMasterFilterAll,
  onMasterFilterUnmapped,
  onMasterFilterToggleMaster,
  qtyFilter,
  onQtyFilter,
  partner,
  onPartner,
  distinctMasterNames,
  qtyCarrierStats,
  rowsLen,
  activeFilterCount,
  onClearFilters,
  mappedSkuLabelStats,
}: {
  layout: "desktop" | "sheet";
  listingSkuSearch: string;
  onListingSkuSearch: (v: string) => void;
  mappedMasterFilter: MappedSkuMasterFilter;
  onMasterFilterAll: () => void;
  onMasterFilterUnmapped: () => void;
  onMasterFilterToggleMaster: (name: string, checked: boolean) => void;
  qtyFilter: string;
  onQtyFilter: (v: string) => void;
  partner: string;
  onPartner: (v: string) => void;
  distinctMasterNames: string[];
  qtyCarrierStats: QtyCarrierFilterStats;
  rowsLen: number;
  activeFilterCount: number;
  onClearFilters: () => void;
  mappedSkuLabelStats: MappedSkuLabelStats;
}) {
  const isSheet = layout === "sheet";
  const lbl = isSheet ? MOBILE_FILTER_LABEL_CLASS : PREMIUM_FIELD_LABEL_CLASS;
  const ctl = isSheet ? MOBILE_FIELD_CONTROL_CLASS : PREMIUM_FIELD_CONTROL_CLASS;
  const selectTriggerExtras = cn(
    "h-10 shrink-0 border py-0 pr-8 hover:bg-background [&_svg]:size-[15px] [&_svg]:text-muted-foreground/70 [&_[data-slot=select-value]]:truncate",
    isSheet ? "rounded-xl" : "rounded-full"
  );

  const masterBlock = (
    <div className="min-w-0">
      <Label htmlFor="label-filter-master-trigger" className={lbl}>
        Matched SKU
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          id="label-filter-master-trigger"
          title="SKU map · counts = labels here"
          className={cn(ctl, selectTriggerExtras, "flex w-full min-w-0 cursor-default items-center gap-2")}
        >
          <span className="min-w-0 flex-1 truncate text-left font-semibold tracking-tight">
            {mappedMasterFilterTriggerText(mappedMasterFilter, mappedSkuLabelStats)}
          </span>
          <ChevronDown className="pointer-events-none size-[15px] shrink-0 text-muted-foreground/70" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={FILTER_SELECT_POPUP_SIDE.align}
          side={FILTER_SELECT_POPUP_SIDE.side}
          sideOffset={FILTER_SELECT_POPUP_SIDE.sideOffset}
          className={cn(
            FILTER_SELECT_MENU_SURFACE_CLASS,
            "max-h-[min(340px,min(52vh,28rem))] w-[min(100vw-1.25rem,20rem)] min-w-[min(100vw-1.25rem,20rem)] sm:min-w-[19rem]"
          )}
        >
          <DropdownMenuItem
            onClick={onMasterFilterAll}
            className="mx-0.5 rounded-lg px-2 py-2.5 font-medium"
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className={MASTER_FILTER_RADIO_BOX_FRAME_CLASS} aria-hidden>
                {mappedMasterFilter.mode === "all" ? (
                  <Check className="size-[14px] shrink-0 text-primary" strokeWidth={2.75} />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <FilterMenuCountRow
                  primary={<span className="font-semibold text-foreground">All labels</span>}
                  count={mappedSkuLabelStats.total}
                />
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onMasterFilterUnmapped}
            className="mx-0.5 rounded-lg px-2 py-2.5 font-medium text-amber-950 dark:text-amber-200"
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className={MASTER_FILTER_RADIO_BOX_FRAME_CLASS} aria-hidden>
                {mappedMasterFilter.mode === "unmapped" ? (
                  <Check className="size-[14px] shrink-0 text-primary" strokeWidth={2.75} />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <FilterMenuCountRow
                  primary={<span className="font-semibold">SKU Missing only</span>}
                  count={mappedSkuLabelStats.unmapped}
                />
              </span>
            </span>
          </DropdownMenuItem>
          {distinctMasterNames.map((name) => {
            const picked =
              mappedMasterFilter.mode === "masters" &&
              mappedMasterFilter.names.includes(name);
            return (
              <DropdownMenuCheckboxItem
                key={name}
                checked={picked}
                onCheckedChange={(c) => onMasterFilterToggleMaster(name, Boolean(c))}
                className="mx-0.5 rounded-lg py-2.5 pl-2 font-mono text-[13px] font-medium"
              >
                <FilterMenuCountRow
                  primary={<span className="truncate font-medium">{name}</span>}
                  count={mappedSkuLabelStats.perName[name] ?? 0}
                />
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const qtyBlock = (
    <div className="min-w-0">
      <Label htmlFor="label-filter-qty" className={lbl}>
        Quantity
      </Label>
      <Select
        value={qtyFilter}
        onValueChange={(v) => {
          if (v != null && v !== "") onQtyFilter(v);
        }}
      >
        <SelectTrigger
          size="sm"
          id="label-filter-qty"
          title="Qty on label · right = count"
          className={cn(ctl, selectTriggerExtras)}
        >
          <SelectValue placeholder={qtyFilterTriggerDisplay(QTY_PARTNER_FILTER_ALL, qtyCarrierStats)}>
            {(v) => qtyFilterTriggerDisplay(v, qtyCarrierStats)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          {...FILTER_SELECT_POPUP_SIDE}
          className={cn(
            FILTER_SELECT_MENU_SURFACE_CLASS,
            "max-h-[min(340px,min(52vh,28rem))]"
          )}
        >
          <SelectItem
            value={QTY_PARTNER_FILTER_ALL}
            className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium"
          >
            <FilterMenuCountRow
              primary={<span className="font-semibold text-foreground">All quantities</span>}
              count={qtyCarrierStats.totalLabels}
            />
          </SelectItem>
          {qtyCarrierStats.quantitiesSortedDesc.map((q) => (
            <SelectItem key={q} value={String(q)} className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium tabular-nums">
              <FilterMenuCountRow
                primary={
                  <span className="font-semibold tracking-tight">{q.toLocaleString()}</span>
                }
                count={qtyCarrierStats.perQty[q] ?? 0}
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rowsLen > 0 && qtyCarrierStats.quantitiesSortedDesc.length === 0 ? (
        <p
          className={cn(
            "font-medium leading-snug text-muted-foreground",
            isSheet ? "mt-1 text-[10px]" : "mt-2 text-[11px]"
          )}
        >
          No qty in this PDF.
        </p>
      ) : null}
    </div>
  );

  const courierBlock = (
    <div>
      <Label htmlFor="label-filter-courier" className={lbl}>
        Carrier
      </Label>
      <Select
        value={partner}
        onValueChange={(v) => {
          if (v != null && v !== "") onPartner(v);
        }}
      >
        <SelectTrigger
          size="sm"
          id="label-filter-courier"
          title="Carrier · shown number = labels. Hover a chip or menu row for total qty."
          className={cn(ctl, selectTriggerExtras)}
        >
          <SelectValue placeholder={carrierFilterTriggerDisplay(QTY_PARTNER_FILTER_ALL, qtyCarrierStats)}>
            {(v) => carrierFilterTriggerDisplay(v, qtyCarrierStats)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          {...FILTER_SELECT_POPUP_SIDE}
          className={cn(
            FILTER_SELECT_MENU_SURFACE_CLASS,
            "max-h-[min(340px,min(52vh,28rem))]"
          )}
        >
          <SelectItem
            value={QTY_PARTNER_FILTER_ALL}
            className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium"
          >
            <FilterMenuCountRow
              primary={<span className="font-semibold text-foreground">All carriers</span>}
              count={qtyCarrierStats.totalLabels}
              title={`${qtyCarrierStats.totalLabels.toLocaleString()} labels · ${qtyCarrierStats.totalOrderQty.toLocaleString()} total qty`}
            />
          </SelectItem>
          {qtyCarrierStats.partnersSortedDesc.map((p) => (
            <SelectItem key={p} value={p} className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium">
              <FilterMenuCountRow
                primary={<span className="font-medium">{p}</span>}
                count={qtyCarrierStats.perPartner[p] ?? 0}
                title={`${(qtyCarrierStats.perPartner[p] ?? 0).toLocaleString()} labels · ${(qtyCarrierStats.partnerOrderQtySum[p] ?? 0).toLocaleString()} total qty`}
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const clearBtn = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={
        isSheet
          ? "h-10 w-full text-[13px] font-semibold"
          : "h-9 shrink-0 px-4 text-[12px] font-semibold"
      }
      disabled={activeFilterCount === 0}
      onClick={onClearFilters}
    >
      Clear
    </Button>
  );

  if (isSheet) {
    const qtyChipMax = 12;
    const partnerChipMax = 10;
    const qtyChipValues = qtyCarrierStats.quantitiesSortedDesc.slice(0, qtyChipMax);
    const partnerChipValues = qtyCarrierStats.partnersSortedDesc.slice(0, partnerChipMax);
    const qtyFilterNum =
      qtyFilter === QTY_PARTNER_FILTER_ALL
        ? null
        : Number.parseInt(qtyFilter, 10);
    const qtyNotOnChip =
      qtyFilter !== QTY_PARTNER_FILTER_ALL &&
      (qtyFilterNum == null ||
        !Number.isFinite(qtyFilterNum) ||
        !qtyChipValues.includes(qtyFilterNum));
    const partnerNotOnChip =
      partner !== QTY_PARTNER_FILTER_ALL && !partnerChipValues.includes(partner);
    const showQtySelect =
      qtyCarrierStats.quantitiesSortedDesc.length > qtyChipMax || qtyNotOnChip;
    const showPartnerSelect =
      qtyCarrierStats.partnersSortedDesc.length > partnerChipMax || partnerNotOnChip;

    const chipScroller =
      "flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

    return (
      <div className="space-y-5">
        <p className="text-[12px] leading-snug text-muted-foreground">
          View only · source unchanged until download.
        </p>

        <div>
          <span className={lbl}>Match status</span>
          <div className={cn("mt-2", chipScroller)}>
            <MobileFilterChip active={mappedMasterFilter.mode === "all"} onClick={onMasterFilterAll}>
              All
            </MobileFilterChip>
            <MobileFilterChip
              active={mappedMasterFilter.mode === "unmapped"}
              onClick={onMasterFilterUnmapped}
            >
              SKU Missing
            </MobileFilterChip>
          </div>
          <div className="mt-3">{masterBlock}</div>
        </div>

        <div>
          <span className={lbl}>Quantity</span>
          <div className={cn("mt-2", chipScroller)}>
            <MobileFilterChip
              active={qtyFilter === QTY_PARTNER_FILTER_ALL}
              onClick={() => onQtyFilter(QTY_PARTNER_FILTER_ALL)}
            >
              All
            </MobileFilterChip>
            {qtyChipValues.map((q) => (
              <MobileFilterChip
                key={q}
                active={qtyFilter === String(q)}
                onClick={() => onQtyFilter(String(q))}
              >
                {q.toLocaleString()}
              </MobileFilterChip>
            ))}
          </div>
          {showQtySelect ? <div className="mt-2">{qtyBlock}</div> : null}
        </div>

        <div>
          <span className={lbl}>Carrier</span>
          <div className={cn("mt-2", chipScroller)}>
            <MobileFilterChip
              active={partner === QTY_PARTNER_FILTER_ALL}
              onClick={() => onPartner(QTY_PARTNER_FILTER_ALL)}
              title={`${qtyCarrierStats.totalLabels.toLocaleString()} labels · ${qtyCarrierStats.totalOrderQty.toLocaleString()} total qty`}
            >
              <span className="tabular-nums">
                All ({qtyCarrierStats.totalLabels.toLocaleString()})
              </span>
            </MobileFilterChip>
            {partnerChipValues.map((p) => (
              <MobileFilterChip
                key={p}
                active={partner === p}
                onClick={() => onPartner(p)}
                title={`${(qtyCarrierStats.perPartner[p] ?? 0).toLocaleString()} labels · ${(qtyCarrierStats.partnerOrderQtySum[p] ?? 0).toLocaleString()} total qty`}
              >
                <span className="max-w-[11rem] truncate text-left tabular-nums">
                  {p} ({(qtyCarrierStats.perPartner[p] ?? 0).toLocaleString()})
                </span>
              </MobileFilterChip>
            ))}
          </div>
          {showPartnerSelect ? <div className="mt-2">{courierBlock}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p className="max-w-md text-[12px] leading-snug text-muted-foreground lg:text-[13px]">
          SKU · courier · qty. Filters this screen only.
        </p>
        {activeFilterCount > 0 ? (
          <div className="shrink-0 sm:pt-px">{clearBtn}</div>
        ) : null}
      </div>
      <div className="grid gap-x-5 gap-y-[1.125rem] sm:grid-cols-2 lg:grid-cols-4 lg:items-end lg:gap-x-7">
        <div className="sm:col-span-2 lg:col-span-1">
          <Label htmlFor="label-filter-listing-sku-desk" className={lbl}>
            Listing SKU
          </Label>
          <Input
            id="label-filter-listing-sku-desk"
            value={listingSkuSearch}
            onChange={(e) => onListingSkuSearch(e.target.value)}
            placeholder="Search…"
            title="SKU, master, courier, qty"
            aria-describedby="label-filter-listing-hint-desk"
            className={cn(ctl, "h-10 py-2")}
          />
          <p id="label-filter-listing-hint-desk" className="sr-only">
            Listing SKU substring match.
          </p>
        </div>
        {masterBlock}
        {qtyBlock}
        {courierBlock}
      </div>
    </div>
  );
}

type LabelGridDensity = "tablet" | "desktop";

function labelGridTemplate(density: LabelGridDensity) {
  return density === "desktop"
    ? "grid grid-cols-[44px_76px_minmax(110px,1fr)_minmax(140px,1.35fr)_52px_minmax(100px,1fr)] gap-0"
    : "grid grid-cols-[44px_64px_minmax(112px,1fr)_minmax(130px,1.35fr)_48px] gap-0";
}

/**
 * Viewport-derived layout mode. SSR + first paint use `null` so server markup matches the client
 * (no `window` in useState initializer — that produced desktop HTML on the server and mobile on
 * the phone, breaking hydration and routing users into the wrong surface).
 */
function useLabelExportViewMode(): "mobile" | "tablet" | "desktop" | null {
  const [mode, setMode] =
    React.useState<"mobile" | "tablet" | "desktop" | null>(null);

  React.useLayoutEffect(() => {
    const resize = () => {
      const w = window.innerWidth;
      setMode(w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop");
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });
    return () => window.removeEventListener("resize", resize);
  }, []);

  return mode;
}

function sortIcon(active: boolean, dir: "asc" | "desc") {
  if (!active) return null;
  return dir === "asc" ? (
    <ArrowUp className="ml-0.5 inline size-3 opacity-70" aria-hidden />
  ) : (
    <ArrowDown className="ml-0.5 inline size-3 opacity-70" aria-hidden />
  );
}

function LabelsVirtualGrid({
  density,
  rows,
  selected,
  globalBusy,
  sortKey,
  sortDir,
  onToggleSelect,
  onSelectAllInView,
  headerClick,
  togglePageSort,
  virtualTune,
  exportedMasterKeys,
}: {
  density: LabelGridDensity;
  rows: EnrichedMeeshoLabelRow[];
  selected: Record<string, true>;
  globalBusy: boolean;
  sortKey: SortKey | "page";
  sortDir: "asc" | "desc";
  onToggleSelect: (id: string, on: boolean) => void;
  /** true = select every row in `rows`; false = clear selection for rows in `rows` only */
  onSelectAllInView: (select: boolean) => void;
  headerClick: (k: SortKey) => void;
  togglePageSort: () => void;
  virtualTune: VirtualListTuning;
  exportedMasterKeys: ReadonlySet<string>;
}) {
  const grid = labelGridTemplate(density);
  const showCourier = density === "desktop";
  const scrollRef = React.useRef<HTMLDivElement>(null);
  /** Classic scrollbars inset the tbody; pad header by this amount so grids line up */
  const [scrollbarPad, setScrollbarPad] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth - el.clientWidth;
      setScrollbarPad((prev) => (prev === w ? prev : Math.max(0, w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: virtualTune.overscan,
    useAnimationFrameWithResizeObserver: virtualTune.useAnimationFrameWithResizeObserver,
  });

  const allInViewSelected =
    rows.length > 0 && rows.every((r) => Boolean(selected[r.id]));

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card/90 shadow-elevate-xs ring-1 ring-black/[0.03] backdrop-blur-[1px] dark:border-label-grid-border dark:bg-card/85 dark:ring-white/[0.04] dark:shadow-inner">
      <div
        className={`${grid} min-h-10 shrink-0 items-center border-b border-label-grid-border bg-label-grid-header py-1.5`}
        role="row"
        style={{
          paddingRight: scrollbarPad > 0 ? scrollbarPad : undefined,
        }}
      >
        <div
          className="flex min-h-11 min-w-0 shrink-0 items-center justify-center px-1 py-0.5 sm:min-h-0"
          role="columnheader"
          aria-label="Select all loaded labels"
        >
          <Checkbox
            checked={allInViewSelected}
            disabled={globalBusy || rows.length === 0}
            onCheckedChange={(c) => onSelectAllInView(Boolean(c))}
            aria-label="Select all loaded labels"
          />
        </div>
        <div
          className="flex min-w-0 items-center justify-center border-l border-label-grid-border/70 px-3 py-0.5"
          role="columnheader"
        >
          <button
            type="button"
            className="interaction-press flex min-h-11 min-w-0 touch-manipulation items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground outline-offset-2 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-0"
            onClick={togglePageSort}
          >
            Page
            {sortKey === "page" ? sortIcon(true, sortDir) : null}
          </button>
        </div>
        <div
          className="flex min-w-0 items-center border-l border-label-grid-border/70 px-2 text-left"
          role="columnheader"
        >
          <button
            type="button"
            title="Master from map · ✓ = exported this file"
            className="interaction-press flex min-h-11 w-full min-w-0 touch-manipulation items-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-0"
            onClick={() => headerClick("master_sku")}
          >
            <span className="truncate">Matched SKU</span>
            {sortIcon(sortKey === "master_sku", sortDir)}
          </button>
        </div>
        <div
          className="flex min-w-0 items-center border-l border-label-grid-border/70 px-2 text-left"
          role="columnheader"
        >
          <button
            type="button"
            className="interaction-press flex min-h-11 w-full min-w-0 touch-manipulation items-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-0"
            onClick={() => headerClick("listing_sku")}
          >
            <span className="truncate">Listing SKU</span>
            {sortIcon(sortKey === "listing_sku", sortDir)}
          </button>
        </div>
        <div
          className="flex min-w-0 items-center justify-start border-l border-label-grid-border/70 px-2"
          role="columnheader"
        >
          <button
            type="button"
            className="interaction-press flex min-h-11 touch-manipulation items-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-0"
            onClick={() => headerClick("quantity")}
          >
            Qty
            {sortIcon(sortKey === "quantity", sortDir)}
          </button>
        </div>
        {showCourier ? (
          <div
            className="flex min-w-0 items-center border-l border-label-grid-border/70 px-2 text-left"
            role="columnheader"
          >
            <button
              type="button"
              className="interaction-press flex min-h-11 w-full min-w-0 touch-manipulation items-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-0"
              onClick={() => headerClick("delivery_partner")}
            >
              <span className="truncate">Courier</span>
              {sortIcon(sortKey === "delivery_partner", sortDir)}
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="max-h-[min(65vh,560px)] min-h-0 overflow-auto overscroll-contain"
        role="rowgroup"
      >
        {rows.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">
            Nothing matches.
          </p>
        ) : (
          <div
            className={cn(
              "relative w-full",
              density === "desktop" ? "min-w-[640px]" : "min-w-[528px]"
            )}
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const r = rows[vi.index];
              if (!r) return null;
              const sel = Boolean(selected[r.id]);
              const stripe =
                vi.index % 2 === 0 ? "bg-card/95" : "bg-muted/[0.28]";
              return (
                <div
                  key={r.id}
                  className={cn(
                    "absolute left-0 top-0 w-full border-b border-border/55 transition-[background-color,box-shadow] duration-150 ease-smooth dark:border-border/40",
                    stripe,
                    sel
                      ? "bg-primary/[0.11] shadow-[inset_3px_0_0_0_var(--primary)]"
                      : "hover:bg-muted/50 dark:hover:bg-muted/35"
                  )}
                  style={{
                    height: `${vi.size}px`,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <div className={`${grid} h-full items-center`}>
                    <div className="flex min-w-0 shrink-0 items-center justify-center px-1">
                      <Checkbox
                        checked={Boolean(selected[r.id])}
                        disabled={globalBusy}
                        onCheckedChange={(c) =>
                          onToggleSelect(r.id, Boolean(c))
                        }
                        aria-label={`Select label page ${r.page}`}
                      />
                    </div>
                    <div className="flex min-w-0 items-center justify-center overflow-hidden border-l border-border/80 px-3 font-mono text-xs tabular-nums text-muted-foreground">
                      {r.page}
                    </div>
                    <div className="flex min-w-0 items-center gap-1 border-l border-border/80 px-2 text-xs font-medium text-card-foreground">
                      <span className="min-w-0 truncate">
                        {r.master_sku?.trim() ? (
                          r.master_sku.trim()
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                      {exportedMasterKeys.has(rowMasterExportKey(r)) ? (
                        <ExportedSkuHint />
                      ) : null}
                    </div>
                    <div className="min-w-0 truncate border-l border-border/80 px-2 font-mono text-xs">
                      {r.listing_sku || "—"}
                    </div>
                    <div className="border-l border-border/80 px-2 text-xs tabular-nums text-muted-foreground">
                      {r.quantity ?? "—"}
                    </div>
                    {showCourier ? (
                      <div className="min-w-0 truncate border-l border-border/80 px-2 text-xs text-muted-foreground">
                        {r.delivery_partner}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {rows.length > 0 ? (
        <p className="border-t border-label-grid-border bg-label-sheet px-3 py-1.5 text-[11px] tabular-nums text-muted-foreground">
          {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} · scroll for more
          {!showCourier ? " · swipe sideways for columns" : null}
        </p>
      ) : null}
    </div>
  );
}

function LabelMappingStatusPill({ mapped }: { mapped: boolean }) {
  if (mapped) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-emerald-500/[0.13] px-2 py-0.5 text-[11px] font-semibold leading-none tracking-tight text-emerald-200 ring-1 ring-emerald-400/25 shadow-[0_0_14px_-4px_rgb(52_211_153/0.55)] dark:text-emerald-100"
        title="Linked to master SKU"
      >
        Mapped SKU
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-500/[0.12] px-2 py-0.5 text-[11px] font-semibold leading-none tracking-tight text-amber-100 ring-1 ring-amber-400/30 shadow-[0_0_12px_-4px_rgb(251_191_36/0.35)]"
      title="No master · add in SKU Mapping"
    >
      SKU Missing
    </span>
  );
}

function MobileStatPill({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-baseline gap-2 rounded-full px-3 py-2 ring-1 transition-[box-shadow,background-color] duration-200",
        active
          ? "bg-primary/[0.14] ring-primary/30 shadow-[0_0_28px_-10px_rgb(96_165_250/0.65)]"
          : "bg-muted/40 ring-white/[0.05] dark:bg-muted/25"
      )}
    >
      <span className="text-[14px] font-semibold tabular-nums leading-none text-foreground">
        {value}
      </span>
      <span className="text-[11px] font-medium leading-none text-muted-foreground">{label}</span>
    </div>
  );
}

function LabelsMobileCards({
  rows,
  selected,
  globalBusy,
  onToggleSelect,
  onSelectAllInView,
  virtualTune,
  exportedMasterKeys,
}: {
  rows: EnrichedMeeshoLabelRow[];
  selected: Record<string, true>;
  globalBusy: boolean;
  onToggleSelect: (id: string, on: boolean) => void;
  onSelectAllInView: (select: boolean) => void;
  virtualTune: VirtualListTuning;
  exportedMasterKeys: ReadonlySet<string>;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const r = rows[index];
      if (!r) return CARD_ROW_H;
      return r.master_sku?.trim() ? 128 : 104;
    },
    overscan: virtualTune.overscan,
    useAnimationFrameWithResizeObserver: virtualTune.useAnimationFrameWithResizeObserver,
  });

  const allInViewSelected =
    rows.length > 0 && rows.every((r) => Boolean(selected[r.id]));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-10 items-center gap-2 px-1">
        <Checkbox
          checked={allInViewSelected}
          disabled={globalBusy || rows.length === 0}
          onCheckedChange={(c) => onSelectAllInView(Boolean(c))}
          aria-label="Select all loaded labels"
          className="size-[22px] rounded-md"
        />
        <span className="text-[12px] font-medium text-muted-foreground">
          Select all
        </span>
        <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
          {rows.length.toLocaleString()} labels loaded
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[min(58dvh,620px)] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
        role="list"
      >
        {rows.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted-foreground">
            No labels match your search or filters.
          </p>
        ) : (
          <div
            className="relative px-0 py-1"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const r = rows[vi.index];
              if (!r) return null;
              const mapped = Boolean(r.master_sku?.trim());
              const masterSku = r.master_sku?.trim() ?? "";
              const sel = Boolean(selected[r.id]);

              return (
                <div
                  key={r.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 right-0 top-0 px-0"
                  style={{
                    transform: `translateY(${vi.start}px)`,
                  }}
                  role="listitem"
                >
                  <div
                    className={cn(
                      "mb-2 flex gap-3 rounded-2xl px-3 py-2.5 transition-[box-shadow,background-color,border-color] duration-200 ease-smooth",
                      "border border-border/50 bg-muted/12 shadow-elevate-xs ring-1 ring-black/[0.03]",
                      "dark:border-border/45 dark:bg-card/45 dark:ring-white/[0.04]",
                      mapped && "border-emerald-500/15 dark:border-emerald-400/20",
                      sel &&
                        "border-primary/35 bg-primary/[0.08] shadow-[inset_3px_0_0_0_var(--primary)] ring-primary/20"
                    )}
                  >
                    <div className="flex shrink-0 items-start pt-0.5">
                      <Checkbox
                        checked={Boolean(selected[r.id])}
                        disabled={globalBusy}
                        onCheckedChange={(c) => onToggleSelect(r.id, Boolean(c))}
                        aria-label={`Select label page ${r.page}`}
                        className="size-[22px] rounded-md"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-all font-mono text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                          {r.listing_sku || "—"}
                        </p>
                        <span className="shrink-0 rounded-full bg-background/65 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-white/[0.08]">
                          p.{r.page}
                        </span>
                      </div>

                      {mapped ? (
                        <>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <LabelMappingStatusPill mapped />
                          </div>
                          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/90">
                            Matched to
                          </p>
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                            <p className="min-w-0 flex-1 break-all font-mono text-[13px] font-medium leading-snug text-emerald-100/95">
                              {masterSku}
                            </p>
                            {exportedMasterKeys.has(rowMasterExportKey(r)) ? (
                              <ExportedSkuHint className="shrink-0" />
                            ) : null}
                          </div>
                          <p className="mt-2 text-[12px] font-medium leading-snug text-muted-foreground">
                            <span className="tabular-nums">Qty {r.quantity ?? "—"}</span>
                            <span className="mx-1.5 text-muted-foreground/40" aria-hidden>
                              ·
                            </span>
                            <span className="min-w-0">{r.delivery_partner}</span>
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                            <LabelMappingStatusPill mapped={false} />
                            {exportedMasterKeys.has(rowMasterExportKey(r)) ? (
                              <ExportedSkuHint className="shrink-0" />
                            ) : null}
                          </div>
                          <p className="mt-1.5 text-[12px] font-medium leading-snug text-muted-foreground">
                            <span className="tabular-nums">Qty {r.quantity ?? "—"}</span>
                            <span className="mx-1.5 text-muted-foreground/40" aria-hidden>
                              ·
                            </span>
                            <span className="min-w-0">{r.delivery_partner}</span>
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function MeeshoLabelExportTool() {
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  const userId = user?.id;

  const [rows, setRows] = React.useState<MeeshoLabelRecord[]>([]);
  const [pdfBytes, setPdfBytes] = React.useState<Uint8Array | null>(null);
  const [sourceName, setSourceName] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [parseProgress, setParseProgress] = React.useState<[number, number] | null>(
    null
  );

  const [mapSnapshot, setMapSnapshot] = React.useState<{
    masters: MasterSkuRecord[];
    skuMap: SkuMapRecord[];
  } | null>(null);

  const [mappedMasterFilter, setMappedMasterFilter] =
    React.useState<MappedSkuMasterFilter>({ mode: "all" });
  const [listingSkuSearch, setListingSkuSearch] = React.useState("");
  /** `"__all__"` or stringified integer from parsed PDF */
  const [qtyFilter, setQtyFilter] = React.useState("__all__");
  const [partner, setPartner] = React.useState("__all__");
  const [mobileFilterOpen, setMobileFilterOpen] = React.useState(false);

  const [sortKey, setSortKey] = React.useState<SortKey | "page">("page");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const [selected, setSelected] = React.useState<Record<string, true>>({});
  const [bulkSkuZipState, setBulkSkuZipState] = React.useState<BulkSkuZipState | null>(
    null
  );

  const exportMarkFingerprint = React.useMemo(() => {
    if (rows.length === 0) return "";
    const tail = rows[rows.length - 1];
    return `${sourceName || "labels"}|${rows.length}|${tail?.id ?? ""}`;
  }, [rows, sourceName]);

  const [mastersExportMarked, setMastersExportMarked] = React.useState<Set<string>>(
    () => new Set()
  );

  React.useEffect(() => {
    if (!exportMarkFingerprint) {
      setMastersExportMarked(new Set());
      return;
    }
    setMastersExportMarked(loadExportedMasterKeysFromSession(exportMarkFingerprint));
  }, [exportMarkFingerprint]);

  const exportMarkFingerprintRef = React.useRef(exportMarkFingerprint);
  React.useEffect(() => {
    exportMarkFingerprintRef.current = exportMarkFingerprint;
  }, [exportMarkFingerprint]);

  const mergeExportedMastersFromRows = React.useCallback(
    (exportedRows: readonly EnrichedMeeshoLabelRow[]) => {
      const keys = collectDistinctExportKeys(exportedRows);
      if (keys.length === 0) return;
      const fp = exportMarkFingerprintRef.current;
      setMastersExportMarked((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        if (fp) saveExportedMasterKeysToSession(fp, next);
        return next;
      });
    },
    []
  );

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const viewMode = useLabelExportViewMode();
  const perf = useRuntimePerformanceProfile();

  /** Weak / mid devices defer heavy filtering while typing listings (keeps input snappy). */
  const deferredListingSkuSearch = React.useDeferredValue(listingSkuSearch);
  const listingSearchForFilter = perf.deferListingSearchFilter
    ? deferredListingSkuSearch
    : listingSkuSearch;

  const pullRemoteMapSnapshot = React.useCallback(async () => {
    if (!userId || !getSupabaseBrowser()) return;
    const snap = await fetchSkuMapSnapshot();
    if (snap.ok && snap.masters && snap.skuMap) {
      setMapSnapshot({ masters: snap.masters, skuMap: snap.skuMap });
    }
  }, [userId]);

  React.useEffect(() => {
    if (!authReady) return;
    if (!userId || !getSupabaseBrowser()) {
      setMapSnapshot(null);
      return;
    }
    const c = readSkuMapSnapshotCache(userId);
    const hasCache = Boolean(c?.masters && c.skuMap);
    if (hasCache && c?.masters && c.skuMap) {
      setMapSnapshot({ masters: c.masters, skuMap: c.skuMap });
    }

    let cancelled = false;
    const kick = () => {
      if (cancelled) return;
      void pullRemoteMapSnapshot();
    };

    if (typeof window.requestIdleCallback !== "undefined") {
      const id = window.requestIdleCallback(kick, {
        timeout: hasCache ? 16_000 : 6_000,
      });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const t = window.setTimeout(kick, hasCache ? 1800 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [authReady, userId, pullRemoteMapSnapshot]);

  const refreshMapSnapshot = pullRemoteMapSnapshot;

  const remoteListingToMaster = React.useMemo(() => {
    const remote = mapSnapshot
      ? buildListingToMaster(mapSnapshot.masters, mapSnapshot.skuMap)
      : new Map<string, string>();
    if (!userId) {
      return mergeListingToMasterMaps(remote, readSkuMappingLocalDraft());
    }
    return remote;
  }, [mapSnapshot, userId]);

  const enrichedRows = React.useMemo(
    () => enrichLabelRows(rows, remoteListingToMaster),
    [rows, remoteListingToMaster]
  );

  const mappedSkuLabelStats = React.useMemo<MappedSkuLabelStats>(() => {
    const perName: Record<string, number> = {};
    let unmapped = 0;
    for (const r of enrichedRows) {
      const nm = r.master_sku?.trim();
      if (!nm) {
        unmapped++;
        continue;
      }
      perName[nm] = (perName[nm] ?? 0) + 1;
    }
    return { perName, unmapped, total: enrichedRows.length };
  }, [enrichedRows]);

  const mappedRows = React.useMemo(
    () => partitionByMasterMapping(enrichedRows).mapped,
    [enrichedRows]
  );

  /**
   * Mapped SKUs present in this PDF, ordered by how many labels match (most first),
   * then A–Z — helps pick high-volume SKUs first in the dropdown.
   */
  const distinctMasterNames = React.useMemo(() => {
    const { perName } = mappedSkuLabelStats;
    return Object.keys(perName).sort((a, b) => {
      const ca = perName[a] ?? 0;
      const cb = perName[b] ?? 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }, [mappedSkuLabelStats]);

  /** Qty / carrier options with label counts; options sorted by prevalence (Zoho-style scans). */
  const qtyCarrierStats = React.useMemo<QtyCarrierFilterStats>(() => {
    const perQty: Record<number, number> = {};
    const perPartner: Record<string, number> = {};
    const partnerOrderQtySum: Record<string, number> = {};
    let totalOrderQty = 0;
    for (const r of enrichedRows) {
      const q = r.quantity;
      if (q != null && Number.isFinite(q)) {
        perQty[q] = (perQty[q] ?? 0) + 1;
        totalOrderQty += q;
      }
      const dp = r.delivery_partner?.trim();
      if (dp) {
        perPartner[dp] = (perPartner[dp] ?? 0) + 1;
        if (q != null && Number.isFinite(q)) {
          partnerOrderQtySum[dp] = (partnerOrderQtySum[dp] ?? 0) + q;
        }
      }
    }
    const quantitiesSortedDesc = Object.keys(perQty)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => {
        const ca = perQty[a] ?? 0;
        const cb = perQty[b] ?? 0;
        if (cb !== ca) return cb - ca;
        return a - b;
      });
    const partnersSortedDesc = Object.keys(perPartner).sort((a, b) => {
      const ca = perPartner[a] ?? 0;
      const cb = perPartner[b] ?? 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    return {
      totalLabels: enrichedRows.length,
      totalOrderQty,
      perQty,
      perPartner,
      partnerOrderQtySum,
      quantitiesSortedDesc,
      partnersSortedDesc,
    };
  }, [enrichedRows]);

  React.useEffect(() => {
    if (qtyFilter === "__all__") return;
    const n = Number.parseInt(qtyFilter, 10);
    if (!Number.isFinite(n) || qtyCarrierStats.perQty[n] === undefined) {
      setQtyFilter("__all__");
    }
  }, [qtyCarrierStats.perQty, qtyFilter]);

  React.useEffect(() => {
    if (partner === QTY_PARTNER_FILTER_ALL) return;
    if (qtyCarrierStats.perPartner[partner] === undefined) {
      setPartner(QTY_PARTNER_FILTER_ALL);
    }
  }, [partner, qtyCarrierStats.perPartner]);

  const filters: MeeshoLabelFilters = React.useMemo(() => {
    const qtyExact =
      qtyFilter === "__all__"
        ? null
        : (() => {
            const n = Number.parseInt(qtyFilter, 10);
            return Number.isFinite(n) ? n : null;
          })();

    return {
      mappedMaster: mappedMasterFilter,
      listingSearch: listingSearchForFilter,
      qtyExact,
      partner: partner === "__all__" ? "" : partner,
    };
  }, [mappedMasterFilter, listingSearchForFilter, qtyFilter, partner]);

  /** All PDF labels, enriched when mappings exist; filtered client-side (Zoho-style grid). */
  const filteredLabels = React.useMemo(() => {
    const base = applyMeeshoLabelFilters(enrichedRows, filters);
    if (sortKey === "page") {
      return [...base].sort((a, b) =>
        sortDir === "asc" ? a.page - b.page : b.page - a.page
      );
    }
    return sortMeeshoLabels(base, sortKey, sortDir);
  }, [enrichedRows, filters, sortKey, sortDir]);

  const labelFilterActiveCount = React.useMemo(() => {
    let c = 0;
    if (listingSkuSearch.trim()) c++;
    if (mappedMasterFilter.mode !== "all") c++;
    if (qtyFilter !== QTY_PARTNER_FILTER_ALL) c++;
    if (partner !== QTY_PARTNER_FILTER_ALL) c++;
    return c;
  }, [listingSkuSearch, mappedMasterFilter, qtyFilter, partner]);

  const onMasterFilterAll = React.useCallback(() => {
    setMappedMasterFilter({ mode: "all" });
  }, []);

  const onMasterFilterUnmapped = React.useCallback(() => {
    setMappedMasterFilter({ mode: "unmapped" });
  }, []);

  const onMasterFilterToggleMaster = React.useCallback(
    (name: string, checked: boolean) => {
      setMappedMasterFilter((prev) => {
        if (checked) {
          if (prev.mode === "masters") {
            if (prev.names.includes(name)) return prev;
            return { mode: "masters", names: [...prev.names, name] };
          }
          return { mode: "masters", names: [name] };
        }
        if (prev.mode !== "masters") return prev;
        const next = prev.names.filter((n) => n !== name);
        if (next.length === 0) return { mode: "all" };
        return { mode: "masters", names: next };
      });
    },
    []
  );

  const clearLabelFilters = React.useCallback(() => {
    setMappedMasterFilter({ mode: "all" });
    setListingSkuSearch("");
    setQtyFilter(QTY_PARTNER_FILTER_ALL);
    setPartner(QTY_PARTNER_FILTER_ALL);
  }, []);

  React.useEffect(() => {
    setMappedMasterFilter((prev) => {
      if (prev.mode !== "masters") return prev;
      const valid = prev.names.filter((n) => distinctMasterNames.includes(n));
      if (valid.length === prev.names.length) return prev;
      return valid.length === 0 ? { mode: "all" } : { mode: "masters", names: valid };
    });
  }, [distinctMasterNames]);

  React.useEffect(() => {
    const allowed = new Set(filteredLabels.map((r) => r.id));
    setSelected((prev) => {
      let changed = false;
      const next: Record<string, true> = {};
      for (const id of Object.keys(prev)) {
        if (allowed.has(id)) next[id] = true;
        else changed = true;
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length)
        return prev;
      return next;
    });
  }, [filteredLabels]);

  const selectedTotal = Object.keys(selected).length;

  const selectedLabelRows = React.useMemo(
    () => filteredLabels.filter((r) => Boolean(selected[r.id])),
    [filteredLabels, selected]
  );

  const selectedDistinctSkuBuckets = React.useMemo(() => {
    const keys = new Set<string>();
    for (const r of selectedLabelRows) keys.add(rowMasterExportKey(r));
    return keys.size;
  }, [selectedLabelRows]);

  /** Multiple mapped buckets in the current checkbox selection → offer merged PDF vs per-SKU ZIP. */
  const selectionShowsMergeVsZipChoice =
    selectedTotal > 0 && selectedDistinctSkuBuckets >= 2;

  function headerClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function togglePageSort() {
    if (sortKey === "page") {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey("page");
      setSortDir("asc");
    }
  }

  async function ingestPdf(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      trackEvent("meesho_pdf_import_rejected", { reason: "unsupported_file_type" });
      notify.error("Unsupported file", {
        description: ".pdf only.",
      });
      return;
    }
    trackEvent("meesho_pdf_import_started", {
      size_bytes: file.size,
      signed_in: Boolean(userId),
    });
    setParsing(true);
    setParseProgress([0, 0]);
    setSelected({});
    setMappedMasterFilter({ mode: "all" });
    setListingSkuSearch("");
    setQtyFilter(QTY_PARTNER_FILTER_ALL);
    setPartner(QTY_PARTNER_FILTER_ALL);
    setRows([]);
    setPdfBytes(null);

    const res = await parseMeeshoLabelPdf({
      file,
      yieldPolicy: perf.parseYieldPolicy,
      onProgress: (done, total) => setParseProgress([done, total]),
    });

    setParsing(false);
    setParseProgress(null);

    if (res.error || res.rows.length === 0) {
      trackEvent("meesho_pdf_import_failed", {
        reason: res.error ? "parse_error" : "empty_pdf",
        size_bytes: file.size,
      });
      notify.error("Could not parse this PDF", {
        description: res.error ?? "No labels found.",
      });
      return;
    }

    setRows(res.rows);
    setPdfBytes(res.pdfBytes);
    setSourceName(file.name.replace(/\.pdf$/i, ""));
    notify.success("Imported", {
      description: `${res.rows.length.toLocaleString()} labels.`,
    });
    trackEvent("meesho_pdf_import_succeeded", {
      label_count: res.rows.length,
      size_bytes: file.size,
      signed_in: Boolean(userId),
    });

    if (userId && getSupabaseBrowser()) await refreshMapSnapshot();
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void ingestPdf(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void ingestPdf(f);
  }

  function toggleSelect(id: string, on: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (on) next[id] = true;
      else delete next[id];
      return next;
    });
  }

  function selectAllInView(select: boolean) {
    const ids = filteredLabels.map((r) => r.id);
    trackEvent(select ? "meesho_selection_all_visible" : "meesho_selection_clear_visible", {
      visible_count: ids.length,
      selected_count: selectedTotal,
    });
    setSelected((prev) => {
      const next = { ...prev };
      if (select) {
        for (const id of ids) next[id] = true;
      } else {
        for (const id of ids) delete next[id];
      }
      return next;
    });
  }

  function clearSelection() {
    trackEvent("meesho_selection_cleared", { selected_count: selectedTotal });
    setSelected({});
  }

  async function downloadFilteredPdf() {
    if (!pdfBytes || selectedTotal === 0) {
      trackEvent("meesho_export_selected_blocked", {
        reason: "no_selection",
        visible_count: filteredLabels.length,
      });
      notify.info("Select at least one row.");
      return;
    }
    const idSet = new Set(Object.keys(selected));
    const exportedEnriched = enrichedRows.filter((r) => idSet.has(r.id));
    const pagesToExport = rows
      .filter((r) => idSet.has(r.id))
      .map((r) => r.page)
      .sort((a, b) => a - b);

    if (pagesToExport.length === 0) {
      trackEvent("meesho_export_selected_failed", {
        reason: "selection_page_mismatch",
        selected_count: selectedTotal,
      });
      notify.error("Could not map selection to PDF pages.");
      return;
    }

    try {
      const out = await exportPdfPages(pdfBytes, pagesToExport);
      triggerPdfDownload(out, buildSelectedExportFilename(exportedEnriched));
      mergeExportedMastersFromRows(exportedEnriched);
      notify.success("Exported", {
        description: `${pagesToExport.length.toLocaleString()} page(s) · ✓ = already in an export`,
      });
      trackEvent("meesho_export_selected_succeeded", {
        page_count: pagesToExport.length,
        selected_count: selectedTotal,
        visible_count: filteredLabels.length,
      });
    } catch (e) {
      trackEvent("meesho_export_selected_failed", {
        reason: "export_error",
        selected_count: selectedTotal,
      });
      notify.error("Couldn’t export that PDF yet", {
        description: describeExportFailure(e),
      });
    }
  }

  async function downloadSkuFilesZipFromRows(
    sourceRows: readonly EnrichedMeeshoLabelRow[],
    zipFilename: string,
    scope: "filtered" | "selected"
  ) {
    if (!pdfBytes || sourceRows.length === 0) {
      if (scope === "filtered") {
        trackEvent("meesho_export_all_skus_blocked", { reason: "no_visible_labels" });
        notify.info("Nothing matches filters.");
      } else {
        trackEvent("meesho_export_selected_skus_zip_blocked", { reason: "no_selection" });
        notify.info("Select at least one row.");
      }
      return;
    }
    if (bulkSkuZipState) return;

    const buckets = new Map<string, { masterSku: string | null; rows: EnrichedMeeshoLabelRow[] }>();
    for (const r of sourceRows) {
      const key = rowMasterExportKey(r);
      const cur = buckets.get(key);
      if (cur) {
        cur.rows.push(r);
      } else {
        buckets.set(key, { masterSku: r.master_sku?.trim() || null, rows: [r] });
      }
    }

    const bucketList = [...buckets.values()].filter((b) => b.rows.length > 0);
    if (bucketList.length === 0) {
      if (scope === "filtered") {
        trackEvent("meesho_export_all_skus_blocked", { reason: "empty_buckets" });
      } else {
        trackEvent("meesho_export_selected_skus_zip_blocked", { reason: "empty_buckets" });
      }
      notify.info("No SKU files to export.");
      return;
    }

    setBulkSkuZipState({ phase: "preparing", done: 0, total: bucketList.length });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (let i = 0; i < bucketList.length; i += 1) {
        const bucket = bucketList[i];
        const pages = bucket.rows
          .map((r) => r.page)
          .filter((p) => Number.isInteger(p) && p >= 1)
          .sort((a, b) => a - b);
        const uniquePages = [...new Set(pages)];
        if (uniquePages.length === 0) continue;

        setBulkSkuZipState({ phase: "preparing", done: i + 1, total: bucketList.length });
        const pdfOut = await exportPdfPagesInOrder(pdfBytes, uniquePages);
        const base = makeSkuBucketFileLabel(bucket.masterSku);
        const fileBase = dedupeFilename(base, usedNames);
        zip.file(`${fileBase}.pdf`, pdfOut);

        // Yield between SKU files to keep UI responsive on large exports.
        await new Promise<void>((resolve) => {
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => resolve());
          } else {
            setTimeout(resolve, 0);
          }
        });
      }

      setBulkSkuZipState({ phase: "zipping", done: bucketList.length, total: bucketList.length });
      const zipBytes = await zip.generateAsync(
        { type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } },
        (meta) => {
          const pct = Math.max(0, Math.min(100, Math.round(meta.percent)));
          const done = Math.max(0, Math.round((pct / 100) * bucketList.length));
          setBulkSkuZipState({ phase: "zipping", done, total: bucketList.length });
        }
      );

      setBulkSkuZipState({ phase: "starting" });
      triggerZipDownload(zipBytes, zipFilename);
      mergeExportedMastersFromRows(sourceRows);
      if (scope === "filtered") {
        notify.success("SKU ZIP ready", {
          description: `${bucketList.length.toLocaleString()} PDF(s) from the current filter · ${zipFilename}`,
        });
        trackEvent("meesho_export_all_skus_succeeded", {
          sku_file_count: bucketList.length,
          visible_count: filteredLabels.length,
        });
      } else {
        notify.success("SKU ZIP ready", {
          description: `${bucketList.length.toLocaleString()} PDF(s) from your selection · ${zipFilename}`,
        });
        trackEvent("meesho_export_selected_skus_zip_succeeded", {
          sku_file_count: bucketList.length,
          selected_count: sourceRows.length,
        });
      }
    } catch (e) {
      if (scope === "filtered") {
        trackEvent("meesho_export_all_skus_failed", {
          reason: "zip_error",
          visible_count: filteredLabels.length,
        });
      } else {
        trackEvent("meesho_export_selected_skus_zip_failed", {
          reason: "zip_error",
          selected_count: sourceRows.length,
        });
      }
      notify.error("Couldn’t create SKU ZIP yet", {
        description: describeExportFailure(e),
      });
    } finally {
      setBulkSkuZipState(null);
    }
  }

  async function downloadAllSkuFilesZip() {
    await downloadSkuFilesZipFromRows(filteredLabels, BULK_EXPORT_ZIP_FILENAME, "filtered");
  }

  async function downloadSelectedSkuFilesZip() {
    await downloadSkuFilesZipFromRows(
      selectedLabelRows,
      SELECTED_MULTI_SKU_ZIP_FILENAME,
      "selected"
    );
  }

  function requestDownloadAllSkuFiles() {
    void downloadAllSkuFilesZip();
  }

  const bulkExportLabel = React.useMemo(() => {
    if (!bulkSkuZipState) return "Download SKUs as ZIP (filtered)";
    if (bulkSkuZipState.phase === "preparing") {
      return `Preparing Files... (${bulkSkuZipState.done}/${bulkSkuZipState.total})`;
    }
    if (bulkSkuZipState.phase === "zipping") {
      return `Creating ZIP... (${bulkSkuZipState.done}/${bulkSkuZipState.total})`;
    }
    return "Download Started";
  }, [bulkSkuZipState]);

  /** Modal copy while ZIP export runs — keeps long jobs legible alongside sticky actions. */
  const bulkSkuZipModal = React.useMemo(() => {
    if (!bulkSkuZipState) {
      return { title: "", body: "", pct: 0 as number };
    }
    if (bulkSkuZipState.phase === "preparing") {
      const { done, total } = bulkSkuZipState;
      const pct = total > 0 ? Math.min(100, Math.round((100 * done) / total)) : 0;
      return {
        title: "SKU export",
        body: `${done.toLocaleString()} / ${total.toLocaleString()} PDFs`,
        pct,
      };
    }
    if (bulkSkuZipState.phase === "zipping") {
      const { done, total } = bulkSkuZipState;
      const pct = total > 0 ? Math.min(100, Math.round((100 * done) / total)) : 0;
      return {
        title: "ZIP",
        body: "Compressing…",
        pct,
      };
    }
    return {
      title: "Download",
      body: "Saving…",
      pct: 100,
    };
  }, [bulkSkuZipState]);

  const hasMappedSkuLabels =
    Object.keys(mappedSkuLabelStats.perName).length > 0;

  const ready = rows.length > 0 && pdfBytes && !parsing;
  const mapBusy = parsing || bulkSkuZipState != null;

  return (
    <WorkspaceModulePageStack>
      <WorkspaceSurfaceCard padding="p-5 sm:p-6">
        <div
          data-tour="import-pdf"
          className={cn(
            "relative rounded-[14px] border border-dashed border-border bg-muted/30 transition-[border-color,box-shadow] hover:border-primary/35 dark:bg-muted/15",
            parsing && "pointer-events-none opacity-80"
          )}
          onDragEnter={(e) => e.preventDefault()}
          onDragLeave={(e) => e.preventDefault()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            id="meesho-pdf-upload"
            disabled={parsing}
            onChange={onFileInput}
          />
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center sm:py-14">
            {parsing ? (
              <>
                <Loader2 className="size-10 animate-spin text-primary/80" />
                <p className="text-sm font-semibold text-foreground">
                  Parsing labels…
                </p>
                {parseProgress ? (
                  <>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Page {parseProgress[0]} / {parseProgress[1]}
                    </p>
                    <div className="mt-1 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/30">
                      <div
                        className="h-full rounded-full bg-primary/75 transition-[width] duration-300 ease-out"
                        style={{
                          width: `${Math.min(100, Math.max(0, (parseProgress[1] ? (100 * parseProgress[0]) / parseProgress[1] : 0)))}%`,
                        }}
                      />
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-inner">
                  <FileUp className="size-7 text-primary" strokeWidth={1.35} aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="text-[17px] font-semibold tracking-tight text-foreground">
                    Import PDF
                  </p>
                  <p className="mx-auto max-w-sm text-[13px] leading-snug text-muted-foreground">
                    Meesho label PDF · filter · export selection.
                  </p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="mt-2 min-h-11 min-w-[160px] font-semibold shadow-sm hover:brightness-[1.02] active:brightness-[0.98] sm:min-h-10"
                  disabled={parsing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </Button>
              </>
            )}
          </div>
        </div>
      </WorkspaceSurfaceCard>

      {ready ? (
        <WorkspaceSurfaceCard padding="p-5 sm:p-6 lg:p-8">
          {rows.length > 0 ? (
            <p className="-mt-0.5 mb-3 text-[12px] font-medium tabular-nums text-muted-foreground sm:mb-5 sm:text-[13px]">
              {rows.length.toLocaleString()} labels imported
            </p>
          ) : null}
          <section
            className={cn(
              "relative space-y-3 sm:space-y-4",
              viewMode === "mobile"
                ? cn(
                    "rounded-2xl border border-border/35 bg-muted/[0.06] p-4 shadow-elevate-xs ring-1 ring-black/[0.03] dark:border-border/40 dark:bg-muted/[0.05] dark:ring-white/[0.04]",
                    selectedTotal > 0 &&
                      "pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"
                  )
                : "rounded-xl border border-label-grid-border bg-label-sheet p-3 shadow-inner ring-1 ring-border/20 sm:p-5"
            )}
            aria-labelledby="labels-grid-heading"
          >
            <div
              className={cn(
                "flex flex-col gap-2.5 pb-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3",
                viewMode === "mobile"
                  ? "border-b border-border/40"
                  : "border-b border-label-grid-border"
              )}
            >
              <div className="min-w-0 flex-1">
                {viewMode === "mobile" ? (
                  <div className="flex items-end justify-between gap-3">
                    <h2
                      id="labels-grid-heading"
                      className="text-[15px] font-semibold tracking-tight text-foreground"
                    >
                      Meesho labels
                    </h2>
                    <span className="shrink-0 text-[12px] font-medium tabular-nums text-muted-foreground">
                      {filteredLabels.length.toLocaleString()}
                      <span className="font-normal"> labels loaded</span>
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h2
                        id="labels-grid-heading"
                        className="text-base font-semibold tracking-tight text-foreground sm:text-lg"
                      >
                        Meesho labels
                      </h2>
                      <span className="hidden text-muted-foreground/80 sm:inline" aria-hidden>
                        ·
                      </span>
                      <span className="text-[13px] font-medium tabular-nums text-muted-foreground sm:inline">
                        {filteredLabels.length.toLocaleString()}
                        <span className="font-normal text-muted-foreground"> labels loaded</span>
                      </span>
                    </div>
                    <p className="mt-1.5 hidden max-w-lg text-[12px] leading-snug text-muted-foreground md:block">
                      Filter · download selection only.
                    </p>
                  </>
                )}
                <div
                  className={cn(
                    "mt-2 flex flex-wrap gap-2 md:hidden",
                    viewMode === "mobile" && "hidden"
                  )}
                >
                  <span className="inline-flex items-center rounded-md bg-background/95 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground ring-1 ring-border/55">
                    {enrichedRows.length.toLocaleString()} total
                  </span>
                  <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-border/40">
                    {mappedRows.length.toLocaleString()} matched ·{" "}
                    {(enrichedRows.length - mappedRows.length).toLocaleString()} remaining
                  </span>
                </div>
              </div>
              <div className="hidden shrink-0 text-right text-[11px] tabular-nums leading-snug text-muted-foreground sm:block">
                <div>
                  <span className="font-semibold text-foreground">
                    {enrichedRows.length.toLocaleString()}
                  </span>{" "}
                  labels in file
                </div>
                <div>
                  {mappedRows.length.toLocaleString()} labels ready ·{" "}
                  {(enrichedRows.length - mappedRows.length).toLocaleString()} need review
                </div>
              </div>
            </div>

            {authReady &&
            !userId &&
            getSupabaseBrowser() &&
            hasMappedSkuLabels ? (
              <div
                className={cn(
                  "rounded-lg border border-border border-l-[3px] border-l-primary bg-muted/30 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground",
                  viewMode === "mobile" &&
                    "rounded-2xl border-white/[0.06] border-l-primary bg-muted/25 shadow-inner ring-1 ring-white/[0.04]"
                )}
              >
                <span className="font-medium text-foreground">Cloud sync</span> — sign in to save your
                SKU map (free).&nbsp;
                <button
                  type="button"
                  onClick={openOptionalSignIn}
                  className="interaction-press font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Sign in
                </button>
              </div>
            ) : null}

            {viewMode === "mobile" ? (
              <>
                <div className="flex flex-col gap-3">
                  <div className="-mx-1 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <MobileStatPill
                      label="Total"
                      value={enrichedRows.length.toLocaleString()}
                    />
                    <MobileStatPill
                      label="Matched"
                      value={mappedRows.length.toLocaleString()}
                    />
                    <MobileStatPill
                      label="Remaining"
                      value={(enrichedRows.length - mappedRows.length).toLocaleString()}
                    />
                    <MobileStatPill
                      label="Selected"
                      value={selectedTotal.toLocaleString()}
                      active={selectedTotal > 0}
                    />
                  </div>
                  <div className="flex items-stretch gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search
                        className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground/75"
                        aria-hidden
                      />
                      <Input
                        id="label-workspace-mobile-search"
                        value={listingSkuSearch}
                        onChange={(e) => setListingSkuSearch(e.target.value)}
                        placeholder="Search…"
                        title="SKU, master, courier, qty"
                        aria-label="Search labels"
                        className="h-11 rounded-2xl border-0 bg-muted/40 py-2 pl-10 pr-3 text-[14px] font-medium shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] ring-1 ring-white/[0.06] placeholder:text-muted-foreground/55 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/35 dark:shadow-[inset_0_1px_3px_rgb(0_0_0/0.45)]"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setMobileFilterOpen(true)}
                      title="Filters"
                      className="relative h-11 shrink-0 touch-manipulation rounded-2xl px-3.5 text-[13px] font-semibold shadow-sm ring-1 ring-white/[0.06]"
                    >
                      <SlidersHorizontal className="mr-2 size-[18px]" aria-hidden />
                      Filters
                      {labelFilterActiveCount > 0 ? (
                        <span className="ml-1 inline-flex min-w-[1.125rem] justify-center rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-bold tabular-nums text-primary ring-1 ring-primary/25">
                          {labelFilterActiveCount}
                        </span>
                      ) : null}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    title="ZIP · one PDF per SKU for rows matching the current filters"
                    disabled={filteredLabels.length === 0 || bulkSkuZipState != null}
                    onClick={() => void requestDownloadAllSkuFiles()}
                    className="h-11 w-full touch-manipulation justify-center rounded-2xl border-white/[0.12] bg-muted/35 text-[13px] font-semibold shadow-sm ring-1 ring-white/[0.06]"
                  >
                    {bulkSkuZipState ? (
                      <Loader2 className="mr-2 size-[16px] animate-spin" aria-hidden />
                    ) : (
                      <Download className="mr-2 size-[16px]" aria-hidden />
                    )}
                    {bulkExportLabel}
                  </Button>
                </div>

                <Dialog open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
                  <DialogContent
                    showCloseButton
                    className="flex max-h-[min(88dvh,680px)] flex-col gap-0 overflow-hidden rounded-t-[1.25rem] border-border/50 bg-popover p-0 shadow-elevate-md ring-1 ring-black/[0.04] dark:ring-white/[0.06] sm:max-w-[min(100vw-2rem,24rem)] sm:rounded-xl"
                  >
                    <DialogHeader className="border-b border-border/40 px-5 pb-3 pt-4">
                      <DialogTitle className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">
                        Filters
                      </DialogTitle>
                      <DialogDescription className="mt-0.5 text-[12px] font-medium leading-snug text-muted-foreground/90">
                        {labelFilterActiveCount > 0 ? (
                          <>
                            {labelFilterActiveCount.toLocaleString()} active ·{" "}
                            <span className="text-foreground/90">Done</span>
                          </>
                        ) : (
                          <>No changes until export.</>
                        )}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                      <LabelPdfFilterFields
                        layout="sheet"
                        listingSkuSearch={listingSkuSearch}
                        onListingSkuSearch={setListingSkuSearch}
                        mappedMasterFilter={mappedMasterFilter}
                        onMasterFilterAll={onMasterFilterAll}
                        onMasterFilterUnmapped={onMasterFilterUnmapped}
                        onMasterFilterToggleMaster={onMasterFilterToggleMaster}
                        qtyFilter={qtyFilter}
                        onQtyFilter={setQtyFilter}
                        partner={partner}
                        onPartner={setPartner}
                        distinctMasterNames={distinctMasterNames}
                        qtyCarrierStats={qtyCarrierStats}
                        rowsLen={rows.length}
                        activeFilterCount={labelFilterActiveCount}
                        onClearFilters={clearLabelFilters}
                        mappedSkuLabelStats={mappedSkuLabelStats}
                      />
                    </div>
                    <div className="flex flex-col gap-2 border-t border-border/40 bg-muted/25 px-4 py-4 pb-safe">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={labelFilterActiveCount === 0}
                        className="h-11 w-full touch-manipulation rounded-xl text-[13px] font-semibold"
                        onClick={() => clearLabelFilters()}
                      >
                        Clear all
                      </Button>
                      <Button
                        type="button"
                        className="h-11 w-full touch-manipulation rounded-xl text-[13px] font-semibold shadow-[0_12px_36px_-18px_rgb(96_165_250/0.85)]"
                        onClick={() => setMobileFilterOpen(false)}
                      >
                        Done
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <div
                role="toolbar"
                data-tour="filter-bar"
                aria-label="Label filters"
                className={cn(PREMIUM_FILTER_TOOLBAR_CLASS)}
              >
                <div className={cn(PREMIUM_FILTER_INNER_CLASS, "sm:p-5")}>
                  <LabelPdfFilterFields
                    layout="desktop"
                    listingSkuSearch={listingSkuSearch}
                    onListingSkuSearch={setListingSkuSearch}
                    mappedMasterFilter={mappedMasterFilter}
                    onMasterFilterAll={onMasterFilterAll}
                    onMasterFilterUnmapped={onMasterFilterUnmapped}
                    onMasterFilterToggleMaster={onMasterFilterToggleMaster}
                    qtyFilter={qtyFilter}
                    onQtyFilter={setQtyFilter}
                    partner={partner}
                    onPartner={setPartner}
                    distinctMasterNames={distinctMasterNames}
                    qtyCarrierStats={qtyCarrierStats}
                    rowsLen={rows.length}
                    activeFilterCount={labelFilterActiveCount}
                    onClearFilters={clearLabelFilters}
                    mappedSkuLabelStats={mappedSkuLabelStats}
                  />
                </div>
              </div>
            )}

            <div
              className={cn(
                "sticky top-0 z-30 -mx-1 mb-1 hidden flex-col gap-2 border-b border-label-grid-border/80 px-1 py-2.5 backdrop-blur-md sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
                "bg-label-sheet/90 dark:bg-label-sheet/90"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {selectedTotal.toLocaleString()} selected ·{" "}
                  {filteredLabels.length.toLocaleString()} labels loaded
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 text-xs sm:h-8 sm:min-h-0"
                  onClick={clearSelection}
                >
                  Clear selection
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="ZIP · one PDF per SKU for rows matching the current filters"
                  className="min-h-11 gap-1 text-xs font-semibold sm:h-8 sm:min-h-0"
                  disabled={filteredLabels.length === 0 || bulkSkuZipState != null}
                  onClick={() => void requestDownloadAllSkuFiles()}
                >
                  {bulkSkuZipState ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Download className="size-3.5" aria-hidden />
                  )}
                  {bulkExportLabel}
                </Button>
                {selectionShowsMergeVsZipChoice ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger
                      type="button"
                      disabled={selectedTotal === 0 || bulkSkuZipState != null}
                      title="Export checked rows"
                      className={cn(
                        buttonVariants({ variant: "default", size: "sm" }),
                        "min-h-11 gap-1 text-xs font-semibold sm:h-8 sm:min-h-0"
                      )}
                    >
                      <Download className="size-3.5" aria-hidden />
                      Download
                      <ChevronDown className="size-3.5 opacity-85" strokeWidth={2.25} aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[17rem]">
                      <DropdownMenuItem
                        className="cursor-pointer py-2.5 font-medium"
                        onClick={() => void downloadFilteredPdf()}
                      >
                        Merged PDF — one file (pages in PDF order)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer py-2.5 font-medium"
                        onClick={() => void downloadSelectedSkuFilesZip()}
                      >
                        ZIP — one PDF per SKU (selected rows only)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    data-tour="download-btn"
                    title="Checked rows · PDF order"
                    className="min-h-11 gap-1 bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 sm:h-8 sm:min-h-0"
                    disabled={selectedTotal === 0 || bulkSkuZipState != null}
                    onClick={() => void downloadFilteredPdf()}
                  >
                    <Download className="size-3.5" aria-hidden />
                    Download
                  </Button>
                )}
              </div>
            </div>

            {mastersExportMarked.size > 0 ? (
              <p className="mb-2 flex flex-wrap items-start gap-2 px-1 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
                <span className="pt-0.5">
                  <ExportedSkuHint />
                </span>
                <span>✓ = already exported this file · re-download OK</span>
              </p>
            ) : null}

            {viewMode == null ? (
              <LabelsWorkspaceHydrationSkeleton />
            ) : viewMode === "mobile" ? (
              <LabelsMobileCards
                rows={filteredLabels}
                selected={selected}
                globalBusy={mapBusy}
                onToggleSelect={toggleSelect}
                onSelectAllInView={selectAllInView}
                virtualTune={perf.labelsMobileCardsVirtual}
                exportedMasterKeys={mastersExportMarked}
              />
            ) : (
              <div className="overflow-x-auto">
                <LabelsVirtualGrid
                  density={viewMode === "tablet" ? "tablet" : "desktop"}
                  rows={filteredLabels}
                  selected={selected}
                  globalBusy={mapBusy}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggleSelect={toggleSelect}
                  onSelectAllInView={selectAllInView}
                  headerClick={headerClick}
                  togglePageSort={togglePageSort}
                  virtualTune={perf.labelsGridVirtual}
                  exportedMasterKeys={mastersExportMarked}
                />
              </div>
            )}

            {viewMode === "mobile" && selectedTotal > 0 ? (
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/88 px-4 pt-3 shadow-[0_-12px_48px_-24px_rgba(0,0,0,0.65)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/72 dark:shadow-[0_-16px_56px_-28px_rgb(0_0_0/0.85)] sm:hidden">
                <div className="mx-auto flex max-w-lg items-center gap-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
                  <div className="min-w-0 flex-1 truncate">
                    <p className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground tabular-nums">
                      {selectedTotal.toLocaleString()}
                      <span className="ml-1.5 text-[12px] font-medium tabular-nums text-muted-foreground/90">
                        selected
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 shrink-0 touch-manipulation rounded-xl px-3 text-[13px] font-semibold text-muted-foreground"
                    onClick={clearSelection}
                  >
                    Clear
                  </Button>
                  {selectionShowsMergeVsZipChoice ? (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger
                        type="button"
                        data-tour="download-btn"
                        disabled={bulkSkuZipState != null}
                        title="Export selected rows"
                        className={cn(
                          buttonVariants({ variant: "default", size: "lg" }),
                          "h-11 min-w-[7.5rem] touch-manipulation gap-1.5 rounded-xl px-4 text-[13px] font-semibold shadow-[0_8px_32px_-14px_rgb(96_165_250/0.9)]"
                        )}
                      >
                        <Download className="size-[18px] shrink-0" aria-hidden />
                        Download
                        <ChevronDown className="size-4 shrink-0 opacity-85" strokeWidth={2.25} aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="top" align="end" sideOffset={10} className="min-w-[min(100vw-2rem,19rem)]">
                        <DropdownMenuItem
                          className="cursor-pointer py-2.5 text-[13px] font-medium"
                          onClick={() => void downloadFilteredPdf()}
                        >
                          Merged PDF — one file
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer py-2.5 text-[13px] font-medium"
                          onClick={() => void downloadSelectedSkuFilesZip()}
                        >
                          ZIP — one PDF per SKU
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button
                      type="button"
                      data-tour="download-btn"
                      className="h-11 min-w-[6.75rem] touch-manipulation gap-1.5 rounded-xl px-4 text-[13px] font-semibold shadow-[0_8px_32px_-14px_rgb(96_165_250/0.9)]"
                      disabled={bulkSkuZipState != null}
                      onClick={() => void downloadFilteredPdf()}
                    >
                      <Download className="size-[18px] shrink-0" aria-hidden />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </WorkspaceSurfaceCard>
      ) : null}

      <Dialog open={bulkSkuZipState != null} disablePointerDismissal onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="gap-4 sm:max-w-sm">
          <DialogHeader className="gap-0.5 text-left sm:text-left">
            <DialogTitle className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">
              {bulkSkuZipModal.title}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[12px] font-medium leading-snug text-muted-foreground/90">
              {bulkSkuZipModal.body}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted/90 ring-1 ring-border/30">
              <div
                className="h-full rounded-full bg-primary/85 transition-[width] duration-300 ease-out"
                style={{ width: `${bulkSkuZipModal.pct}%` }}
              />
            </div>
            <p className="text-[12px] font-medium leading-snug text-muted-foreground/90">
              Filtered rows only.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceModulePageStack>
  );
}
