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
  Layers2,
  Loader2,
} from "lucide-react";

import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { Button } from "@/components/ui/button";
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
  sortLabelsForGroupedExport,
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
} from "@/lib/meesho-label-export/export-selected-pages";
import { readSkuMappingLocalDraft } from "@/lib/sku-mapping-module/sku-mapping-local-draft";
import { useAuth } from "@/lib/supabase/auth-context";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { fetchSkuMapSnapshot } from "@/lib/supabase/sku-map-remote";
import { readSkuMapSnapshotCache } from "@/lib/supabase/sku-map-snapshot-cache";
import type { MeeshoLabelRecord } from "@/types/meesho-label-export";
import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";
import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";
import { useRuntimePerformanceProfile } from "@/hooks/use-runtime-performance-profile";
import { cn } from "@/lib/utils";
import type { VirtualListTuning } from "@/lib/runtime/performance-tier";

const ROW_H = 42;
/** Virtual row height — compact two-line card + gutter (premium mobile density). */
const CARD_ROW_H = 98;

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

/** Compact hint that this mapped SKU bucket was already included in a successful export. */
function ExportedSkuHint({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border border-emerald-600/25 bg-emerald-500/12 px-1 py-px font-sans text-[9px] font-bold leading-none tracking-tight text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/12 dark:text-emerald-100",
        className
      )}
      title="This mapped SKU (or unmapped bucket) was already included in a PDF export for this file. You can export again anytime."
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
  return "Try again, or use a smaller PDF if this keeps happening.";
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
    return `Unmapped (${stats.unmapped.toLocaleString()})`;
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
  perQty: Record<number, number>;
  perPartner: Record<string, number>;
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
}: {
  primary: React.ReactNode;
  count: number;
}) {
  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-4">
      <span className="min-w-0 flex-1 truncate text-[13px] leading-snug">{primary}</span>
      <span
        className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground sm:text-[12px]"
        title={`${count.toLocaleString()} label${count === 1 ? "" : "s"} in this PDF`}
      >
        {count.toLocaleString()}
      </span>
    </span>
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
  layout: "desktop" | "mobile";
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
  const isMobile = layout === "mobile";
  const lbl = isMobile ? MOBILE_FILTER_LABEL_CLASS : PREMIUM_FIELD_LABEL_CLASS;
  const ctl = isMobile ? MOBILE_FIELD_CONTROL_CLASS : PREMIUM_FIELD_CONTROL_CLASS;
  const selectTriggerExtras = cn(
    "h-10 shrink-0 border py-0 pr-8 hover:bg-background [&_svg]:size-[15px] [&_svg]:text-muted-foreground/70 [&_[data-slot=select-value]]:truncate",
    isMobile ? "rounded-lg" : "rounded-full"
  );

  const masterBlock = (
    <div className="min-w-0">
      <Label htmlFor="label-filter-master-trigger" className={lbl}>
        Mapped SKU
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          id="label-filter-master-trigger"
          title="From SKU Mapping—the group SKU linked to each listing. Counts are labels in this PDF. Pick one or more mapped SKUs; All shows every row."
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
                  primary={<span className="font-semibold text-foreground">All mapped SKUs</span>}
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
                  primary={<span className="font-semibold">Unmapped only</span>}
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
          title="Order quantity extracted from labels. Numbers on the right are how many labels show that qty."
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
            isMobile ? "mt-1 text-[10px]" : "mt-2 text-[11px]"
          )}
        >
          No quantity detected in this PDF.
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
          title="Carrier on the label. Counts show how many labels use each carrier."
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
            />
          </SelectItem>
          {qtyCarrierStats.partnersSortedDesc.map((p) => (
            <SelectItem key={p} value={p} className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium">
              <FilterMenuCountRow primary={<span className="font-medium">{p}</span>} count={qtyCarrierStats.perPartner[p] ?? 0} />
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
        isMobile
          ? "h-10 w-full text-[13px] font-semibold"
          : "h-9 shrink-0 px-4 text-[12px] font-semibold"
      }
      disabled={activeFilterCount === 0}
      onClick={onClearFilters}
    >
      Clear filters
    </Button>
  );

  if (isMobile) {
    return (
      <div className="space-y-4">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Filters only change which labels you see—the PDF file is untouched until you export.
          Use{" "}
          <span className="font-semibold text-foreground/85">Mapped SKU</span> for the SKU you
          set in SKU Mapping.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="label-filter-listing-sku" className={lbl}>
              Listing SKU
            </Label>
            <Input
              id="label-filter-listing-sku"
              value={listingSkuSearch}
              onChange={(e) => onListingSkuSearch(e.target.value)}
              placeholder="Search listing SKUs…"
              title="Find labels by marketplace listing SKU (partial match)."
              aria-describedby="label-filter-listing-hint-mobile"
              className={cn(ctl, "h-10 py-2")}
            />
            <p id="label-filter-listing-hint-mobile" className="mt-1.5 text-[11px] text-muted-foreground">
              Matches any part of the listing code.
            </p>
          </div>
          {masterBlock}
          {qtyBlock}
          {courierBlock}
        </div>

        <div>{clearBtn}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p className="max-w-xl text-[12px] leading-relaxed text-muted-foreground lg:text-[13px]">
          Narrow the grid before export.{" "}
          <span className="text-foreground/80">Mapped SKU</span> uses your SKU Mapping; leave
          everything on All to see the full PDF.
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
            placeholder="Search listing SKUs…"
            title="Find labels by marketplace listing SKU (partial match)."
            aria-describedby="label-filter-listing-hint-desk"
            className={cn(ctl, "h-10 py-2")}
          />
          <p id="label-filter-listing-hint-desk" className="sr-only">
            Matches any part of the listing SKU text.
          </p>
        </div>
        {masterBlock}
        {qtyBlock}
        {courierBlock}
      </div>
      {activeFilterCount > 0 ? null : (
        <p className="text-[11px] text-muted-foreground/90 lg:text-[12px]">
          Tip: long-press or hover filters for short explanations.
        </p>
      )}
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
    <div className="overflow-hidden rounded-md border border-label-grid-border bg-card shadow-inner dark:shadow-none">
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
          aria-label="Select all rows in view"
        >
          <Checkbox
            checked={allInViewSelected}
            disabled={globalBusy || rows.length === 0}
            onCheckedChange={(c) => onSelectAllInView(Boolean(c))}
            aria-label="Select all in view"
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
            title="Mapped SKU from SKU Mapping. A small ✓ on rows means that mapped SKU (or unmapped bucket) was already included in a PDF export for this file."
            className="interaction-press flex min-h-11 w-full min-w-0 touch-manipulation items-center gap-0.5 whitespace-nowrap rounded-md px-1 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 sm:min-h-0"
            onClick={() => headerClick("master_sku")}
          >
            <span className="truncate">Mapped SKU</span>
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
            No rows match these filters.
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
              const stripe =
                vi.index % 2 === 0 ? "bg-card" : "bg-muted/35";
              return (
                <div
                  key={r.id}
                  className={`absolute left-0 top-0 w-full border-b border-border ${stripe}`}
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
    estimateSize: () => CARD_ROW_H,
    overscan: virtualTune.overscan,
    useAnimationFrameWithResizeObserver: virtualTune.useAnimationFrameWithResizeObserver,
  });

  const allInViewSelected =
    rows.length > 0 && rows.every((r) => Boolean(selected[r.id]));

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm ring-1 ring-border/10 dark:border-border dark:ring-border/25">
      <div className="flex min-h-11 items-center gap-2 border-b border-border/50 bg-muted/40 px-3 py-2 dark:bg-muted/25">
        <Checkbox
          checked={allInViewSelected}
          disabled={globalBusy || rows.length === 0}
          onCheckedChange={(c) => onSelectAllInView(Boolean(c))}
          aria-label="Select all in view"
          className="size-5"
        />
        <span className="text-[12px] font-medium text-muted-foreground">
          <span className="tabular-nums font-semibold text-foreground">
            {rows.length.toLocaleString()}
          </span>{" "}
          rows · tap checkbox to export
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[min(56dvh,560px)] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
        role="list"
      >
        {rows.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">
            No rows match these filters.
          </p>
        ) : (
          <div
            className="relative px-2 py-3"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const r = rows[vi.index];
              if (!r) return null;
              return (
                <div
                  key={r.id}
                  className="absolute left-2 right-2 top-0"
                  style={{
                    height: `${vi.size}px`,
                    transform: `translateY(${vi.start}px)`,
                  }}
                  role="listitem"
                >
                  <div className="flex h-[calc(100%-6px)] gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-sm dark:border-border/80">
                    <div className="flex shrink-0 items-center">
                      <Checkbox
                        checked={Boolean(selected[r.id])}
                        disabled={globalBusy}
                        onCheckedChange={(c) =>
                          onToggleSelect(r.id, Boolean(c))
                        }
                        aria-label={`Select label page ${r.page}`}
                        className="size-5"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-all font-mono text-[13px] font-semibold leading-snug text-foreground">
                          {r.listing_sku || "—"}
                        </p>
                        <span className="shrink-0 rounded-md bg-muted/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-border/50 dark:bg-muted/40">
                          p.{r.page}
                        </span>
                      </div>
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
                        <span
                          className={cn(
                            "flex min-w-0 items-center gap-1",
                            !r.master_sku?.trim() && "text-amber-700 dark:text-amber-300"
                          )}
                        >
                          <span className="min-w-0 truncate">
                            {r.master_sku?.trim()
                              ? r.master_sku.trim()
                              : "Unmapped"}
                          </span>
                          {exportedMasterKeys.has(rowMasterExportKey(r)) ? (
                            <ExportedSkuHint />
                          ) : null}
                        </span>
                        <span aria-hidden className="text-border">
                          ·
                        </span>
                        <span className="tabular-nums">qty {r.quantity ?? "—"}</span>
                        <span aria-hidden className="text-border">
                          ·
                        </span>
                        <span className="min-w-0 truncate">{r.delivery_partner}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {rows.length > 0 ? (
        <p className="border-t border-border/45 bg-muted/25 px-3 py-1.5 text-center text-[10px] tabular-nums text-muted-foreground">
          Pull to scroll list
        </p>
      ) : null}
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

  const [sortKey, setSortKey] = React.useState<SortKey | "page">("page");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const [selected, setSelected] = React.useState<Record<string, true>>({});

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
    for (const r of enrichedRows) {
      const q = r.quantity;
      if (q != null && Number.isFinite(q)) {
        perQty[q] = (perQty[q] ?? 0) + 1;
      }
      const dp = r.delivery_partner?.trim();
      if (dp) {
        perPartner[dp] = (perPartner[dp] ?? 0) + 1;
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
      perQty,
      perPartner,
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
      notify.error("Unsupported file", {
        description: "Upload a single PDF (.pdf).",
      });
      return;
    }
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
      notify.error("Could not parse this PDF", {
        description: res.error ?? "No label pages detected.",
      });
      return;
    }

    setRows(res.rows);
    setPdfBytes(res.pdfBytes);
    setSourceName(file.name.replace(/\.pdf$/i, ""));
    notify.success(`${res.rows.length.toLocaleString()} labels extracted`);

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
    setSelected({});
  }

  async function downloadFilteredPdf() {
    if (!pdfBytes || selectedTotal === 0) {
      notify.info("Select at least one row to export.");
      return;
    }
    const idSet = new Set(Object.keys(selected));
    const exportedEnriched = enrichedRows.filter((r) => idSet.has(r.id));
    const pagesToExport = rows
      .filter((r) => idSet.has(r.id))
      .map((r) => r.page)
      .sort((a, b) => a - b);

    if (pagesToExport.length === 0) {
      notify.error("Cannot resolve PDF pages for that selection.");
      return;
    }

    try {
      const out = await exportPdfPages(pdfBytes, pagesToExport);
      triggerPdfDownload(out, buildSelectedExportFilename(exportedEnriched));
      mergeExportedMastersFromRows(exportedEnriched);
      notify.success(`Exported ${pagesToExport.length.toLocaleString()} page(s)`, {
        description:
          "A ✓ by Mapped SKU marks buckets already exported for this file—you can export again anytime.",
      });
    } catch (e) {
      notify.error("Couldn’t export that PDF yet", {
        description: describeExportFailure(e),
      });
    }
  }

  async function downloadFilteredGroupedPdf() {
    if (!pdfBytes || filteredLabels.length === 0) {
      notify.info("No labels match your filters.");
      return;
    }
    const grouped = sortLabelsForGroupedExport(filteredLabels);
    const pagesInOrder = grouped.map((r) => r.page);
    try {
      const out = await exportPdfPagesInOrder(pdfBytes, pagesInOrder);
      const base = sourceName || "meesho-labels";
      triggerPdfDownload(out, `${base}-labels-filtered-grouped.pdf`);
      mergeExportedMastersFromRows(grouped);
      notify.success(
        `Exported ${grouped.length.toLocaleString()} page(s) in grouped order`,
        {
          description:
            "✓ marks each mapped SKU (and unmapped) included in this grouped export so repeat downloads are easy to spot.",
        }
      );
    } catch (e) {
      notify.error("Couldn’t export that PDF yet", {
        description: describeExportFailure(e),
      });
    }
  }

  function requestDownload() {
    void downloadFilteredPdf();
  }

  function requestGroupedDownload() {
    void downloadFilteredGroupedPdf();
  }

  const hasMappedSkuLabels =
    Object.keys(mappedSkuLabelStats.perName).length > 0;

  const ready = rows.length > 0 && pdfBytes && !parsing;
  const mapBusy = parsing;

  return (
    <>
      <WorkspaceSurfaceCard padding="p-5 sm:p-6">
        <div
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
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Page {parseProgress[0]} / {parseProgress[1]}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-inner">
                  <FileUp className="size-7 text-primary" strokeWidth={1.35} aria-hidden />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[17px] font-semibold tracking-tight text-foreground">
                    Import your Meesho label PDF
                  </p>
                  <p className="mx-auto max-w-md text-[13px] leading-relaxed text-muted-foreground">
                    PDF only · one label per page—drag in or browse.
                  </p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="mt-2 min-h-11 min-w-[160px] font-semibold shadow-sm hover:brightness-[1.02] active:brightness-[0.98] sm:min-h-10"
                  disabled={parsing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose PDF
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
              "relative space-y-3 rounded-xl border border-label-grid-border bg-label-sheet p-3 shadow-inner ring-1 ring-border/20 sm:space-y-4 sm:p-5",
              viewMode === "mobile" && "pb-[5.5rem] sm:pb-28"
            )}
            aria-labelledby="labels-grid-heading"
          >
            <div className="flex flex-col gap-2.5 border-b border-label-grid-border pb-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2
                    id="labels-grid-heading"
                    className="text-base font-semibold tracking-tight text-foreground sm:text-lg"
                  >
                    Labels in this PDF
                  </h2>
                  <span className="hidden text-muted-foreground/80 sm:inline" aria-hidden>
                    ·
                  </span>
                  <span className="text-[13px] font-medium tabular-nums text-muted-foreground sm:inline">
                    {filteredLabels.length.toLocaleString()}
                    <span className="font-normal text-muted-foreground"> in view</span>
                  </span>
                </div>
                <p className="mt-2 hidden max-w-2xl text-[12px] leading-relaxed text-muted-foreground md:block lg:text-[13px]">
                  Search and refine the list below, then export the pages you selected or a grouped PDF
                  ordered by SKU, carrier, quantity, then listing SKU.
                </p>
                <div className="mt-2 flex flex-wrap gap-2 md:hidden">
                  <span className="inline-flex items-center rounded-md bg-background/95 px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground ring-1 ring-border/55">
                    {enrichedRows.length.toLocaleString()} total
                  </span>
                  <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-border/40">
                    {mappedRows.length.toLocaleString()} mapped ·{" "}
                    {(enrichedRows.length - mappedRows.length).toLocaleString()} open
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
                  {mappedRows.length.toLocaleString()} mapped ·{" "}
                  {(enrichedRows.length - mappedRows.length).toLocaleString()} need attention
                </div>
              </div>
            </div>

            {authReady &&
            !userId &&
            getSupabaseBrowser() &&
            hasMappedSkuLabels ? (
              <div className="rounded-lg border border-border border-l-[3px] border-l-primary bg-muted/30 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Optional workspace backup:</span>{" "}
                your SKU mappings are enriching this PDF on-device. Sign in once if you&apos;d like
                the same SKU map persisted in our cloud workspace long term—it&apos;s free, and exports
                stay in sync everywhere you use Label.&nbsp;
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
              <details className="group overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-sm open:border-border open:shadow-md [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer touch-manipulation list-none items-start gap-3 px-4 py-3.5 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold tracking-tight text-foreground">
                        Filters
                      </span>
                      {labelFilterActiveCount > 0 ? (
                        <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                          {labelFilterActiveCount} active
                        </span>
                      ) : (
                        <span className="text-[12px] font-medium text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-w-[52ch] text-[12px] leading-snug text-muted-foreground">
                      Refine which labels appear—you can clear everything in one tap inside.
                    </p>
                  </div>
                  <ChevronDown
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-smooth group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="border-t border-border/50 bg-muted/[0.08] px-4 pb-4 pt-3 dark:bg-muted/20">
                  <LabelPdfFilterFields
                    layout="mobile"
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
              </details>
            ) : (
              <div
                role="toolbar"
                aria-label="Filter labels"
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

            <div className="hidden flex-col gap-2 border-b border-label-grid-border pb-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {selectedTotal.toLocaleString()} selected ·{" "}
                  {filteredLabels.length.toLocaleString()} in view
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 text-xs sm:h-8 sm:min-h-0"
                  onClick={clearSelection}
                >
                  Reset selection
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="Export every row in view, grouped by SKU, carrier, quantity, then listing—not only checked rows."
                  className="min-h-11 gap-1 text-xs font-semibold sm:h-8 sm:min-h-0"
                  disabled={filteredLabels.length === 0}
                  onClick={() => void requestGroupedDownload()}
                >
                  <Layers2 className="size-3.5 shrink-0" aria-hidden />
                  Export filtered · grouped
                </Button>
                <Button
                  type="button"
                  size="sm"
                  title="Pages in original PDF order for the checked rows."
                  className="min-h-11 gap-1 bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 sm:h-8 sm:min-h-0"
                  disabled={selectedTotal === 0}
                  onClick={() => void requestDownload()}
                >
                  <Download className="size-3.5" aria-hidden />
                  Export PDF
                </Button>
              </div>
            </div>

            {mastersExportMarked.size > 0 ? (
              <p className="mb-2 flex flex-wrap items-start gap-2 px-1 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
                <span className="pt-0.5">
                  <ExportedSkuHint />
                </span>
                <span>
                  Marks a mapped SKU (or the unmapped bucket) already included in a successful PDF export
                  for this file. You can export again anytime.
                </span>
              </p>
            ) : null}

            {viewMode == null ? (
              <div
                className="flex min-h-[min(52vh,480px)] items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20"
                aria-busy="true"
                aria-label="Preparing workspace layout"
              >
                <p className="text-xs text-muted-foreground">Loading…</p>
              </div>
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

            {viewMode === "mobile" ? (
              <div className="pointer-events-none fixed bottom-4 left-3 z-40 pb-[env(safe-area-inset-bottom,0px)] sm:hidden">
                <button
                  type="button"
                  title="Export PDF for selected rows"
                  aria-label={`Export PDF. ${selectedTotal.toLocaleString()} rows selected.`}
                  disabled={selectedTotal === 0}
                  onClick={() => void requestDownload()}
                  className="pointer-events-auto flex size-14 touch-manipulation items-center justify-center rounded-full border border-primary/35 bg-primary text-primary-foreground shadow-[0_4px_20px_rgb(59_130_246/0.35)] outline-none ring-2 ring-primary/25 transition-[transform,box-shadow] hover:bg-primary/95 hover:shadow-[0_6px_28px_rgb(59_130_246/0.45)] active:scale-[0.97] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 dark:shadow-[0_4px_24px_rgb(59_130_246/0.25)] dark:ring-offset-background"
                >
                  <Download className="size-7" strokeWidth={2} aria-hidden />
                </button>
              </div>
            ) : null}
          </section>
        </WorkspaceSurfaceCard>
      ) : null}
    </>
  );
}
