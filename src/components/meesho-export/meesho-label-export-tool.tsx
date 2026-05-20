"use client";

import * as React from "react";

import { toast as notify } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Check,
  ChevronDown,
  Download,
  FileUp,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { ShippingLabelCropper } from "@/components/label-cropper/shipping-label-cropper";
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
import type { PdfLabelParseStats } from "@/lib/meesho-label-export/parse-meesho-label-pdf-core";
import {
  exportPdfPagesFromMultiSourceOrdered,
  triggerPdfDownload,
  triggerZipDownload,
} from "@/lib/meesho-label-export/export-selected-pages";
import { readSkuMappingLocalDraft } from "@/lib/sku-mapping-module/sku-mapping-local-draft";
import { useAuth } from "@/lib/supabase/auth-context";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { fetchSkuMapSnapshot } from "@/lib/supabase/sku-map-remote";
import { readSkuMapSnapshotCache } from "@/lib/supabase/sku-map-snapshot-cache";
import { trackEvent } from "@/lib/analytics/posthog-client";
import {
  analyzeCropperPdfBytes,
  amazonShippingCropOverlayText,
  cropEntriesToPdf,
  zipCroppedPdfs,
  type CropExportEntry,
  type CropMode,
  type CropperDocument,
  type CropperPage,
} from "@/lib/label-cropper/shipping-label-cropper";
import {
  amazonShippingOverlayText,
  containsAmazonRows,
  normalizeAmazonOrderId,
  pairAmazonShippingRows,
  type AmazonTaxInvoicePage,
} from "@/lib/amazon-label-engine";
import type {
  MarketplaceKind,
  MeeshoLabelRecord,
  PaymentKind,
} from "@/types/meesho-label-export";
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

function marketplaceDisplay(value: MarketplaceKind): string {
  switch (value) {
    case "amazon":
      return "Amazon";
    case "flipkart":
      return "Flipkart";
    case "meesho":
      return "Meesho";
    default:
      return "Unknown";
  }
}

/** Session key for “already exported” hints — scoped per imported PDF fingerprint. */
const MEESHO_SKU_EXPORT_MARK_STORAGE = "lable.meeshoSkuExported.v1";
const AMAZON_INCLUDE_INVOICE_DOWNLOAD_STORAGE =
  "tulmin.amazonIncludeInvoiceDownload.v1";
const ROW_MASTER_EXPORT_KEY_UNMAPPED = "__unmapped__";

type ImportFailureReason =
  | "parse_error"
  | "image_only_pdf"
  | "unrecognized_layout"
  | "invoice_only"
  | "empty_pdf";

type ImportFailure = {
  name: string;
  reason: ImportFailureReason;
  error?: string;
};

function classifyImportFailure(stats: PdfLabelParseStats, error?: string): ImportFailureReason {
  if (error) return "parse_error";
  if (stats.pageCount > 0 && stats.textPageCount === 0) return "image_only_pdf";
  if (stats.unrecognizedTextPageCount > 0) return "unrecognized_layout";
  return "empty_pdf";
}

function importFailureCopy(failures: readonly ImportFailure[]): {
  title: string;
  description: string;
} {
  const failedCount = failures.length.toLocaleString();
  if (failures.some((failure) => failure.reason === "image_only_pdf")) {
    return {
      title: "Could not read this PDF",
      description:
        "Root cause: this PDF has no selectable text layer, and OCR could not detect a supported label. Upload the original marketplace PDF export or a clearer scan.",
    };
  }

  if (failures.some((failure) => failure.reason === "unrecognized_layout")) {
    return {
      title: "Could not detect labels in this PDF",
      description:
        "The PDF text is readable, but it does not match Meesho, Flipkart, or the new Amazon shipping/invoice layouts.",
    };
  }

  if (failures.some((failure) => failure.reason === "invoice_only")) {
    return {
      title: "Amazon shipping labels not detected",
      description:
        "Tulmin read the Amazon tax invoice page, but no shipping-label page was detected. Upload the original Amazon PDF with shipping labels, or a clearer scan if the label is image-based.",
    };
  }

  if (failures.some((failure) => failure.reason === "parse_error")) {
    const firstError = failures.find((failure) => failure.error)?.error;
    return {
      title: "Could not parse this PDF",
      description: firstError ? firstError : `${failedCount} file(s) failed.`,
    };
  }

  return {
    title: "Could not parse this PDF",
    description: `${failedCount} file(s) failed.`,
  };
}

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

type ImportedPdfSource = {
  id: string;
  fileName: string;
  pdfBytes: Uint8Array;
  order: number;
};

function listingSkuDisplay(row: EnrichedMeeshoLabelRow): React.ReactNode {
  if (row.listing_sku.trim()) return row.listing_sku;
  if (row.marketplace === "amazon" && row.matchStatus === "Invoice Missing") {
    return <span className="text-amber-700 dark:text-amber-200">Tax invoice missing</span>;
  }
  if (row.marketplace === "amazon" && row.matchStatus !== "Matched") {
    return <span className="text-muted-foreground">Unmatched Amazon page</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

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

function WorkflowStepPill({
  step,
  label,
  active,
}: {
  step: string;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold leading-none",
        active
          ? "border-primary/30 bg-primary/12 text-primary ring-1 ring-primary/10"
          : "border-border/55 bg-muted/25 text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums",
          active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
        )}
      >
        {step}
      </span>
      {label}
    </span>
  );
}

function RunMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "amazon";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border px-3 py-2.5",
        tone === "good"
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
          : tone === "warn"
            ? "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100"
            : tone === "amazon"
              ? "border-orange-500/20 bg-orange-500/10 text-orange-900 dark:text-orange-100"
              : "border-border/50 bg-muted/18 text-foreground"
      )}
    >
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

/** Label/page counts per mapped SKU in this PDF (not order quantity). */
type MappedSkuLabelStats = {
  perName: Record<string, number>;
  perUnmappedListingSku: Record<string, number>;
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
    return `Not mapped (${stats.unmapped.toLocaleString()})`;
  if (f.mode === "unmapped_listing") {
    const names = f.listingSkus;
    if (names.length === 0) return `Not mapped (${stats.unmapped.toLocaleString()})`;
    if (names.length === 1) {
      const name = names[0];
      const n = stats.perUnmappedListingSku[name] ?? 0;
      return n > 0 ? `${name} · Not mapped (${n.toLocaleString()})` : `${name} · Not mapped`;
    }
    let sum = 0;
    for (const name of names) sum += stats.perUnmappedListingSku[name] ?? 0;
    return `${names.length} not mapped SKUs (${sum.toLocaleString()})`;
  }
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
  perPayment: Record<PaymentKind, number>;
  /** Sum of `quantity` per carrier (labels without qty omitted from the sum). */
  partnerOrderQtySum: Record<string, number>;
  quantitiesSortedDesc: number[];
  partnersSortedDesc: string[];
};

type MarketplaceFilterStats = {
  total: number;
  perMarketplace: Record<MarketplaceKind, number>;
};

const MARKETPLACE_FILTER_VALUES = ["meesho", "flipkart", "amazon", "unknown"] as const;
const PAYMENT_FILTER_VALUES = ["prepaid", "cod", "exchange", "unknown"] as const;

type FilterFacet = "marketplace" | "mappedMaster" | "payment" | "quantity" | "partner";

function filtersForFacetCounts(filters: MeeshoLabelFilters, facet: FilterFacet): MeeshoLabelFilters {
  return {
    ...filters,
    marketplace: facet === "marketplace" ? "all" : filters.marketplace,
    mappedMaster: facet === "mappedMaster" ? { mode: "all" } : filters.mappedMaster,
    payment: facet === "payment" ? "all" : filters.payment,
    qtyExact: facet === "quantity" ? null : filters.qtyExact,
    partner: facet === "partner" ? "" : filters.partner,
  };
}

function rowsForFacetCounts(
  rows: EnrichedMeeshoLabelRow[],
  filters: MeeshoLabelFilters,
  facet: FilterFacet
): EnrichedMeeshoLabelRow[] {
  return applyMeeshoLabelFilters(rows, filtersForFacetCounts(filters, facet));
}

function buildMarketplaceFilterStats(rows: readonly EnrichedMeeshoLabelRow[]): MarketplaceFilterStats {
  const perMarketplace: Record<MarketplaceKind, number> = {
    meesho: 0,
    flipkart: 0,
    amazon: 0,
    unknown: 0,
  };
  for (const row of rows) perMarketplace[row.marketplace] += 1;
  return { total: rows.length, perMarketplace };
}

function buildMappedSkuLabelStats(rows: readonly EnrichedMeeshoLabelRow[]): MappedSkuLabelStats {
  const perName: Record<string, number> = {};
  const perUnmappedListingSku: Record<string, number> = {};
  let unmapped = 0;
  for (const row of rows) {
    const master = row.master_sku?.trim();
    if (!master) {
      unmapped++;
      const listingSku = row.listing_sku?.trim();
      if (listingSku) perUnmappedListingSku[listingSku] = (perUnmappedListingSku[listingSku] ?? 0) + 1;
      continue;
    }
    perName[master] = (perName[master] ?? 0) + 1;
  }
  return { perName, perUnmappedListingSku, unmapped, total: rows.length };
}

function buildQtyCarrierFilterStats(rows: readonly EnrichedMeeshoLabelRow[]): QtyCarrierFilterStats {
  const perQty: Record<number, number> = {};
  const perPartner: Record<string, number> = {};
  const perPayment: Record<PaymentKind, number> = {
    prepaid: 0,
    cod: 0,
    exchange: 0,
    unknown: 0,
  };
  const partnerOrderQtySum: Record<string, number> = {};
  let totalOrderQty = 0;
  for (const row of rows) {
    perPayment[row.payment] = (perPayment[row.payment] ?? 0) + 1;
    const qty = row.quantity;
    if (qty != null && Number.isFinite(qty)) {
      perQty[qty] = (perQty[qty] ?? 0) + 1;
      totalOrderQty += qty;
    }
    const partner = row.delivery_partner?.trim();
    if (partner) {
      perPartner[partner] = (perPartner[partner] ?? 0) + 1;
      if (qty != null && Number.isFinite(qty)) {
        partnerOrderQtySum[partner] = (partnerOrderQtySum[partner] ?? 0) + qty;
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
    totalLabels: rows.length,
    totalOrderQty,
    perQty,
    perPartner,
    perPayment,
    partnerOrderQtySum,
    quantitiesSortedDesc,
    partnersSortedDesc,
  };
}

function marketplaceLabel(value: MarketplaceKind | "all"): string {
  switch (value) {
    case "meesho":
      return "Meesho";
    case "flipkart":
      return "Flipkart";
    case "amazon":
      return "Amazon";
    case "unknown":
      return "Unknown";
    default:
      return "All";
  }
}

function marketplaceFilterTriggerDisplay(
  value: MarketplaceKind | "all" | string,
  stats: MarketplaceFilterStats
): string {
  if (value === "all") return `All (${stats.total.toLocaleString()})`;
  if (value === "meesho" || value === "flipkart" || value === "amazon" || value === "unknown") {
    return `${marketplaceLabel(value)} (${(stats.perMarketplace[value] ?? 0).toLocaleString()})`;
  }
  return String(value);
}

function visibleMarketplaceFilterValues(
  stats: MarketplaceFilterStats
): (MarketplaceKind | "all")[] {
  return [
    "all",
    ...MARKETPLACE_FILTER_VALUES.filter((value) => (stats.perMarketplace[value] ?? 0) > 0),
  ];
}

function visiblePaymentFilterValues(
  stats: QtyCarrierFilterStats
): (PaymentKind | "all")[] {
  return [
    "all",
    ...PAYMENT_FILTER_VALUES.filter((value) => (stats.perPayment[value] ?? 0) > 0),
  ];
}

function paymentLabel(value: PaymentKind | "all"): string {
  switch (value) {
    case "prepaid":
      return "Prepaid";
    case "cod":
      return "COD";
    case "exchange":
      return "Exchange";
    case "unknown":
      return "Unknown";
    default:
      return "All";
  }
}

function paymentFilterTriggerDisplay(
  value: PaymentKind | "all" | string,
  stats: QtyCarrierFilterStats
): string {
  if (value === "all") return `All (${stats.totalLabels.toLocaleString()})`;
  if (value === "prepaid" || value === "cod" || value === "exchange" || value === "unknown") {
    return `${paymentLabel(value)} (${(stats.perPayment[value] ?? 0).toLocaleString()})`;
  }
  return String(value);
}

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
  marketplaceFilter,
  onMarketplaceFilter,
  paymentFilter,
  onPaymentFilter,
  onMasterFilterAll,
  onMasterFilterUnmapped,
  onMasterFilterToggleMaster,
  onMasterFilterToggleUnmappedSku,
  qtyFilter,
  onQtyFilter,
  partner,
  onPartner,
  distinctMasterNames,
  distinctUnmappedListingSkus,
  paymentFilterStats,
  qtyFilterStats,
  carrierFilterStats,
  rowsLen,
  activeFilterCount,
  onClearFilters,
  mappedSkuLabelStats,
  marketplaceFilterStats,
}: {
  layout: "desktop" | "sheet";
  listingSkuSearch: string;
  onListingSkuSearch: (v: string) => void;
  mappedMasterFilter: MappedSkuMasterFilter;
  marketplaceFilter: MarketplaceKind | "all";
  onMarketplaceFilter: (v: MarketplaceKind | "all") => void;
  paymentFilter: PaymentKind | "all";
  onPaymentFilter: (v: PaymentKind | "all") => void;
  onMasterFilterAll: () => void;
  onMasterFilterUnmapped: () => void;
  onMasterFilterToggleMaster: (name: string, checked: boolean) => void;
  onMasterFilterToggleUnmappedSku: (sku: string, checked: boolean) => void;
  qtyFilter: string;
  onQtyFilter: (v: string) => void;
  partner: string;
  onPartner: (v: string) => void;
  distinctMasterNames: string[];
  distinctUnmappedListingSkus: string[];
  paymentFilterStats: QtyCarrierFilterStats;
  qtyFilterStats: QtyCarrierFilterStats;
  carrierFilterStats: QtyCarrierFilterStats;
  rowsLen: number;
  activeFilterCount: number;
  onClearFilters: () => void;
  mappedSkuLabelStats: MappedSkuLabelStats;
  marketplaceFilterStats: MarketplaceFilterStats;
}) {
  const isSheet = layout === "sheet";
  const lbl = isSheet ? MOBILE_FILTER_LABEL_CLASS : PREMIUM_FIELD_LABEL_CLASS;
  const ctl = isSheet ? MOBILE_FIELD_CONTROL_CLASS : PREMIUM_FIELD_CONTROL_CLASS;
  const selectTriggerExtras = cn(
    "h-10 shrink-0 border py-0 pr-8 hover:bg-background [&_svg]:size-[15px] [&_svg]:text-muted-foreground/70 [&_[data-slot=select-value]]:truncate",
    isSheet ? "rounded-xl" : "rounded-full"
  );
  const marketplaceFilterValues = visibleMarketplaceFilterValues(marketplaceFilterStats);
  const paymentFilterValues = visiblePaymentFilterValues(paymentFilterStats);
  const showUnmappedFilter =
    mappedSkuLabelStats.unmapped > 0 ||
    mappedMasterFilter.mode === "unmapped" ||
    mappedMasterFilter.mode === "unmapped_listing";

  const marketplaceBlock = (
    <div className="min-w-0">
      <Label htmlFor="label-filter-marketplace" className={lbl}>
        Marketplace
      </Label>
      <Select
        value={marketplaceFilter}
        onValueChange={(v) => {
          if (v === "all" || v === "meesho" || v === "flipkart" || v === "amazon" || v === "unknown") {
            onMarketplaceFilter(v);
          }
        }}
      >
        <SelectTrigger
          size="sm"
          id="label-filter-marketplace"
          title="Marketplace detected from each PDF page"
          className={cn(ctl, selectTriggerExtras)}
        >
          <SelectValue
            placeholder={marketplaceFilterTriggerDisplay("all", marketplaceFilterStats)}
          >
            {(v) =>
              marketplaceFilterTriggerDisplay(
                typeof v === "string" ? v : "all",
                marketplaceFilterStats
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          {...FILTER_SELECT_POPUP_SIDE}
          className={cn(FILTER_SELECT_MENU_SURFACE_CLASS, "max-h-[min(340px,min(52vh,28rem))]")}
        >
          {marketplaceFilterValues.map((value) => (
            <SelectItem
              key={value}
              value={value}
              className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium"
            >
              <FilterMenuCountRow
                primary={
                  <span className="font-semibold text-foreground">
                    {marketplaceLabel(value)}
                  </span>
                }
                count={
                  value === "all"
                    ? marketplaceFilterStats.total
                    : marketplaceFilterStats.perMarketplace[value] ?? 0
                }
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const paymentBlock = (
    <div className="min-w-0">
      <Label htmlFor="label-filter-payment" className={lbl}>
        Payment
      </Label>
      <Select
        value={paymentFilter}
        onValueChange={(v) => {
          if (v === "all" || v === "prepaid" || v === "cod" || v === "exchange" || v === "unknown") {
            onPaymentFilter(v);
          }
        }}
      >
        <SelectTrigger
          size="sm"
          id="label-filter-payment"
          title="Payment mode detected from each label"
          className={cn(ctl, selectTriggerExtras)}
        >
          <SelectValue placeholder={paymentFilterTriggerDisplay("all", paymentFilterStats)}>
            {(v) =>
              paymentFilterTriggerDisplay(
                typeof v === "string" ? v : "all",
                paymentFilterStats
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          {...FILTER_SELECT_POPUP_SIDE}
          className={cn(FILTER_SELECT_MENU_SURFACE_CLASS, "max-h-[min(340px,min(52vh,28rem))]")}
        >
          {paymentFilterValues.map((value) => (
            <SelectItem
              key={value}
              value={value}
              className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium"
            >
              <FilterMenuCountRow
                primary={
                  <span className="font-semibold text-foreground">
                    {paymentLabel(value)}
                  </span>
                }
                count={
                  value === "all"
                    ? paymentFilterStats.totalLabels
                    : paymentFilterStats.perPayment[value] ?? 0
                }
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
          {showUnmappedFilter ? (
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
                    primary={<span className="font-semibold">All not mapped</span>}
                    count={mappedSkuLabelStats.unmapped}
                  />
                </span>
              </span>
            </DropdownMenuItem>
          ) : null}
          {distinctUnmappedListingSkus.map((sku) => {
            const picked =
              mappedMasterFilter.mode === "unmapped_listing" &&
              mappedMasterFilter.listingSkus.includes(sku);
            return (
              <DropdownMenuCheckboxItem
                key={`unmapped-${sku}`}
                checked={picked}
                onCheckedChange={(c) => onMasterFilterToggleUnmappedSku(sku, Boolean(c))}
                className="mx-0.5 rounded-lg py-2.5 pl-2 font-mono text-[13px] font-medium text-amber-950 dark:text-amber-200"
              >
                <FilterMenuCountRow
                  primary={
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{sku}</span>
                      <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-200">
                        Not mapped
                      </span>
                    </span>
                  }
                  count={mappedSkuLabelStats.perUnmappedListingSku[sku] ?? 0}
                />
              </DropdownMenuCheckboxItem>
            );
          })}
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
          <SelectValue placeholder={qtyFilterTriggerDisplay(QTY_PARTNER_FILTER_ALL, qtyFilterStats)}>
            {(v) => qtyFilterTriggerDisplay(v, qtyFilterStats)}
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
              count={qtyFilterStats.totalLabels}
            />
          </SelectItem>
          {qtyFilterStats.quantitiesSortedDesc.map((q) => (
            <SelectItem key={q} value={String(q)} className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium tabular-nums">
              <FilterMenuCountRow
                primary={
                  <span className="font-semibold tracking-tight">{q.toLocaleString()}</span>
                }
                count={qtyFilterStats.perQty[q] ?? 0}
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rowsLen > 0 && qtyFilterStats.quantitiesSortedDesc.length === 0 ? (
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
          <SelectValue placeholder={carrierFilterTriggerDisplay(QTY_PARTNER_FILTER_ALL, carrierFilterStats)}>
            {(v) => carrierFilterTriggerDisplay(v, carrierFilterStats)}
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
              count={carrierFilterStats.totalLabels}
              title={`${carrierFilterStats.totalLabels.toLocaleString()} labels · ${carrierFilterStats.totalOrderQty.toLocaleString()} total qty`}
            />
          </SelectItem>
          {carrierFilterStats.partnersSortedDesc.map((p) => (
            <SelectItem key={p} value={p} className="mx-0.5 rounded-lg py-2.5 pr-11 font-medium">
              <FilterMenuCountRow
                primary={<span className="font-medium">{p}</span>}
                count={carrierFilterStats.perPartner[p] ?? 0}
                title={`${(carrierFilterStats.perPartner[p] ?? 0).toLocaleString()} labels · ${(carrierFilterStats.partnerOrderQtySum[p] ?? 0).toLocaleString()} total qty`}
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
    const qtyChipValues = qtyFilterStats.quantitiesSortedDesc.slice(0, qtyChipMax);
    const partnerChipValues = carrierFilterStats.partnersSortedDesc.slice(0, partnerChipMax);
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
      qtyFilterStats.quantitiesSortedDesc.length > qtyChipMax || qtyNotOnChip;
    const showPartnerSelect =
      carrierFilterStats.partnersSortedDesc.length > partnerChipMax || partnerNotOnChip;

    const chipScroller =
      "flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

    return (
      <div className="space-y-5">
        <p className="text-[12px] leading-snug text-muted-foreground">
          View only · source unchanged until download.
        </p>

        <div>
          <span className={lbl}>Marketplace</span>
          <div className={cn("mt-2", chipScroller)}>
            {marketplaceFilterValues.map((value) => (
              <MobileFilterChip
                key={value}
                active={marketplaceFilter === value}
                onClick={() => onMarketplaceFilter(value)}
              >
                {marketplaceFilterTriggerDisplay(value, marketplaceFilterStats)}
              </MobileFilterChip>
            ))}
          </div>
          <div className="mt-3">{marketplaceBlock}</div>
        </div>

        <div>
          <span className={lbl}>Match status</span>
          <div className={cn("mt-2", chipScroller)}>
            <MobileFilterChip active={mappedMasterFilter.mode === "all"} onClick={onMasterFilterAll}>
              All
            </MobileFilterChip>
            {showUnmappedFilter ? (
              <MobileFilterChip
                active={
                  mappedMasterFilter.mode === "unmapped" ||
                  mappedMasterFilter.mode === "unmapped_listing"
                }
                onClick={onMasterFilterUnmapped}
              >
                Not mapped
              </MobileFilterChip>
            ) : null}
          </div>
          <div className="mt-3">{masterBlock}</div>
        </div>

        <div>
          <span className={lbl}>Payment</span>
          <div className={cn("mt-2", chipScroller)}>
            {paymentFilterValues.map((value) => (
              <MobileFilterChip
                key={value}
                active={paymentFilter === value}
                onClick={() => onPaymentFilter(value)}
              >
                {paymentFilterTriggerDisplay(value, paymentFilterStats)}
              </MobileFilterChip>
            ))}
          </div>
          <div className="mt-3">{paymentBlock}</div>
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
              title={`${carrierFilterStats.totalLabels.toLocaleString()} labels · ${carrierFilterStats.totalOrderQty.toLocaleString()} total qty`}
            >
              <span className="tabular-nums">
                All ({carrierFilterStats.totalLabels.toLocaleString()})
              </span>
            </MobileFilterChip>
            {partnerChipValues.map((p) => (
              <MobileFilterChip
                key={p}
                active={partner === p}
                onClick={() => onPartner(p)}
                title={`${(carrierFilterStats.perPartner[p] ?? 0).toLocaleString()} labels · ${(carrierFilterStats.partnerOrderQtySum[p] ?? 0).toLocaleString()} total qty`}
              >
                <span className="max-w-[11rem] truncate text-left tabular-nums">
                  {p} ({(carrierFilterStats.perPartner[p] ?? 0).toLocaleString()})
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
          Search or filter the current batch. Nothing changes until you download.
        </p>
        {activeFilterCount > 0 ? (
          <div className="shrink-0 sm:pt-px">{clearBtn}</div>
        ) : null}
      </div>
      <div className="grid gap-x-5 gap-y-[1.125rem] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 lg:items-end lg:gap-x-7">
        <div className="sm:col-span-2 lg:col-span-1">
          <Label htmlFor="label-filter-listing-sku-desk" className={lbl}>
            Listing SKU
          </Label>
          <Input
            id="label-filter-listing-sku-desk"
            value={listingSkuSearch}
            onChange={(e) => onListingSkuSearch(e.target.value)}
            placeholder="SKU or order ID…"
            title="SKU, order ID, master, courier, qty"
            aria-describedby="label-filter-listing-hint-desk"
            className={cn(ctl, "h-10 py-2")}
          />
          <p id="label-filter-listing-hint-desk" className="sr-only">
            Listing SKU substring match.
          </p>
        </div>
        {marketplaceBlock}
        {masterBlock}
        {paymentBlock}
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
  sourceCount,
  sourceOrderByImportId,
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
  sourceCount: number;
  sourceOrderByImportId: ReadonlyMap<string, number>;
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
                    "virtual-row absolute left-0 top-0 w-full border-b border-border/55 transition-colors duration-150 ease-smooth dark:border-border/40",
                    stripe,
                    sel
                      ? "bg-primary/[0.11] shadow-[inset_3px_0_0_0_var(--primary)]"
                      : "hover:bg-muted/50 dark:hover:bg-muted/35"
                  )}
                  style={{
                    height: `${vi.size}px`,
                    transform: `translate3d(0, ${vi.start}px, 0)`,
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
                    <div
                      className="flex min-w-0 items-center justify-center overflow-hidden border-l border-border/80 px-3 font-mono text-xs tabular-nums text-muted-foreground"
                      title={`${marketplaceDisplay(r.marketplace)} · ${r.sourceFile || "PDF"}${r.matchStatus ? ` · ${r.matchStatus}` : ""}`}
                    >
                      {sourceCount > 1 ? `${(sourceOrderByImportId.get(r.importId) ?? 0) + 1}.${r.page}` : r.page}
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
                      {listingSkuDisplay(r)}
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
      Not mapped
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
      <div className="flex min-h-10 items-center gap-2 px-3">
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
            className="relative py-1"
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
                  className="virtual-row absolute left-0 right-0 top-0"
                  style={{
                    transform: `translate3d(0, ${vi.start}px, 0)`,
                  }}
                  role="listitem"
                >
                  <div
                    className={cn(
                      "mb-2 flex gap-3 rounded-2xl px-3 py-2.5 transition-[background-color,border-color] duration-150 ease-smooth",
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
                          {listingSkuDisplay(r)}
                        </p>
                        <span className="shrink-0 rounded-full bg-background/65 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-white/[0.08]">
                          {marketplaceDisplay(r.marketplace)} · p.{r.page}
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
  const [pdfSources, setPdfSources] = React.useState<ImportedPdfSource[]>([]);
  const [amazonInvoices, setAmazonInvoices] = React.useState<AmazonTaxInvoicePage[]>([]);
  const [includeAmazonInvoicesInDownload, setIncludeAmazonInvoicesInDownload] =
    React.useState(() => {
      if (typeof window === "undefined") return false;
      try {
        return window.localStorage.getItem(AMAZON_INCLUDE_INVOICE_DOWNLOAD_STORAGE) === "1";
      } catch {
        return false;
      }
    });
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
  const [marketplaceFilter, setMarketplaceFilter] =
    React.useState<MarketplaceKind | "all">("all");
  const [paymentFilter, setPaymentFilter] =
    React.useState<PaymentKind | "all">("all");
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
  const [cropperDocs, setCropperDocs] = React.useState<CropperDocument[]>([]);
  const [cropperBusy, setCropperBusy] = React.useState(false);
  const [cropExportBusy, setCropExportBusy] = React.useState(false);
  const [processingMode, setProcessingMode] =
    React.useState<"filter" | "crop" | "filter_crop">("filter");
  const [autoCropMode, setAutoCropMode] = React.useState<CropMode>("shipping");
  const [manualCropOpen, setManualCropOpen] = React.useState(false);

  const exportMarkFingerprint = React.useMemo(() => {
    if (rows.length === 0) return "";
    const tail = rows[rows.length - 1];
    return `${sourceName || "labels"}|${pdfSources.length}|${rows.length}|${tail?.id ?? ""}`;
  }, [pdfSources.length, rows, sourceName]);

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

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        AMAZON_INCLUDE_INVOICE_DOWNLOAD_STORAGE,
        includeAmazonInvoicesInDownload ? "1" : "0"
      );
    } catch {
      /* local preference only */
    }
  }, [includeAmazonInvoicesInDownload]);

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

  const pdfSourceByImportId = React.useMemo(() => {
    const out = new Map<string, ImportedPdfSource>();
    for (const src of pdfSources) out.set(src.id, src);
    return out;
  }, [pdfSources]);

  const sourceOrderByImportId = React.useMemo(() => {
    const out = new Map<string, number>();
    for (const src of pdfSources) out.set(src.id, src.order);
    return out;
  }, [pdfSources]);

  const amazonInvoiceByOrderId = React.useMemo(() => {
    const out = new Map<string, AmazonTaxInvoicePage>();
    for (const invoice of amazonInvoices) {
      const key = normalizeAmazonOrderId(invoice.orderId);
      if (key && !out.has(key)) out.set(key, invoice);
    }
    return out;
  }, [amazonInvoices]);

  const sourceLabelStats = React.useMemo(() => {
    const out = new Map<
      string,
      {
        total: number;
        meesho: number;
        flipkart: number;
        amazon: number;
        unknown: number;
      }
    >();
    for (const src of pdfSources) {
      out.set(src.id, { total: 0, meesho: 0, flipkart: 0, amazon: 0, unknown: 0 });
    }
    for (const row of rows) {
      const stat =
        out.get(row.importId) ??
        { total: 0, meesho: 0, flipkart: 0, amazon: 0, unknown: 0 };
      stat.total += 1;
      stat[row.marketplace] += 1;
      out.set(row.importId, stat);
    }
    return out;
  }, [pdfSources, rows]);

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
      marketplace: marketplaceFilter,
      payment: paymentFilter,
      listingSearch: listingSearchForFilter,
      qtyExact,
      partner: partner === "__all__" ? "" : partner,
    };
  }, [
    mappedMasterFilter,
    marketplaceFilter,
    paymentFilter,
    listingSearchForFilter,
    qtyFilter,
    partner,
  ]);

  const marketplaceStats = React.useMemo(() => {
    const stats = {
      meesho: 0,
      flipkart: 0,
      amazon: 0,
      unknown: 0,
      invalid: 0,
    };
    for (const r of enrichedRows) {
      stats[r.marketplace] += 1;
      if (!r.listing_sku.trim()) stats.invalid += 1;
    }
    return stats;
  }, [enrichedRows]);

  const amazonStats = React.useMemo(() => {
    const amazonRows = enrichedRows.filter((r) => r.marketplace === "amazon");
    return {
      total: amazonRows.length,
      matched: amazonRows.filter((r) => r.matchStatus === "Matched").length,
      unmatched: amazonRows.filter((r) => r.matchStatus !== "Matched").length,
      skuDetected: amazonRows.filter((r) => r.listing_sku.trim() && r.listing_sku !== "Unknown").length,
      quantityDetected: amazonRows.filter((r) => r.quantity != null).length,
      courierDetected: amazonRows.filter((r) => r.delivery_partner.trim() && r.delivery_partner !== "Unknown").length,
      paymentDetected: amazonRows.filter((r) => r.payment !== "unknown").length,
      invoices: amazonInvoices.length,
    };
  }, [amazonInvoices.length, enrichedRows]);

  const marketplaceFilterStats = React.useMemo(
    () => buildMarketplaceFilterStats(rowsForFacetCounts(enrichedRows, filters, "marketplace")),
    [enrichedRows, filters]
  );

  const marketplaceScopedRows = React.useMemo(() => {
    if (marketplaceFilter === "all") return enrichedRows;
    return enrichedRows.filter((r) => r.marketplace === marketplaceFilter);
  }, [enrichedRows, marketplaceFilter]);

  React.useEffect(() => {
    if (marketplaceFilter === "all") return;
    if ((marketplaceFilterStats.perMarketplace[marketplaceFilter] ?? 0) === 0) {
      setMarketplaceFilter("all");
    }
  }, [marketplaceFilter, marketplaceFilterStats.perMarketplace]);

  const mappedSkuLabelStats = React.useMemo(
    () => buildMappedSkuLabelStats(rowsForFacetCounts(enrichedRows, filters, "mappedMaster")),
    [enrichedRows, filters]
  );

  const mappedRows = React.useMemo(
    () => partitionByMasterMapping(marketplaceScopedRows).mapped,
    [marketplaceScopedRows]
  );

  React.useEffect(() => {
    if (mappedMasterFilter.mode === "unmapped" && mappedSkuLabelStats.unmapped === 0) {
      setMappedMasterFilter({ mode: "all" });
    }
    if (
      mappedMasterFilter.mode === "unmapped_listing" &&
      mappedMasterFilter.listingSkus.every((sku) => !mappedSkuLabelStats.perUnmappedListingSku[sku])
    ) {
      setMappedMasterFilter({ mode: "all" });
    }
  }, [mappedMasterFilter, mappedSkuLabelStats.perUnmappedListingSku, mappedSkuLabelStats.unmapped]);

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

  const distinctUnmappedListingSkus = React.useMemo(() => {
    const { perUnmappedListingSku } = mappedSkuLabelStats;
    return Object.keys(perUnmappedListingSku).sort((a, b) => {
      const ca = perUnmappedListingSku[a] ?? 0;
      const cb = perUnmappedListingSku[b] ?? 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }, [mappedSkuLabelStats]);

  const paymentFilterStats = React.useMemo(
    () => buildQtyCarrierFilterStats(rowsForFacetCounts(enrichedRows, filters, "payment")),
    [enrichedRows, filters]
  );

  const qtyFilterStats = React.useMemo(
    () => buildQtyCarrierFilterStats(rowsForFacetCounts(enrichedRows, filters, "quantity")),
    [enrichedRows, filters]
  );

  const carrierFilterStats = React.useMemo(
    () => buildQtyCarrierFilterStats(rowsForFacetCounts(enrichedRows, filters, "partner")),
    [enrichedRows, filters]
  );

  React.useEffect(() => {
    if (qtyFilter === "__all__") return;
    const n = Number.parseInt(qtyFilter, 10);
    if (!Number.isFinite(n) || qtyFilterStats.perQty[n] === undefined) {
      setQtyFilter("__all__");
    }
  }, [qtyFilterStats.perQty, qtyFilter]);

  React.useEffect(() => {
    if (partner === QTY_PARTNER_FILTER_ALL) return;
    if (carrierFilterStats.perPartner[partner] === undefined) {
      setPartner(QTY_PARTNER_FILTER_ALL);
    }
  }, [partner, carrierFilterStats.perPartner]);

  React.useEffect(() => {
    if (paymentFilter === "all") return;
    if ((paymentFilterStats.perPayment[paymentFilter] ?? 0) === 0) {
      setPaymentFilter("all");
    }
  }, [paymentFilter, paymentFilterStats.perPayment]);

  /** All PDF labels, enriched when mappings exist; filtered client-side (Zoho-style grid). */
  const filteredLabels = React.useMemo(() => {
    const base = applyMeeshoLabelFilters(enrichedRows, filters);
    if (sortKey === "page") {
      return [...base].sort((a, b) => {
        const ao = sourceOrderByImportId.get(a.importId) ?? 0;
        const bo = sourceOrderByImportId.get(b.importId) ?? 0;
        const c = ao === bo ? a.page - b.page : ao - bo;
        return sortDir === "asc" ? c : -c;
      });
    }
    return sortMeeshoLabels(base, sortKey, sortDir);
  }, [enrichedRows, filters, sortKey, sortDir, sourceOrderByImportId]);

  const labelFilterActiveCount = React.useMemo(() => {
    let c = 0;
    if (listingSkuSearch.trim()) c++;
    if (marketplaceFilter !== "all") c++;
    if (paymentFilter !== "all") c++;
    if (mappedMasterFilter.mode !== "all") c++;
    if (qtyFilter !== QTY_PARTNER_FILTER_ALL) c++;
    if (partner !== QTY_PARTNER_FILTER_ALL) c++;
    return c;
  }, [listingSkuSearch, marketplaceFilter, paymentFilter, mappedMasterFilter, qtyFilter, partner]);

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

  const onMasterFilterToggleUnmappedSku = React.useCallback(
    (sku: string, checked: boolean) => {
      setMappedMasterFilter((prev) => {
        if (checked) {
          if (prev.mode === "unmapped_listing") {
            if (prev.listingSkus.includes(sku)) return prev;
            return { mode: "unmapped_listing", listingSkus: [...prev.listingSkus, sku] };
          }
          return { mode: "unmapped_listing", listingSkus: [sku] };
        }
        if (prev.mode !== "unmapped_listing") return prev;
        const next = prev.listingSkus.filter((n) => n !== sku);
        if (next.length === 0) return { mode: "all" };
        return { mode: "unmapped_listing", listingSkus: next };
      });
    },
    []
  );

  const clearLabelFilters = React.useCallback(() => {
    setMappedMasterFilter({ mode: "all" });
    setMarketplaceFilter("all");
    setPaymentFilter("all");
    setListingSkuSearch("");
    setQtyFilter(QTY_PARTNER_FILTER_ALL);
    setPartner(QTY_PARTNER_FILTER_ALL);
  }, []);

  React.useEffect(() => {
    setMappedMasterFilter((prev) => {
      if (prev.mode === "masters") {
        const valid = prev.names.filter((n) => distinctMasterNames.includes(n));
        if (valid.length === prev.names.length) return prev;
        return valid.length === 0 ? { mode: "all" } : { mode: "masters", names: valid };
      }
      if (prev.mode === "unmapped_listing") {
        const valid = prev.listingSkus.filter((n) => distinctUnmappedListingSkus.includes(n));
        if (valid.length === prev.listingSkus.length) return prev;
        return valid.length === 0 ? { mode: "all" } : { mode: "unmapped_listing", listingSkus: valid };
      }
      return prev;
    });
  }, [distinctMasterNames, distinctUnmappedListingSkus]);

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
  const selectedHasAmazonRows = React.useMemo(
    () => containsAmazonRows(selectedLabelRows),
    [selectedLabelRows]
  );
  const filteredHasAmazonRows = React.useMemo(
    () => containsAmazonRows(filteredLabels),
    [filteredLabels]
  );
  const showAmazonInvoiceDownloadOption =
    (selectedHasAmazonRows || filteredHasAmazonRows) && amazonInvoices.length > 0;

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

  function rowsToPdfExportSteps(sourceRows: readonly EnrichedMeeshoLabelRow[]) {
    return [...sourceRows]
      .sort((a, b) => {
        const ao = sourceOrderByImportId.get(a.importId) ?? 0;
        const bo = sourceOrderByImportId.get(b.importId) ?? 0;
        if (ao !== bo) return ao - bo;
        return a.page - b.page;
      })
      .flatMap((r) => {
        const src = pdfSourceByImportId.get(r.importId);
        if (!src) return [];
        const steps = [{
          importKey: r.importId,
          sourcePdfBytes: src.pdfBytes,
          pageOneBased: r.page,
          overlayText: amazonShippingOverlayText(r),
        }];

        if (includeAmazonInvoicesInDownload && r.marketplace === "amazon") {
          const invoice = amazonInvoiceByOrderId.get(normalizeAmazonOrderId(r.orderId));
          const invoiceSource = invoice?.importId
            ? pdfSourceByImportId.get(invoice.importId)
            : undefined;
          if (invoice && invoiceSource) {
            steps.push({
              importKey: invoice.importId ?? invoiceSource.id,
              sourcePdfBytes: invoiceSource.pdfBytes,
              pageOneBased: invoice.rawPageIndex + 1,
              overlayText: undefined,
            });
          }
        }

        return steps;
      })
      .filter((x) => Boolean(x));
  }

  function removeUploadedPdfSource(importId: string) {
    const removed = pdfSources.find((src) => src.id === importId);
    const remainingSources = pdfSources
      .filter((src) => src.id !== importId)
      .map((src, order) => ({ ...src, order }));
    const remainingRows = rows.filter((row) => row.importId !== importId);
    const remainingInvoices = amazonInvoices.filter((invoice) => invoice.importId !== importId);
    const rematchedRows = pairAmazonShippingRows(remainingRows, remainingInvoices);
    const remainingIds = new Set(rematchedRows.map((row) => row.id));

    setPdfSources(remainingSources);
    setCropperDocs((prev) => prev.filter((doc) => doc.id !== importId));
    setAmazonInvoices(remainingInvoices);
    setRows(rematchedRows);
    setSelected((prev) => {
      const next: Record<string, true> = {};
      for (const id of Object.keys(prev)) {
        if (remainingIds.has(id)) next[id] = true;
      }
      return next;
    });
    setSourceName(
      remainingSources.length === 0
        ? ""
        : remainingSources.length === 1
          ? remainingSources[0].fileName.replace(/\.pdf$/i, "")
          : `${remainingSources.length} PDFs`
    );
    if (remainingSources.length === 0) {
      clearLabelFilters();
      setMobileFilterOpen(false);
    }
    notify.success("PDF removed", {
      description: removed?.fileName ?? "Uploaded file removed from this run.",
    });
  }

  async function ingestPdfFiles(files: File[]) {
    const pdfFiles = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      trackEvent("meesho_pdf_import_rejected", { reason: "unsupported_file_type" });
      notify.error("Unsupported file", {
        description: "Upload one or more PDF files.",
      });
      return;
    }
    if (pdfFiles.length !== files.length) {
      notify.info("Only PDFs were imported", {
        description: `${(files.length - pdfFiles.length).toLocaleString()} non-PDF file(s) skipped.`,
      });
    }

    trackEvent("meesho_pdf_import_started", {
      file_count: pdfFiles.length,
      size_bytes: pdfFiles.reduce((sum, file) => sum + file.size, 0),
      signed_in: Boolean(userId),
    });
    setParsing(true);
    setParseProgress([0, 0]);

    const nextRows: MeeshoLabelRecord[] = [];
    const nextSources: ImportedPdfSource[] = [];
    const nextAmazonInvoices: AmazonTaxInvoicePage[] = [];
    const failures: ImportFailure[] = [];
    let completedPages = 0;
    const existingSourceCount = pdfSources.length;

    for (let i = 0; i < pdfFiles.length; i += 1) {
      const file = pdfFiles[i];
      const importId =
        crypto.randomUUID?.() ?? `import-${Date.now().toString(36)}-${i}`;

      const res = await parseMeeshoLabelPdf({
        file,
        yieldPolicy: perf.parseYieldPolicy,
        onProgress: (done, total) =>
          setParseProgress([completedPages + done, completedPages + Math.max(done, total)]),
      });

      if (res.error || (res.rows.length === 0 && res.amazonInvoices.length === 0)) {
        const reason = classifyImportFailure(res.stats, res.error);
        failures.push({ name: file.name, reason, error: res.error });
        trackEvent("meesho_pdf_import_failed", {
          reason,
          page_count: res.stats.pageCount,
          text_page_count: res.stats.textPageCount,
          unreadable_page_count: res.stats.unreadablePageCount,
          unrecognized_text_page_count: res.stats.unrecognizedTextPageCount,
          size_bytes: file.size,
          source_file: file.name,
        });
        continue;
      }

      nextSources.push({
        id: importId,
        fileName: file.name,
        pdfBytes: res.pdfBytes,
        order: existingSourceCount + i,
      });
      nextRows.push(
        ...res.rows.map((r) => ({
          ...r,
          id: `${importId}-p${r.page}`,
          importId,
          sourceFile: file.name,
        }))
      );
      nextAmazonInvoices.push(
        ...res.amazonInvoices.map((invoice) => ({
          ...invoice,
          importId,
          sourceFile: file.name,
        }))
      );
      completedPages += res.rows.length;
    }

    setParsing(false);
    setParseProgress(null);

    if (nextRows.length === 0 && rows.length === 0) {
      const importOnlyFailures =
        nextAmazonInvoices.length > 0
          ? [
              ...failures,
              ...nextAmazonInvoices.map((invoice) => ({
                name: invoice.sourceFile || "Amazon invoice",
                reason: "invoice_only" as const,
              })),
            ]
          : failures;
      const copy =
        importOnlyFailures.length > 0
          ? importFailureCopy(importOnlyFailures)
          : { title: "Could not parse this PDF", description: "No labels found." };
      notify.error(copy.title, { description: copy.description });
      trackEvent("meesho_pdf_import_failed", {
        reason: nextAmazonInvoices.length > 0 ? "invoice_only" : "empty_pdf",
        invoice_count: nextAmazonInvoices.length,
        source_file_count: pdfFiles.length,
      });
      return;
    }

    const mergedInvoices = [...amazonInvoices, ...nextAmazonInvoices];
    const mergedRows = pairAmazonShippingRows([...rows, ...nextRows], mergedInvoices);
    const mergedSources = [...pdfSources, ...nextSources];

    setRows(mergedRows);
    setAmazonInvoices(mergedInvoices);
    setPdfSources(mergedSources);
    if (nextSources.length > 0) {
      setCropperBusy(true);
      void Promise.all(
        nextSources.map((src) =>
          analyzeCropperPdfBytes({
            id: src.id,
            fileName: src.fileName,
            bytes: src.pdfBytes,
          })
        )
      )
        .then((docs) => {
          setCropperDocs((prev) => [...prev, ...docs]);
        })
        .catch((err) => {
          notify.warning("Crop preview is limited for this PDF", {
            description: err instanceof Error ? err.message : "Filtering still works.",
          });
        })
        .finally(() => setCropperBusy(false));
    }
    setSourceName(
      mergedSources.length === 1
        ? mergedSources[0].fileName.replace(/\.pdf$/i, "")
        : `${mergedSources.length} PDFs`
    );

    const flipkart = mergedRows.filter((r) => r.marketplace === "flipkart").length;
    const meesho = mergedRows.filter((r) => r.marketplace === "meesho").length;
    const amazon = mergedRows.filter((r) => r.marketplace === "amazon").length;
    const amazonMatched = mergedRows.filter((r) => r.marketplace === "amazon" && r.matchStatus === "Matched").length;
    const invalid = mergedRows.filter((r) => !r.listing_sku.trim()).length;

    notify.success("Imported", {
      description: `${nextRows.length.toLocaleString()} labels added · ${mergedRows.length.toLocaleString()} total · ${meesho.toLocaleString()} Meesho · ${flipkart.toLocaleString()} Flipkart · ${amazon.toLocaleString()} Amazon${amazon ? ` (${amazonMatched.toLocaleString()} matched)` : ""}${invalid ? ` · ${invalid.toLocaleString()} need review` : ""}`,
    });
    trackEvent("meesho_pdf_import_succeeded", {
      file_count: nextSources.length,
      label_count: nextRows.length,
      total_label_count: mergedRows.length,
      flipkart_count: flipkart,
      meesho_count: meesho,
      amazon_count: amazon,
      amazon_invoice_count: mergedInvoices.length,
      amazon_matched_count: amazonMatched,
      invalid_count: invalid,
      size_bytes: pdfFiles.reduce((sum, file) => sum + file.size, 0),
      signed_in: Boolean(userId),
    });

    if (failures.length > 0) {
      notify.warning("Some PDFs were skipped", {
        description: failures.slice(0, 3).join(", "),
      });
    }

    if (userId && getSupabaseBrowser()) await refreshMapSnapshot();
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) void ingestPdfFiles(files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) void ingestPdfFiles(files);
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
    if (pdfSources.length === 0 || selectedTotal === 0) {
      trackEvent("meesho_export_selected_blocked", {
        reason: "no_selection",
        visible_count: filteredLabels.length,
      });
      notify.info("Select at least one row.");
      return;
    }
    const idSet = new Set(Object.keys(selected));
    const exportedEnriched = enrichedRows.filter((r) => idSet.has(r.id));
    if (processingMode === "filter_crop") {
      const entries = cropEntriesForRows(exportedEnriched);
      if (entries.length === 0) {
        notify.info("No cropped label pages are ready for this selection.");
        return;
      }
      try {
        const out = await cropEntriesToPdf(entries);
        triggerPdfDownload(out, buildSelectedExportFilename(exportedEnriched));
        mergeExportedMastersFromRows(exportedEnriched);
        notify.success("Exported cropped labels", {
          description: `${entries.length.toLocaleString()} cropped page(s)`,
        });
        trackEvent("meesho_export_selected_succeeded", {
          page_count: entries.length,
          selected_count: selectedTotal,
          visible_count: filteredLabels.length,
          crop_mode: autoCropMode,
        });
      } catch (e) {
        trackEvent("meesho_export_selected_failed", {
          reason: "crop_export_error",
          selected_count: selectedTotal,
        });
        notify.error("Couldn’t export cropped PDF yet", {
          description: describeExportFailure(e),
        });
      }
      return;
    }
    const steps = rowsToPdfExportSteps(exportedEnriched);

    if (steps.length === 0) {
      trackEvent("meesho_export_selected_failed", {
        reason: "selection_page_mismatch",
        selected_count: selectedTotal,
      });
      notify.error("Could not map selection to PDF pages.");
      return;
    }

    try {
      const out = await exportPdfPagesFromMultiSourceOrdered(steps);
      triggerPdfDownload(out, buildSelectedExportFilename(exportedEnriched));
      mergeExportedMastersFromRows(exportedEnriched);
      notify.success("Exported", {
        description: `${steps.length.toLocaleString()} page(s) · ✓ = already in an export`,
      });
      trackEvent("meesho_export_selected_succeeded", {
        page_count: steps.length,
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
    if (pdfSources.length === 0 || sourceRows.length === 0) {
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

        setBulkSkuZipState({ phase: "preparing", done: i + 1, total: bucketList.length });
        let pdfOut: Uint8Array | null = null;
        if (processingMode === "filter_crop") {
          const cropEntries = cropEntriesForRows(bucket.rows);
          if (cropEntries.length === 0) continue;
          pdfOut = await cropEntriesToPdf(cropEntries);
        } else {
          const steps = rowsToPdfExportSteps(bucket.rows);
          if (steps.length === 0) continue;
          pdfOut = await exportPdfPagesFromMultiSourceOrdered(steps);
        }
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

  const amazonInvoiceDownloadToggle = showAmazonInvoiceDownloadOption ? (
    <label
      className="inline-flex min-h-9 max-w-full cursor-pointer items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-[11px] font-semibold text-orange-900 shadow-sm ring-1 ring-orange-500/10 dark:text-orange-100 sm:text-xs"
      title="Amazon labels contain separate invoice pages."
    >
      <Checkbox
        checked={includeAmazonInvoicesInDownload}
        onCheckedChange={(checked) => setIncludeAmazonInvoicesInDownload(Boolean(checked))}
        aria-label="Include Amazon tax invoices with shipping labels"
        className="size-4"
      />
      <span className="min-w-0">
        <span className="whitespace-nowrap">Include Amazon Tax Invoice</span>
        <span className="hidden text-orange-800/75 dark:text-orange-100/75 md:inline">
          {" "}with Shipping Labels
        </span>
      </span>
    </label>
  ) : null;

  const ready = rows.length > 0 && pdfSources.length > 0 && !parsing;
  const mapBusy = parsing || bulkSkuZipState != null;

  function cropFileBase(docName: string, pageNumber: number) {
    return `${docName.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-")}-p${pageNumber}`;
  }

  function filteredPageKeySet(): Set<string> | null {
    if (processingMode !== "filter_crop") return null;
    return rowPageKeySet(filteredLabels);
  }

  function rowPageKeySet(sourceRows: readonly EnrichedMeeshoLabelRow[]): Set<string> {
    const keys = new Set<string>();
    for (const row of sourceRows) keys.add(`${row.importId}:${row.rawPageIndex}`);
    return keys;
  }

  function cropEntriesForPage(doc: CropperDocument, page: CropperPage, mode: CropMode): CropExportEntry[] {
    const base = cropFileBase(doc.fileName, page.pageNumber);
    const entryFor = (rect: CropExportEntry["rect"], fileName: string): CropExportEntry => ({
      doc,
      pageIndex: page.pageIndex,
      rect,
      fileName,
      overlayText: amazonShippingCropOverlayText(page),
    });

    if (mode === "shipping") {
      if (page.kind === "invoice") return [];
      return [entryFor(page.defaultShippingRect, `${base}-shipping.pdf`)];
    }
    if (mode === "invoice") {
      if (page.marketplace === "amazon" && page.kind === "shipping" && page.pairedInvoicePageIndex != null) {
        return [{
          doc,
          pageIndex: page.pairedInvoicePageIndex,
          rect: page.defaultFullRect,
          fileName: `${base}-invoice.pdf`,
        }];
      }
      if (page.marketplace === "amazon" && page.kind === "invoice" && page.pairedShippingPageIndex != null) {
        return [];
      }
      if (page.kind === "shipping") return [];
      return [entryFor(page.defaultInvoiceRect, `${base}-invoice.pdf`)];
    }
    if (mode === "full") {
      return [entryFor(page.defaultFullRect, `${base}-full.pdf`)];
    }
    if (page.marketplace === "amazon" && page.kind === "shipping" && page.pairedInvoicePageIndex != null) {
      return [
        entryFor(page.defaultFullRect, `${base}-shipping.pdf`),
        { doc, pageIndex: page.pairedInvoicePageIndex, rect: page.defaultFullRect, fileName: `${base}-invoice.pdf` },
      ];
    }
    if (page.marketplace === "amazon" && page.kind === "invoice" && page.pairedShippingPageIndex != null) {
      return [];
    }
    if (page.kind === "combined") {
      return [
        entryFor(page.defaultShippingRect, `${base}-shipping.pdf`),
        entryFor(page.defaultInvoiceRect, `${base}-invoice.pdf`),
      ];
    }
    return [entryFor(page.defaultFullRect, `${base}.pdf`)];
  }

  function buildAutoCropEntries(mode = autoCropMode, allowed = filteredPageKeySet()): CropExportEntry[] {
    const out: CropExportEntry[] = [];
    for (const doc of cropperDocs) {
      for (const page of doc.pages) {
        if (allowed && !allowed.has(`${doc.id}:${page.pageIndex}`)) continue;
        out.push(...cropEntriesForPage(doc, page, mode));
      }
    }
    return out;
  }

  function cropEntriesForRows(sourceRows: readonly EnrichedMeeshoLabelRow[]): CropExportEntry[] {
    return buildAutoCropEntries(autoCropMode, rowPageKeySet(sourceRows));
  }

  async function downloadAutoCropPdf() {
    const entries = buildAutoCropEntries();
    if (entries.length === 0) {
      notify.info("No crop pages available yet.");
      return;
    }
    setCropExportBusy(true);
    try {
      const pdf = await cropEntriesToPdf(entries);
      triggerPdfDownload(pdf, "tulmin-auto-cropped-labels.pdf");
      notify.success("Cropped PDF downloaded.");
    } catch (err) {
      notify.error("Could not crop PDF", {
        description: describeExportFailure(err),
      });
    } finally {
      setCropExportBusy(false);
    }
  }

  async function downloadAutoCropZip() {
    const entries = buildAutoCropEntries();
    if (entries.length === 0) {
      notify.info("No crop pages available yet.");
      return;
    }
    setCropExportBusy(true);
    try {
      const groups = entries.map((entry) => ({ fileName: entry.fileName, entries: [entry] }));
      const zip = await zipCroppedPdfs(groups);
      triggerZipDownload(zip, "tulmin-auto-cropped-labels.zip");
      notify.success("Cropped ZIP downloaded.");
    } catch (err) {
      notify.error("Could not create ZIP", {
        description: describeExportFailure(err),
      });
    } finally {
      setCropExportBusy(false);
    }
  }

  return (
    <WorkspaceModulePageStack>
      <WorkspaceSurfaceCard padding="p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <WorkflowStepPill step="1" label="Import" active={!ready || parsing} />
              <WorkflowStepPill step="2" label="Filter" active={ready && selectedTotal === 0} />
              <WorkflowStepPill step="3" label="Export" active={ready && selectedTotal > 0} />
            </div>
            {rows.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:min-w-[22rem]">
                <RunMetric label="Labels" value={rows.length.toLocaleString()} />
                <RunMetric label="Visible" value={filteredLabels.length.toLocaleString()} tone="good" />
                <RunMetric label="Selected" value={selectedTotal.toLocaleString()} tone={selectedTotal > 0 ? "amazon" : "default"} />
              </div>
            ) : null}
          </div>

          <div
            data-tour="import-pdf"
            className={cn(
              "relative grid gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/14 p-4 transition-[border-color,box-shadow,background-color] hover:border-primary/45 hover:bg-muted/20 dark:bg-muted/10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5",
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
              multiple
              className="hidden"
              id="meesho-pdf-upload"
              disabled={parsing}
              onChange={onFileInput}
            />
            {parsing ? (
              <>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                    <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
                      Reading PDFs
                    </h1>
                    <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                      Detecting SKU, qty, courier, and payment.
                    </p>
                  </div>
                </div>
                {parseProgress ? (
                  <div className="w-full min-w-[10rem] space-y-2 sm:w-56">
                    <p className="text-right text-xs tabular-nums text-muted-foreground">
                      {parseProgress[0]} / {parseProgress[1]}
                    </p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/30">
                      <div
                        className="h-full rounded-full bg-primary/80 transition-[width] duration-300 ease-out"
                        style={{
                          width: `${Math.min(100, Math.max(0, (parseProgress[1] ? (100 * parseProgress[0]) / parseProgress[1] : 0)))}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-inner">
                    <FileUp className="size-5 text-primary" strokeWidth={1.6} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-[18px] font-semibold tracking-tight text-foreground sm:text-xl">
                      Import labels
                    </h1>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                      <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-800 ring-1 ring-violet-500/20 dark:text-violet-100">
                        Meesho
                      </span>
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-800 ring-1 ring-blue-500/20 dark:text-blue-100">
                        Flipkart
                      </span>
                      <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-900 ring-1 ring-orange-500/20 dark:text-orange-100">
                        Amazon
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="min-h-11 w-full justify-center font-semibold shadow-sm hover:brightness-[1.02] active:brightness-[0.98] sm:w-auto sm:min-w-[9.5rem]"
                  disabled={parsing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose PDFs
                </Button>
              </>
            )}
          </div>
        </div>
      </WorkspaceSurfaceCard>

      {rows.length > 0 ? (
        <WorkspaceSurfaceCard padding="p-4 sm:p-5">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
                  Output
                </h2>
                <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                  Choose what to export from this upload.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-border/55 bg-background/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  {cropperDocs.reduce((sum, doc) => sum + doc.pageCount, 0).toLocaleString()} pages ready
                </span>
                {cropperBusy ? (
                  <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                    Detecting crop areas
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid gap-1.5 rounded-2xl border border-border/55 bg-background/45 p-1.5 sm:grid-cols-3">
              {[
                ["filter", "Filter only", "Use table filters, then export."],
                ["crop", "Crop labels", "Crop every uploaded page."],
                ["filter_crop", "Filter + crop", "Crop only matching labels."],
              ].map(([key, title, body]) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "group flex min-h-[4.25rem] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    processingMode === key
                      ? "border-primary/70 bg-primary/10 text-foreground"
                      : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                  )}
                  onClick={() => setProcessingMode(key as typeof processingMode)}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{title}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-foreground">{body}</span>
                  </span>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      processingMode === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 text-transparent group-hover:text-muted-foreground"
                    )}
                  >
                    <Check className="size-3" strokeWidth={2.4} aria-hidden />
                  </span>
                </button>
              ))}
            </div>

            {processingMode !== "filter" ? (
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 space-y-2">
                    <p className="text-[12px] font-semibold text-foreground">Crop target</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ["shipping", "Auto Detect Shipping Label"],
                        ["invoice", "Auto Detect Tax Invoice"],
                      ].map(([key, title]) => (
                        <button
                          key={key}
                          type="button"
                          className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold transition-colors",
                            autoCropMode === key
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border/65 bg-background/55 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                          )}
                          onClick={() => setAutoCropMode(key as CropMode)}
                        >
                          {autoCropMode === key ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                          {title}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="text-[11px] font-medium text-muted-foreground sm:min-w-[10rem]">
                      <span className="font-semibold text-foreground">
                        {processingMode === "filter_crop" ? "Filtered crop:" : "Crop all:"}
                      </span>{" "}
                        {processingMode === "filter_crop"
                          ? `${filteredLabels.length.toLocaleString()} labels`
                          : `${cropperDocs.reduce((sum, doc) => sum + doc.pageCount, 0).toLocaleString()} pages`}
                    </p>
                    {processingMode === "crop" ? (
                      <div className="grid grid-cols-2 gap-2 sm:w-[17rem]">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-xl text-[12px] font-semibold"
                          disabled={cropExportBusy || cropperDocs.length === 0}
                          onClick={() => void downloadAutoCropPdf()}
                        >
                          {cropExportBusy ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Download className="mr-1.5 size-3.5" aria-hidden />
                          )}
                          PDF
                        </Button>
                        <Button
                          type="button"
                          className="h-10 rounded-xl text-[12px] font-semibold"
                          disabled={cropExportBusy || cropperDocs.length === 0}
                          onClick={() => void downloadAutoCropZip()}
                        >
                          {cropExportBusy ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Archive className="mr-1.5 size-3.5" aria-hidden />
                          )}
                          ZIP
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Select rows below, then use Download.
                      </p>
                    )}
                  </div>
                </div>

                <details className="mt-2 rounded-xl border border-border/50 bg-background/35 px-3 py-2 text-[12px]">
                  <summary className="cursor-pointer list-none font-semibold text-muted-foreground">
                    Manual crop
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      Use manual crop only when auto-detection needs adjustment. Drag and resize the crop box page-wise, or apply the same crop to all pages.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl text-[12px] font-semibold"
                      disabled={cropperDocs.length === 0}
                      onClick={() => setManualCropOpen((v) => !v)}
                    >
                      Manual Crop
                    </Button>
                    {manualCropOpen ? (
                      <ShippingLabelCropper initialDocs={cropperDocs} embedded />
                    ) : null}
                  </div>
                </details>
              </div>
            ) : null}
          </div>
        </WorkspaceSurfaceCard>
      ) : null}

      {ready && processingMode !== "crop" ? (
        <WorkspaceSurfaceCard padding="p-4 sm:p-5 lg:p-6">
          {rows.length > 0 ? (
            <div className="mb-5 space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {filteredLabels.length.toLocaleString()} labels
                  </h2>
                  <p className="max-w-2xl text-[12px] font-medium leading-5 text-muted-foreground sm:text-[13px]">
                    Filter, select, download.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[28rem]">
                  <RunMetric label="Meesho" value={marketplaceStats.meesho.toLocaleString()} />
                  <RunMetric label="Flipkart" value={marketplaceStats.flipkart.toLocaleString()} />
                  <RunMetric label="Amazon" value={marketplaceStats.amazon.toLocaleString()} tone="amazon" />
                  <RunMetric
                    label="Needs review"
                    value={(marketplaceStats.invalid + amazonStats.unmatched).toLocaleString()}
                    tone={marketplaceStats.invalid + amazonStats.unmatched > 0 ? "warn" : "good"}
                  />
                </div>
              </div>

              {(amazonStats.total > 0 || marketplaceStats.invalid > 0) ? (
                <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/18 px-3 py-3 text-[12px] leading-snug sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {amazonStats.total > 0 ? (
                      <>
                        <span className="inline-flex rounded-full bg-orange-500/10 px-2.5 py-1 font-semibold text-orange-900 ring-1 ring-orange-500/20 dark:text-orange-100">
                          Amazon matched {amazonStats.matched.toLocaleString()} / {amazonStats.total.toLocaleString()}
                        </span>
                        <span className="inline-flex rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground ring-1 ring-border/60">
                          SKU {amazonStats.skuDetected.toLocaleString()} · Qty {amazonStats.quantityDetected.toLocaleString()} · Courier {amazonStats.courierDetected.toLocaleString()} · Payment {amazonStats.paymentDetected.toLocaleString()}
                        </span>
                      </>
                    ) : null}
                    {amazonStats.unmatched > 0 ? (
                      <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-900 ring-1 ring-amber-500/25 dark:text-amber-100">
                        Invoice required to fetch SKU
                      </span>
                    ) : null}
                    {marketplaceStats.invalid > 0 ? (
                      <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-900 ring-1 ring-amber-500/25 dark:text-amber-100">
                        {marketplaceStats.invalid.toLocaleString()} labels need review
                      </span>
                    ) : null}
                  </div>
                  {amazonStats.total > 0 ? (
                    <span className="text-muted-foreground">
                      Amazon labels may include separate tax invoice pages.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {pdfSources.length > 0 ? (
            <details className="group mb-4 rounded-xl border border-border/45 bg-muted/12 px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                <span>
                  Sources · {pdfSources.length.toLocaleString()} PDF{pdfSources.length === 1 ? "" : "s"}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground group-open:hidden">
                  Manage uploads
                </span>
                <span className="hidden text-[11px] font-medium text-muted-foreground group-open:inline">
                  Hide
                </span>
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {pdfSources.map((src) => {
                  const stat =
                    sourceLabelStats.get(src.id) ??
                    { total: 0, meesho: 0, flipkart: 0, amazon: 0, unknown: 0 };
                  const marketplaceParts = [
                    stat.meesho > 0 ? `Meesho ${stat.meesho}` : "",
                    stat.flipkart > 0 ? `Flipkart ${stat.flipkart}` : "",
                    stat.amazon > 0 ? `Amazon ${stat.amazon}` : "",
                    stat.unknown > 0 ? `Unknown ${stat.unknown}` : "",
                  ].filter(Boolean);
                  const label =
                    marketplaceParts.length > 0
                      ? marketplaceParts.join(" · ")
                      : `${stat.total.toLocaleString()} labels`;
                  return (
                    <span
                      key={src.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/65 bg-background/85 px-3 py-2 text-[12px] font-medium shadow-sm dark:bg-background/70"
                      title={src.fileName}
                    >
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">
                        {label}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {stat.total.toLocaleString()} labels
                      </span>
                      {pdfSources.length > 1 ? (
                        <span className="hidden shrink-0 text-muted-foreground/60 sm:inline">
                          PDF {(sourceOrderByImportId.get(src.id) ?? 0) + 1}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Remove ${src.fileName}`}
                        title="Remove this PDF from current run"
                        className="interaction-press -mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                        disabled={parsing || bulkSkuZipState != null}
                        onClick={() => removeUploadedPdfSource(src.id)}
                      >
                        <X className="size-3.5" strokeWidth={2.2} aria-hidden />
                      </button>
                    </span>
                  );
                })}
              </div>
            </details>
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
                      Filter
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
                        Filter labels
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
                      Narrow the batch, select rows, then export the selection.
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
                  labels in queue
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
                        placeholder="SKU or order ID…"
                        title="SKU, order ID, master, courier, qty"
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
                        marketplaceFilter={marketplaceFilter}
                        onMarketplaceFilter={setMarketplaceFilter}
                        paymentFilter={paymentFilter}
                        onPaymentFilter={setPaymentFilter}
                        onMasterFilterAll={onMasterFilterAll}
                        onMasterFilterUnmapped={onMasterFilterUnmapped}
                        onMasterFilterToggleMaster={onMasterFilterToggleMaster}
                        onMasterFilterToggleUnmappedSku={onMasterFilterToggleUnmappedSku}
                        qtyFilter={qtyFilter}
                        onQtyFilter={setQtyFilter}
                        partner={partner}
                        onPartner={setPartner}
                        distinctMasterNames={distinctMasterNames}
                        distinctUnmappedListingSkus={distinctUnmappedListingSkus}
                        paymentFilterStats={paymentFilterStats}
                        qtyFilterStats={qtyFilterStats}
                        carrierFilterStats={carrierFilterStats}
                        rowsLen={rows.length}
                        activeFilterCount={labelFilterActiveCount}
                        onClearFilters={clearLabelFilters}
                        mappedSkuLabelStats={mappedSkuLabelStats}
                        marketplaceFilterStats={marketplaceFilterStats}
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
                    marketplaceFilter={marketplaceFilter}
                    onMarketplaceFilter={setMarketplaceFilter}
                    paymentFilter={paymentFilter}
                    onPaymentFilter={setPaymentFilter}
                    onMasterFilterAll={onMasterFilterAll}
                    onMasterFilterUnmapped={onMasterFilterUnmapped}
                    onMasterFilterToggleMaster={onMasterFilterToggleMaster}
                    onMasterFilterToggleUnmappedSku={onMasterFilterToggleUnmappedSku}
                    qtyFilter={qtyFilter}
                    onQtyFilter={setQtyFilter}
                    partner={partner}
                    onPartner={setPartner}
                    distinctMasterNames={distinctMasterNames}
                    distinctUnmappedListingSkus={distinctUnmappedListingSkus}
                    paymentFilterStats={paymentFilterStats}
                    qtyFilterStats={qtyFilterStats}
                    carrierFilterStats={carrierFilterStats}
                    rowsLen={rows.length}
                    activeFilterCount={labelFilterActiveCount}
                    onClearFilters={clearLabelFilters}
                    mappedSkuLabelStats={mappedSkuLabelStats}
                    marketplaceFilterStats={marketplaceFilterStats}
                  />
                </div>
              </div>
            )}

            <div
              className={cn(
                "sticky top-0 z-30 -mx-1 mb-1 hidden flex-col gap-2 border-b border-label-grid-border/80 bg-background/92 px-1 py-2.5 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between dark:bg-background/88",
                "bg-label-sheet/90 dark:bg-label-sheet/90"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {selectedTotal.toLocaleString()} selected ·{" "}
                  {filteredLabels.length.toLocaleString()} visible
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
                {amazonInvoiceDownloadToggle}
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
                  sourceCount={pdfSources.length}
                  sourceOrderByImportId={sourceOrderByImportId}
                />
              </div>
            )}

            {viewMode === "mobile" && selectedTotal > 0 ? (
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/94 px-4 pt-3 shadow-[0_-10px_34px_-26px_rgba(0,0,0,0.55)] backdrop-blur-sm supports-[backdrop-filter]:bg-background/86 dark:shadow-[0_-12px_40px_-30px_rgb(0_0_0/0.75)] sm:hidden">
                {amazonInvoiceDownloadToggle ? (
                  <div className="mx-auto mb-2 flex max-w-lg justify-end">
                    {amazonInvoiceDownloadToggle}
                  </div>
                ) : null}
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
