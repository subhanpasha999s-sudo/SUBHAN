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
  Lock,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import { PricingCards } from "@/components/billing/pricing-cards";
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
  type MultiSourcePdfExportProgress,
} from "@/lib/meesho-label-export/export-selected-pages";
import { readSkuMappingLocalDraft } from "@/lib/sku-mapping-module/sku-mapping-local-draft";
import { useAuth } from "@/lib/supabase/auth-context";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { fetchSkuMapSnapshot } from "@/lib/supabase/sku-map-remote";
import { readSkuMapSnapshotCache } from "@/lib/supabase/sku-map-snapshot-cache";
import { trackEvent } from "@/lib/analytics/posthog-client";
import { TULMIN_PLAN_BY_ID, nextPlanRecommendation, type BillingCycle, type TulminPlanId } from "@/lib/billing/plans";
import { useSubscriptionEntitlement } from "@/lib/billing/use-subscription";
import {
  analyzeCropperPdfBytes,
  cropEntriesToPdf,
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
const CROP_ZIP_MAX_LABELS = 700;
const AUTO_CROP_PREP_MAX_IMPORT_FILES = 80;
const AUTO_CROP_PREP_MAX_LABELS = 700;
const CROP_EXPORT_BATCH_SIZE = 140;

type SkuExportBucket = { masterSku: string | null; rows: EnrichedMeeshoLabelRow[] };

function buildSkuExportBuckets(sourceRows: readonly EnrichedMeeshoLabelRow[]): SkuExportBucket[] {
  const buckets = new Map<string, SkuExportBucket>();
  for (const r of sourceRows) {
    const key = rowMasterExportKey(r);
    const cur = buckets.get(key);
    if (cur) {
      cur.rows.push(r);
    } else {
      buckets.set(key, { masterSku: r.master_sku?.trim() || null, rows: [r] });
    }
  }
  return [...buckets.values()].filter((b) => b.rows.length > 0);
}

async function yieldToUiFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

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

type PdfExportState =
  | (MultiSourcePdfExportProgress & { label: string })
  | { phase: "copying" | "saving" | "loading"; done: number; total: number; label: string }
  | { phase: "starting"; done: number; total: number; label: string };

type ImportedPdfSource = {
  id: string;
  fileName: string;
  pdfBytes: Uint8Array;
  order: number;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { email?: string; name?: string };
  notes?: Record<string, string>;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void | Promise<void>;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;

function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

type PdfExportStep = Parameters<typeof exportPdfPagesFromMultiSourceOrdered>[0][number];

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

/** Cleaner app menu shell (muted border + depth). */
const FILTER_SELECT_MENU_SURFACE_CLASS =
  "rounded-xl border-border/65 bg-popover px-1.5 py-1.5 text-[13px] shadow-lg shadow-slate-200/65 ring-1 ring-border/30 dark:bg-popover dark:shadow-black/40 dark:ring-white/[0.06]";

/** Quiet filter strip — one surface, no nested card chrome. */
const PREMIUM_FILTER_TOOLBAR_CLASS =
  "rounded-2xl border border-border/50 bg-background/50 p-4 shadow-sm ring-1 ring-white/[0.03] dark:bg-muted/[0.045] dark:ring-white/[0.04]";

const PREMIUM_FILTER_INNER_CLASS =
  "contents";

const PREMIUM_FIELD_LABEL_CLASS =
  "mb-1.5 block text-[12px] font-semibold leading-none tracking-tight text-foreground/55 dark:text-muted-foreground";

/** Sentence case — easier to scan than all-caps; matches premium filter panels. */
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
        Payment Type
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
        SKU
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
        Courier Partner
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
          title="Courier partner · shown number = labels. Hover a chip or menu row for total qty."
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
              primary={<span className="font-semibold text-foreground">All courier partners</span>}
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
          <span className={lbl}>Payment Type</span>
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
          <span className={lbl}>Courier Partner</span>
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
          Choose Marketplace, SKU, Quantity, Payment Type, and Courier Partner.
        </p>
        {activeFilterCount > 0 ? (
          <div className="shrink-0 sm:pt-px">{clearBtn}</div>
        ) : null}
      </div>
      <div className="grid gap-x-5 gap-y-[1.125rem] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 lg:items-end lg:gap-x-7">
        <div className="sm:col-span-2 lg:col-span-1">
          <Label htmlFor="label-filter-listing-sku-desk" className={lbl}>
            SKU
          </Label>
          <Input
            id="label-filter-listing-sku-desk"
            value={listingSkuSearch}
            onChange={(e) => onListingSkuSearch(e.target.value)}
            placeholder="SKU or order ID..."
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
            <span className="truncate">SKU</span>
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
          {rows.length.toLocaleString()} label{rows.length === 1 ? "" : "s"} loaded
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
  const {
    entitlement,
    loading: entitlementLoading,
    refresh: refreshEntitlement,
    reserveLabels,
    upgradeOpen,
    setUpgradeOpen,
    upgradeReason,
    promptUpgrade,
  } = useSubscriptionEntitlement(userId);

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
  const [pdfExportState, setPdfExportState] = React.useState<PdfExportState | null>(null);
  const [parseProgress, setParseProgress] = React.useState<[number, number] | null>(
    null
  );
  const [loginRequiredOpen, setLoginRequiredOpen] = React.useState(false);
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const pendingLoginFilesRef = React.useRef<File[] | null>(null);

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
  const [cropMarketplace, setCropMarketplace] =
    React.useState<MarketplaceKind | "all">("all");
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

  React.useEffect(() => {
    if (!userId || !pendingLoginFilesRef.current) return;
    const pending = pendingLoginFilesRef.current;
    pendingLoginFilesRef.current = null;
    setLoginRequiredOpen(false);
    void ingestPdfFiles(pending);
  }, [userId]);

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

  const cropMarketplaceStats = React.useMemo(
    () => buildMarketplaceFilterStats(enrichedRows),
    [enrichedRows]
  );

  const marketplaceScopedRows = React.useMemo(() => {
    if (marketplaceFilter === "all") return enrichedRows;
    return enrichedRows.filter((r) => r.marketplace === marketplaceFilter);
  }, [enrichedRows, marketplaceFilter]);

  const cropScopedRows = React.useMemo(() => {
    if (cropMarketplace === "all") return enrichedRows;
    return enrichedRows.filter((r) => r.marketplace === cropMarketplace);
  }, [cropMarketplace, enrichedRows]);

  React.useEffect(() => {
    if (marketplaceFilter === "all") return;
    if ((marketplaceFilterStats.perMarketplace[marketplaceFilter] ?? 0) === 0) {
      setMarketplaceFilter("all");
    }
  }, [marketplaceFilter, marketplaceFilterStats.perMarketplace]);

  React.useEffect(() => {
    if (cropMarketplace === "all") return;
    if ((cropMarketplaceStats.perMarketplace[cropMarketplace] ?? 0) === 0) {
      setCropMarketplace("all");
    }
  }, [cropMarketplace, cropMarketplaceStats.perMarketplace]);

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
  const visibleMappedCount = React.useMemo(
    () => partitionByMasterMapping(filteredLabels).mapped.length,
    [filteredLabels]
  );
  const visibleNeedReviewCount = Math.max(0, filteredLabels.length - visibleMappedCount);

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
  const canUsePremiumExports =
    entitlement.plan === "pro" || entitlement.plan === "business";
  const plan = TULMIN_PLAN_BY_ID[entitlement.plan];
  const recommendedPlan = nextPlanRecommendation(entitlement.plan);
  const usagePct =
    entitlement.labelsLimit != null && entitlement.labelsLimit > 0
      ? Math.min(100, Math.round((100 * entitlement.labelsUsed) / entitlement.labelsLimit))
      : 100;
  const usageCloseToLimit = entitlement.labelsLimit != null && usagePct >= 90 && usagePct < 100;
  const usageLimitExhausted =
    entitlement.labelsLimit != null && (entitlement.labelsRemaining ?? 0) <= 0;

  const filteredSkuExportBuckets = React.useMemo(
    () => buildSkuExportBuckets(filteredLabels),
    [filteredLabels]
  );

  /** Download actions stay visible after import; selection just changes the scope labels. */
  const showDownloadMenu = filteredLabels.length > 0;

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

  function rowsToPdfExportSteps(
    sourceRows: readonly EnrichedMeeshoLabelRow[],
    opts: { includeAmazonInvoices?: boolean; amazonMode?: CropMode } = {}
  ): PdfExportStep[] {
    const includeAmazonInvoices = opts.includeAmazonInvoices ?? includeAmazonInvoicesInDownload;
    const amazonMode = opts.amazonMode;
    return [...sourceRows]
      .sort((a, b) => {
        const ao = sourceOrderByImportId.get(a.importId) ?? 0;
        const bo = sourceOrderByImportId.get(b.importId) ?? 0;
        if (ao !== bo) return ao - bo;
        return a.page - b.page;
      })
      .flatMap((r) => {
        if (r.marketplace === "amazon" && amazonMode === "invoice") {
          const invoice = amazonInvoiceByOrderId.get(normalizeAmazonOrderId(r.orderId));
          const invoiceSource = invoice?.importId
            ? pdfSourceByImportId.get(invoice.importId)
            : undefined;
          if (!invoice || !invoiceSource) return [];
          return [{
            importKey: invoice.importId ?? invoiceSource.id,
            sourcePdfBytes: invoiceSource.pdfBytes,
            pageOneBased: invoice.rawPageIndex + 1,
            overlayText: undefined,
          }];
        }

        const src = pdfSourceByImportId.get(r.importId);
        if (!src) return [];
        const steps: PdfExportStep[] = [{
          importKey: r.importId,
          sourcePdfBytes: src.pdfBytes,
          pageOneBased: r.page,
          overlayText: amazonShippingOverlayText(r),
        }];

        const shouldIncludeAmazonInvoice =
          r.marketplace === "amazon" &&
          (amazonMode === "both" || amazonMode === "full" || (!amazonMode && includeAmazonInvoices));
        if (shouldIncludeAmazonInvoice) {
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
    if (!authReady) {
      notify.info("Checking your workspace access...");
      return;
    }
    if (!userId) {
      pendingLoginFilesRef.current = files;
      trackEvent("billing_signin_required", { intent: "import_labels" });
      setLoginRequiredOpen(true);
      return;
    }

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
      if (i % 3 === 2) await yieldToUiFrame();
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

    let usableNextRows = nextRows;
    if (nextRows.length > 0) {
      const reservation = await reserveLabels(nextRows.length, "filter", { allowPartial: true });
      if (!reservation.ok) {
        setParsing(false);
        setParseProgress(null);
        if (reservation.reason === "signin_required") {
          pendingLoginFilesRef.current = files;
          setLoginRequiredOpen(true);
        } else if (reservation.reason === "server_unavailable") {
          notify.error("Usage check unavailable", {
            description: "Tulmin could not verify this run right now. Please try again in a moment.",
          });
        } else {
          notify.info("Upgrade to continue", {
            description: reservation.message,
          });
        }
        trackEvent("billing_usage_blocked", {
          reason: reservation.reason,
          label_count: nextRows.length,
        });
        return;
      }
      if (reservation.trackingUnavailable) {
        notify.info("Processing allowed", {
          description:
            reservation.message ||
            "Usage tracking is still being prepared. Tulmin will continue this run normally.",
          duration: 7000,
        });
      }
      if (reservation.partial) {
        const accepted = Math.max(0, reservation.acceptedLabelCount);
        usableNextRows = nextRows.slice(0, accepted);
        notify.info("Plan limit reached", {
          description: `${accepted.toLocaleString()} labels processed. ${reservation.rejectedLabelCount.toLocaleString()} labels paused. Add credit or upgrade to continue.`,
          duration: 8000,
        });
        trackEvent("billing_usage_partial_import", {
          accepted_label_count: reservation.acceptedLabelCount,
          rejected_label_count: reservation.rejectedLabelCount,
          plan: entitlement.plan,
        });
      }
    }

    const mergedInvoices = [...amazonInvoices, ...nextAmazonInvoices];
    const mergedRows = pairAmazonShippingRows([...rows, ...usableNextRows], mergedInvoices);
    const mergedSources = [...pdfSources, ...nextSources];

    setRows(mergedRows);
    setAmazonInvoices(mergedInvoices);
    setPdfSources(mergedSources);
    const shouldPrepareCropNow =
      nextSources.length > 0 &&
      nextSources.length <= AUTO_CROP_PREP_MAX_IMPORT_FILES &&
      usableNextRows.length <= AUTO_CROP_PREP_MAX_LABELS;
    if (shouldPrepareCropNow) {
      setCropperBusy(true);
      void (async () => {
        const docs: CropperDocument[] = [];
        for (let i = 0; i < nextSources.length; i += 1) {
          const src = nextSources[i];
          docs.push(await analyzeCropperPdfBytes({
            id: src.id,
            fileName: src.fileName,
            bytes: src.pdfBytes,
          }));
          if (i % 2 === 1) await yieldToUiFrame();
        }
        return docs;
      })()
        .then((docs) => {
          setCropperDocs((prev) => [...prev, ...docs]);
        })
        .catch((err) => {
          notify.warning("Crop preview is limited for this PDF", {
            description: err instanceof Error ? err.message : "Filtering still works.",
          });
        })
        .finally(() => setCropperBusy(false));
    } else if (nextSources.length > 0) {
      setCropperBusy(false);
      notify.info("Large workspace mode", {
        description:
          "Filters are ready now. For fastest crop exports, filter to a smaller batch first.",
        duration: 7000,
      });
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
      description: `${usableNextRows.length.toLocaleString()} labels added · ${mergedRows.length.toLocaleString()} total · ${meesho.toLocaleString()} Meesho · ${flipkart.toLocaleString()} Flipkart · ${amazon.toLocaleString()} Amazon${amazon ? ` (${amazonMatched.toLocaleString()} matched)` : ""}${invalid ? ` · ${invalid.toLocaleString()} need review` : ""}`,
    });
    trackEvent("meesho_pdf_import_succeeded", {
      file_count: nextSources.length,
      label_count: usableNextRows.length,
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

  async function startBillingCheckout(
    input:
      | { type: "plan"; plan: TulminPlanId; cycle: BillingCycle }
      | { type: "topup"; labelCredits: number }
  ) {
    if (!userId) {
      openOptionalSignIn();
      return;
    }
    const sb = getSupabaseBrowser();
    const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) {
      openOptionalSignIn();
      return;
    }

    setCheckoutBusy(true);
    try {
      const checkout = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...input,
          browser: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            platform: navigator.platform,
            screen: `${window.screen.width}x${window.screen.height}x${window.devicePixelRatio}`,
          },
        }),
      });
      const order = (await checkout.json()) as {
        ok?: boolean;
        keyId?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        description?: string;
        error?: string;
      };
      if (!checkout.ok || !order.ok || !order.keyId || !order.orderId || !order.amount) {
        throw new Error(order.error || "Could not start checkout.");
      }
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) throw new Error("Could not load Razorpay checkout.");

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency ?? "INR",
        name: "Tulmin AI",
        description: order.description ?? "Tulmin AI billing",
        order_id: order.orderId,
        prefill: {
          email: user?.email ?? "",
          name: user?.user_metadata?.full_name ? String(user.user_metadata.full_name) : "",
        },
        handler: async (response) => {
          const verified = await fetch("/api/billing/verify", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });
          const json = await verified.json().catch(() => ({}));
          if (!verified.ok) throw new Error(json.error || "Payment verification failed.");
          await refreshEntitlement();
          setUpgradeOpen(false);
          notify.success(input.type === "topup" ? "Label credits added" : "Plan upgraded", {
            description: "Your workspace is ready to continue.",
          });
        },
        modal: {
          ondismiss: () => setCheckoutBusy(false),
        },
      });
      razorpay.open();
    } catch (err) {
      notify.error("Checkout could not start", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function downloadRowsPdf(
    sourceRows: readonly EnrichedMeeshoLabelRow[],
    scope: "selected" | "visible"
  ) {
    if (pdfSources.length === 0 || sourceRows.length === 0) {
      trackEvent("meesho_export_selected_blocked", {
        reason: scope === "selected" ? "no_selection" : "no_visible_labels",
        visible_count: filteredLabels.length,
      });
      notify.info(scope === "selected" ? "Select at least one row." : "Nothing matches filters.");
      return;
    }
    const exportedEnriched = [...sourceRows];
    if (processingMode === "filter_crop") {
      setCropExportBusy(true);
      setPdfExportState({ phase: "loading", done: 0, total: exportedEnriched.length, label: "Preparing cropped PDF" });
      try {
        const out = await cropOutputPdfForRows(
          exportedEnriched,
          autoCropMode,
          includeAmazonInvoicesInDownload ? "both" : "shipping",
          undefined,
          (progress) =>
            setPdfExportState({
              ...progress,
              label:
                progress.phase === "saving"
                  ? "Saving cropped PDF"
                  : progress.phase === "loading"
                    ? "Preparing cropped PDF"
                    : "Cropping selected labels",
            })
        );
        setPdfExportState({
          phase: "starting",
          done: out.pageCount,
          total: out.pageCount,
          label: "Starting download",
        });
        triggerPdfDownload(out.bytes, buildSelectedExportFilename(exportedEnriched));
        mergeExportedMastersFromRows(exportedEnriched);
        notify.success("Exported cropped labels", {
          description: `${out.pageCount.toLocaleString()} page(s)`,
        });
        trackEvent("meesho_export_selected_succeeded", {
          page_count: out.pageCount,
          selected_count: scope === "selected" ? sourceRows.length : 0,
          visible_count: filteredLabels.length,
          crop_mode: autoCropMode,
          export_scope: scope,
        });
      } catch (e) {
        trackEvent("meesho_export_selected_failed", {
          reason: "crop_export_error",
          selected_count: scope === "selected" ? sourceRows.length : 0,
          export_scope: scope,
        });
        notify.error("Couldn’t export cropped PDF yet", {
          description: describeExportFailure(e),
        });
      } finally {
        await yieldToUiFrame();
        setCropExportBusy(false);
        setPdfExportState(null);
      }
      return;
    }
    const steps = rowsToPdfExportSteps(exportedEnriched);

    if (steps.length === 0) {
      trackEvent("meesho_export_selected_failed", {
        reason: "selection_page_mismatch",
        selected_count: scope === "selected" ? sourceRows.length : 0,
        export_scope: scope,
      });
      notify.error("Could not map selection to PDF pages.");
      return;
    }

    try {
      setPdfExportState({ phase: "loading", done: 0, total: steps.length, label: "Preparing PDF" });
      const out = await exportPdfPagesFromMultiSourceOrdered(steps, {
        onProgress: (progress) =>
          setPdfExportState({
            ...progress,
            label:
              progress.phase === "saving"
                ? "Saving PDF"
                : steps.length >= 1000
                  ? "Building large PDF"
                  : "Preparing PDF",
          }),
      });
      setPdfExportState({ phase: "starting", done: steps.length, total: steps.length, label: "Starting download" });
      triggerPdfDownload(out, buildSelectedExportFilename(exportedEnriched));
      mergeExportedMastersFromRows(exportedEnriched);
      notify.success("Exported", {
        description: `${steps.length.toLocaleString()} page(s) · ✓ = already in an export`,
      });
      trackEvent("meesho_export_selected_succeeded", {
        page_count: steps.length,
        selected_count: scope === "selected" ? sourceRows.length : 0,
        visible_count: filteredLabels.length,
        export_scope: scope,
      });
    } catch (e) {
      trackEvent("meesho_export_selected_failed", {
        reason: "export_error",
        selected_count: scope === "selected" ? sourceRows.length : 0,
        export_scope: scope,
      });
      notify.error("Couldn’t export that PDF yet", {
        description: describeExportFailure(e),
      });
    } finally {
      setPdfExportState(null);
    }
  }

  async function downloadFilteredPdf() {
    await downloadRowsPdf(selectedLabelRows, "selected");
  }

  async function downloadVisiblePdf() {
    await downloadRowsPdf(filteredLabels, "visible");
  }

  async function downloadSkuFilesZipFromRows(
    sourceRows: readonly EnrichedMeeshoLabelRow[],
    zipFilename: string,
    scope: "filtered" | "selected"
  ) {
    if (!canUsePremiumExports) {
      promptUpgrade("ZIP by SKU is available on Pro. Upgrade when you want one clean PDF per SKU.");
      return;
    }
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

    const bucketList = buildSkuExportBuckets(sourceRows);
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
      const optimizedLargeZip = sourceRows.length >= 500 || bucketList.length >= 100;

      for (let i = 0; i < bucketList.length; i += 1) {
        const bucket = bucketList[i];

        setBulkSkuZipState({ phase: "preparing", done: i + 1, total: bucketList.length });
        let pdfOut: Uint8Array | null = null;
        if (processingMode === "filter_crop") {
          pdfOut = (await cropOutputPdfForRows(
            bucket.rows,
            autoCropMode,
            includeAmazonInvoicesInDownload ? "both" : "shipping"
          )).bytes;
        } else {
          const steps = rowsToPdfExportSteps(bucket.rows);
          if (steps.length === 0) continue;
          pdfOut = await exportPdfPagesFromMultiSourceOrdered(steps, {
            yieldEvery: optimizedLargeZip ? 20 : 75,
          });
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
        optimizedLargeZip
          ? { type: "uint8array", compression: "STORE" }
          : { type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 3 } },
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
    if (!bulkSkuZipState) {
      return "Download SKUs as ZIP (filtered)";
    }
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

  const pdfExportModal = React.useMemo(() => {
    if (!pdfExportState) return { title: "", body: "", pct: 0, count: "", helper: "", phase: "loading" as const };
    const pct =
      pdfExportState.total > 0
        ? Math.min(100, Math.round((100 * pdfExportState.done) / pdfExportState.total))
        : pdfExportState.phase === "starting"
          ? 100
          : 0;
    const count =
      pdfExportState.total > 0
        ? `${pdfExportState.done.toLocaleString()} of ${pdfExportState.total.toLocaleString()} labels`
        : "Preparing labels";
    if (pdfExportState.phase === "saving") {
      return {
        title: "Finalizing your PDF",
        body: "Compressing pages and keeping barcode quality intact.",
        pct,
        count,
        helper: "Almost done. Your download will start automatically.",
        phase: pdfExportState.phase,
      };
    }
    if (pdfExportState.phase === "starting") {
      return {
        title: "Download ready",
        body: "Opening the browser download prompt now.",
        pct: 100,
        count,
        helper: "You can keep this tab open while the file starts.",
        phase: pdfExportState.phase,
      };
    }
    if (pdfExportState.phase === "copying") {
      return {
        title: pdfExportState.label,
        body: "Building the exact selected label set.",
        pct,
        count,
        helper: "Tulmin is working through the batch without freezing the page.",
        phase: pdfExportState.phase,
      };
    }
    return {
      title: pdfExportState.label,
      body: "Reading the selected pages and preparing the export.",
      pct,
      count,
      helper: "Large batches stay responsive while Tulmin prepares the file.",
      phase: pdfExportState.phase,
    };
  }, [pdfExportState]);

  const hasMappedSkuLabels =
    Object.keys(mappedSkuLabelStats.perName).length > 0;

  const amazonInvoiceDownloadToggle = showAmazonInvoiceDownloadOption ? (
    <label
      className="inline-flex min-h-9 max-w-full cursor-pointer items-center gap-2 rounded-xl border border-border/55 bg-background/55 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground shadow-sm transition-colors hover:border-orange-500/30 hover:text-foreground dark:bg-muted/[0.06] sm:text-xs"
      title="Amazon labels contain separate invoice pages."
    >
      <Checkbox
        checked={includeAmazonInvoicesInDownload}
        onCheckedChange={(checked) => setIncludeAmazonInvoicesInDownload(Boolean(checked))}
        aria-label="Include Amazon tax invoices with shipping labels"
        className="size-4"
      />
      <span className="min-w-0">
        <span className="whitespace-nowrap text-foreground">Include Amazon invoice</span>
        <span className="hidden text-muted-foreground md:inline">
          {" "}with labels
        </span>
      </span>
    </label>
  ) : null;

  const ready = rows.length > 0 && pdfSources.length > 0 && !parsing;
  const mapBusy = parsing || bulkSkuZipState != null || pdfExportState != null;
  const importProgress = parseProgress
    ? Math.min(
        100,
        Math.max(
          parseProgress[0] > 0 ? 2 : 0,
          parseProgress[1] ? (100 * parseProgress[0]) / parseProgress[1] : 0
        )
      )
    : 0;

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
    if (page.marketplace === "amazon") return [];
    const base = cropFileBase(doc.fileName, page.pageNumber);
    const entryFor = (rect: CropExportEntry["rect"], fileName: string): CropExportEntry => ({
      doc,
      pageIndex: page.pageIndex,
      rect,
      fileName,
    });

    if (mode === "shipping") {
      if (page.kind === "invoice") return [];
      return [entryFor(page.defaultShippingRect, `${base}-shipping.pdf`)];
    }
    if (mode === "invoice") {
      if (page.kind === "shipping") return [];
      return [entryFor(page.defaultInvoiceRect, `${base}-invoice.pdf`)];
    }
    if (mode === "full") {
      return [entryFor(page.defaultFullRect, `${base}-full.pdf`)];
    }
    if (page.kind === "combined") {
      return [
        entryFor(page.defaultShippingRect, `${base}-shipping.pdf`),
        entryFor(page.defaultInvoiceRect, `${base}-invoice.pdf`),
      ];
    }
    return [entryFor(page.defaultFullRect, `${base}.pdf`)];
  }

  function buildAutoCropEntries(
    mode = autoCropMode,
    allowed = filteredPageKeySet(),
    docs: readonly CropperDocument[] = cropperDocs
  ): CropExportEntry[] {
    const out: CropExportEntry[] = [];
    for (const doc of docs) {
      for (const page of doc.pages) {
        if (allowed && !allowed.has(`${doc.id}:${page.pageIndex}`)) continue;
        out.push(...cropEntriesForPage(doc, page, mode));
      }
    }
    return out;
  }

  async function ensureCropperDocsForRows(
    sourceRows: readonly EnrichedMeeshoLabelRow[]
  ): Promise<CropperDocument[]> {
    const neededImportIds = new Set(
      sourceRows
        .filter((row) => row.marketplace !== "amazon")
        .map((row) => row.importId)
    );
    if (neededImportIds.size === 0) return cropperDocs;

    const known = new Map(cropperDocs.map((doc) => [doc.id, doc]));
    const missingSources = [...neededImportIds]
      .filter((id) => !known.has(id))
      .map((id) => pdfSourceByImportId.get(id))
      .filter((src): src is ImportedPdfSource => Boolean(src))
      .sort((a, b) => a.order - b.order);

    if (missingSources.length === 0) return cropperDocs;

    setCropperBusy(true);
    try {
      const docs: CropperDocument[] = [];
      for (let i = 0; i < missingSources.length; i += 1) {
        const src = missingSources[i];
        docs.push(
          await analyzeCropperPdfBytes({
            id: src.id,
            fileName: src.fileName,
            bytes: src.pdfBytes,
          })
        );
        if (i % 2 === 1) await yieldToUiFrame();
      }
      setCropperDocs((prev) => {
        const existing = new Set(prev.map((doc) => doc.id));
        return [...prev, ...docs.filter((doc) => !existing.has(doc.id))];
      });
      return [...cropperDocs, ...docs];
    } finally {
      setCropperBusy(false);
    }
  }

  async function mergePdfParts(parts: readonly Uint8Array[]): Promise<Uint8Array> {
    if (parts.length === 0) throw new Error("No pages to export.");
    if (parts.length === 1) return parts[0];
    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();
    for (const bytes of parts) {
      const src = await PDFDocument.load(bytes);
      const copied = await out.copyPages(src, src.getPageIndices());
      for (const page of copied) out.addPage(page);
    }
    return new Uint8Array(await out.save({ useObjectStreams: false }));
  }

  async function cropOutputPdfForRows(
    sourceRows: readonly EnrichedMeeshoLabelRow[],
    mode: CropMode,
    amazonMode: CropMode,
    docsOverride?: readonly CropperDocument[],
    onProgress?: (progress: MultiSourcePdfExportProgress) => void
  ): Promise<{ bytes: Uint8Array; pageCount: number }> {
    const sortedRows = [...sourceRows].sort((a, b) => {
      const ao = sourceOrderByImportId.get(a.importId) ?? 0;
      const bo = sourceOrderByImportId.get(b.importId) ?? 0;
      if (ao !== bo) return ao - bo;
      return a.page - b.page;
    });
    onProgress?.({ phase: "loading", done: 0, total: sortedRows.length });
    const parts: Uint8Array[] = [];
    let pageCount = 0;
    const docs = docsOverride ?? (await ensureCropperDocsForRows(sortedRows));
    const nonAmazonPageKeys = rowPageKeySet(sortedRows.filter((row) => row.marketplace !== "amazon"));
    const cropEntriesByPageKey = new Map<string, CropExportEntry[]>();

    if (nonAmazonPageKeys.size > 0) {
      for (const doc of docs) {
        for (const page of doc.pages) {
          const key = `${doc.id}:${page.pageIndex}`;
          if (!nonAmazonPageKeys.has(key)) continue;
          const entries = cropEntriesForPage(doc, page, mode);
          if (entries.length > 0) cropEntriesByPageKey.set(key, entries);
        }
      }
    }

    let pendingCropEntries: CropExportEntry[] = [];
    let reportedDone = 0;

    async function flushPendingCropEntries() {
      if (pendingCropEntries.length === 0) return;
      const entries = pendingCropEntries;
      parts.push(
        await cropEntriesToPdf(entries, {
          yieldEvery: 25,
          onProgress: (done) =>
            onProgress?.({
              phase: "copying",
              done: Math.min(sortedRows.length, reportedDone + done),
              total: sortedRows.length,
            }),
        })
      );
      reportedDone += entries.length;
      pageCount += entries.length;
      pendingCropEntries = [];
      await yieldToUiFrame();
    }

    for (const row of sortedRows) {
      if (row.marketplace === "amazon") {
        await flushPendingCropEntries();
        const steps = rowsToPdfExportSteps([row], { amazonMode });
        if (steps.length === 0) continue;
        parts.push(await exportPdfPagesFromMultiSourceOrdered(steps));
        pageCount += steps.length;
        reportedDone += 1;
        onProgress?.({ phase: "copying", done: Math.min(sortedRows.length, reportedDone), total: sortedRows.length });
        continue;
      }

      const entries = cropEntriesByPageKey.get(`${row.importId}:${row.rawPageIndex}`) ?? [];
      if (entries.length === 0) continue;
      pendingCropEntries.push(...entries);
      if (pendingCropEntries.length >= CROP_EXPORT_BATCH_SIZE) await flushPendingCropEntries();
    }
    await flushPendingCropEntries();

    onProgress?.({ phase: "saving", done: sortedRows.length, total: sortedRows.length });
    return { bytes: await mergePdfParts(parts), pageCount };
  }

  async function downloadAutoCropPdf() {
    if (!canUsePremiumExports) {
      promptUpgrade("Auto-crop is available on Pro. Upgrade to remove blank space and print cleaner labels.");
      return;
    }
    if (cropScopedRows.length === 0) {
      notify.info("No crop pages available yet.");
      return;
    }
    setCropExportBusy(true);
    setPdfExportState({ phase: "loading", done: 0, total: cropScopedRows.length, label: "Preparing cropped PDF" });
    try {
      const out = await cropOutputPdfForRows(cropScopedRows, autoCropMode, autoCropMode, undefined, (progress) =>
        setPdfExportState({
          ...progress,
          label:
            progress.phase === "saving"
              ? "Saving cropped PDF"
              : progress.phase === "loading"
                ? "Preparing cropped PDF"
                : "Cropping labels",
        })
      );
      setPdfExportState({
        phase: "starting",
        done: out.pageCount,
        total: out.pageCount,
        label: "Starting download",
      });
      triggerPdfDownload(out.bytes, "tulmin-auto-cropped-labels.pdf");
      notify.success("Cropped PDF downloaded.");
    } catch (err) {
      notify.error("Could not crop PDF", {
        description: describeExportFailure(err),
      });
    } finally {
      await yieldToUiFrame();
      setCropExportBusy(false);
      setPdfExportState(null);
    }
  }

  async function downloadAutoCropZip() {
    if (!canUsePremiumExports) {
      promptUpgrade("Cropped ZIP export is available on Pro. Upgrade to bundle clean labels faster.");
      return;
    }
    if (cropScopedRows.length === 0) {
      notify.info("No crop pages available yet.");
      return;
    }
    if (cropScopedRows.length > CROP_ZIP_MAX_LABELS) {
      notify.info("Use cropped PDF for this heavy batch", {
        description: `${cropScopedRows.length.toLocaleString()} cropped labels is too heavy for browser ZIP. Download one PDF or filter into smaller marketplace batches.`,
        duration: 8000,
      });
      return;
    }
    setCropExportBusy(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const sortedRows = [...cropScopedRows].sort((a, b) => {
        const ao = sourceOrderByImportId.get(a.importId) ?? 0;
        const bo = sourceOrderByImportId.get(b.importId) ?? 0;
        if (ao !== bo) return ao - bo;
        return a.page - b.page;
      });
      let added = 0;
      for (const row of sortedRows) {
        try {
          const out = await cropOutputPdfForRows([row], autoCropMode, autoCropMode);
          const base = cropFileBase(row.sourceFile || "labels.pdf", row.page);
          const fileBase = dedupeFilename(`${base}-${autoCropMode}`, usedNames);
          zip.file(`${fileBase}.pdf`, out.bytes);
          added += 1;
        } catch {
          /* Skip rows that do not have the requested crop target, e.g. a missing invoice. */
        }
      }
      if (added === 0) {
        notify.info("No crop pages available yet.");
        return;
      }
      const zipBytes = await zip.generateAsync({ type: "uint8array" });
      triggerZipDownload(new Uint8Array(zipBytes), "tulmin-auto-cropped-labels.zip");
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

          <div className="flex flex-col gap-3 rounded-2xl border border-border/55 bg-background/55 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                {userId ? <Sparkles className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-foreground">
                  {userId ? `${plan.name} plan` : "Sign in required"}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                  {userId
                    ? entitlement.labelsLimit == null
                      ? "Unlimited normal seller use"
                      : `${entitlement.labelsUsed.toLocaleString()} / ${entitlement.labelsLimit.toLocaleString()} labels used this month${
                          entitlement.dailyLabelsLimit != null
                            ? ` · ${entitlement.dailyLabelsUsed.toLocaleString()} / ${entitlement.dailyLabelsLimit.toLocaleString()} today`
                            : ""
                        }`
                    : "Start with 150 free labels and protect your workspace."}
                </p>
                {userId && usageCloseToLimit ? (
                  <p className="mt-1 text-[11px] font-bold text-amber-300">
                    90% plan usage completed
                  </p>
                ) : null}
                {userId && usageLimitExhausted ? (
                  <p className="mt-1 text-[11px] font-bold text-destructive">
                    Your monthly label limit is exhausted. Upgrade or buy more usage to continue.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {userId && entitlement.labelsLimit != null ? (
                <div className="hidden w-32 space-y-1 sm:block">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  <p className="text-right text-[10px] font-semibold text-muted-foreground">
                    {entitlement.labelsUsed.toLocaleString()} / {entitlement.labelsLimit.toLocaleString()}
                  </p>
                </div>
              ) : null}
              <Button
                type="button"
                variant={userId ? "outline" : "default"}
                className="h-9 rounded-xl px-3 text-xs font-semibold"
                disabled={entitlementLoading}
                onClick={() => {
                  if (!userId) openOptionalSignIn();
                  else promptUpgrade("Choose the plan that matches your monthly dispatch volume.");
                }}
              >
                {userId ? "View plans" : "Sign in"}
              </Button>
            </div>
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
              className="sr-only"
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
                  <div className="w-full min-w-[12rem] space-y-2 sm:w-72">
                    <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
                      <span className="font-medium text-muted-foreground">
                        {Math.round(importProgress)}%
                      </span>
                      <span className="text-muted-foreground">
                        {parseProgress[0].toLocaleString()} / {parseProgress[1].toLocaleString()} pages
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="PDF import progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(importProgress)}
                      className="h-2.5 overflow-hidden rounded-full border border-primary/35 bg-background/70 shadow-inner"
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#4f6cff] via-[#6f8cff] to-[#9fb0ff] shadow-[0_0_18px_rgb(79_108_255/0.55)] transition-[width] duration-300 ease-out"
                        style={{ width: `${importProgress}%` }}
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
                <label
                  htmlFor="meesho-pdf-upload"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "min-h-11 w-full cursor-pointer touch-manipulation justify-center rounded-xl font-semibold shadow-sm hover:brightness-[1.02] active:brightness-[0.98] sm:w-auto sm:min-w-[9.5rem]"
                  )}
                >
                  Choose PDFs
                </label>
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
                ["filter", "Filter Labels", "Use Marketplace, SKU, QTY, payment, and courier filters."],
                ["crop", "Crop Labels", "Auto-detect labels or invoices from uploaded PDFs."],
                ["filter_crop", "Filter + Crop", "Filter first, then crop matching labels."],
              ].map(([key, title, body]) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "group flex min-h-[4.25rem] w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-colors",
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
                  <div className="min-w-0 space-y-3">
                    {processingMode === "crop" ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[12px] font-semibold text-foreground">Marketplace</p>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Pick one marketplace when multiple PDFs are uploaded.
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {visibleMarketplaceFilterValues(cropMarketplaceStats).map((value) => (
                            <button
                              key={value}
                              type="button"
                              className={cn(
                                "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold transition-colors",
                                cropMarketplace === value
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border/65 bg-background/55 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                              )}
                              onClick={() => setCropMarketplace(value)}
                            >
                              {cropMarketplace === value ? (
                                <Check className="size-3.5 text-primary" aria-hidden />
                              ) : null}
                              {marketplaceFilterTriggerDisplay(value, cropMarketplaceStats)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <p className="text-[12px] font-semibold text-foreground">Crop target</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          ["shipping", "Auto Detect Shipping Labels"],
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
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="text-[11px] font-medium text-muted-foreground sm:min-w-[10rem]">
                      <span className="font-semibold text-foreground">
                        {processingMode === "filter_crop" ? "Filtered crop:" : "Crop all:"}
                      </span>{" "}
                        {processingMode === "filter_crop"
                          ? `${filteredLabels.length.toLocaleString()} labels`
                          : `${cropScopedRows.length.toLocaleString()} label${cropScopedRows.length === 1 ? "" : "s"}`}
                    </p>
                    {processingMode === "crop" ? (
                      <div className="grid grid-cols-2 gap-2 sm:w-[17rem]">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-xl text-[12px] font-semibold"
                          disabled={cropExportBusy || cropScopedRows.length === 0}
                          onClick={() => void downloadAutoCropPdf()}
                        >
                          {cropExportBusy ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Download className="mr-1.5 size-3.5" aria-hidden />
                          )}
                          Download PDF
                        </Button>
                        <Button
                          type="button"
                          className="h-10 rounded-xl text-[12px] font-semibold"
                          disabled={cropExportBusy || cropScopedRows.length === 0}
                          onClick={() => void downloadAutoCropZip()}
                        >
                          {cropExportBusy ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Archive className="mr-1.5 size-3.5" aria-hidden />
                          )}
                          Download ZIP
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 sm:min-w-[14rem]">
                        <Button
                          type="button"
                          className="h-10 rounded-xl text-[12px] font-semibold"
                          disabled={selectedTotal === 0 || cropExportBusy || pdfExportState != null || bulkSkuZipState != null}
                          onClick={() => void downloadFilteredPdf()}
                        >
                          {cropExportBusy ? (
                            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Download className="mr-1.5 size-3.5" aria-hidden />
                          )}
                          Download Cropped Selection
                        </Button>
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {selectedTotal > 0
                            ? `${selectedTotal.toLocaleString()} selected rows will be cropped.`
                            : "Select rows below to enable download."}
                        </p>
                      </div>
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
            <div className="mb-5 flex flex-col gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <h2 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-2xl">
                    {filteredLabels.length.toLocaleString()} label{filteredLabels.length === 1 ? "" : "s"}
                  </h2>
                  <p className="mt-1 text-[13px] font-medium leading-5 text-muted-foreground">
                    {selectedTotal.toLocaleString()} selected · {mappedRows.length.toLocaleString()} ready · {(enrichedRows.length - mappedRows.length).toLocaleString()} need review
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {marketplaceStats.meesho > 0 ? (
                    <span className="inline-flex rounded-full border border-border/50 bg-background/50 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
                      Meesho <span className="ml-1 tabular-nums text-foreground">{marketplaceStats.meesho.toLocaleString()}</span>
                    </span>
                  ) : null}
                  {marketplaceStats.flipkart > 0 ? (
                    <span className="inline-flex rounded-full border border-border/50 bg-background/50 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
                      Flipkart <span className="ml-1 tabular-nums text-foreground">{marketplaceStats.flipkart.toLocaleString()}</span>
                    </span>
                  ) : null}
                  {marketplaceStats.amazon > 0 ? (
                    <span className="inline-flex rounded-full border border-orange-500/20 bg-orange-500/8 px-3 py-1.5 text-[12px] font-semibold text-orange-900 dark:text-orange-100">
                      Amazon <span className="ml-1 tabular-nums">{marketplaceStats.amazon.toLocaleString()}</span>
                    </span>
                  ) : null}
                  {marketplaceStats.invalid + amazonStats.unmatched > 0 ? (
                    <span className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[12px] font-semibold text-amber-900 dark:text-amber-100">
                      Review <span className="ml-1 tabular-nums">{(marketplaceStats.invalid + amazonStats.unmatched).toLocaleString()}</span>
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-900 dark:text-emerald-100">
                      Clean
                    </span>
                  )}
                </div>
              </div>

              {(amazonStats.total > 0 || marketplaceStats.invalid > 0) ? (
                <div className="flex flex-wrap items-center gap-2 text-[12px] leading-snug">
                  {amazonStats.total > 0 ? (
                    <>
                      <span className="inline-flex rounded-full bg-orange-500/10 px-2.5 py-1 font-semibold text-orange-900 ring-1 ring-orange-500/20 dark:text-orange-100">
                        Amazon matched {amazonStats.matched.toLocaleString()} / {amazonStats.total.toLocaleString()}
                      </span>
                      <span className="inline-flex rounded-full bg-muted/35 px-2.5 py-1 font-medium text-muted-foreground ring-1 ring-border/35">
                        SKU {amazonStats.skuDetected.toLocaleString()} · Qty {amazonStats.quantityDetected.toLocaleString()} · Courier {amazonStats.courierDetected.toLocaleString()} · Payment {amazonStats.paymentDetected.toLocaleString()}
                      </span>
                    </>
                  ) : null}
                  {amazonStats.unmatched > 0 ? (
                    <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-900 ring-1 ring-amber-500/25 dark:text-amber-100">
                      Invoice required
                    </span>
                  ) : null}
                  {marketplaceStats.invalid > 0 ? (
                    <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-900 ring-1 ring-amber-500/25 dark:text-amber-100">
                      {marketplaceStats.invalid.toLocaleString()} need review
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {pdfSources.length > 0 ? (
            <details className="group mb-4 border-t border-border/35 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="text-foreground">
                  Sources · {pdfSources.length.toLocaleString()} PDF{pdfSources.length === 1 ? "" : "s"}
                </span>
                <span className="text-[11px] font-medium group-open:hidden">
                  Manage
                </span>
                <span className="hidden text-[11px] font-medium group-open:inline">
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
                        disabled={parsing || bulkSkuZipState != null || pdfExportState != null}
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
                : "border-t border-border/35 pt-4"
            )}
            aria-labelledby="labels-grid-heading"
          >
            <div
              className={cn(
                "flex flex-col gap-2.5 pb-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3",
                viewMode === "mobile"
                  ? "border-b border-border/40"
                  : "border-b border-border/30"
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
                      <span className="font-normal">
                        {" "}
                        label{filteredLabels.length === 1 ? "" : "s"} loaded
                      </span>
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h2
                        id="labels-grid-heading"
                        className="text-[15px] font-semibold tracking-tight text-foreground"
                      >
                        Filters
                      </h2>
                      <span className="rounded-full bg-muted/35 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-border/35">
                        {filteredLabels.length.toLocaleString()} visible
                      </span>
                    </div>
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
                      label="Visible"
                      value={filteredLabels.length.toLocaleString()}
                    />
                    <MobileStatPill
                      label="Matched"
                      value={visibleMappedCount.toLocaleString()}
                    />
                    <MobileStatPill
                      label="Review"
                      value={visibleNeedReviewCount.toLocaleString()}
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
                        placeholder="SKU or order ID..."
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
                    disabled={filteredLabels.length === 0 || bulkSkuZipState != null || pdfExportState != null}
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
                "sticky top-0 z-30 hidden flex-col gap-2 rounded-2xl border border-border/45 bg-background/86 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-between dark:bg-background/72"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium tabular-nums text-muted-foreground">
                  {selectedTotal.toLocaleString()} selected ·{" "}
                  {filteredLabels.length.toLocaleString()} visible
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 rounded-xl text-xs sm:h-8 sm:min-h-0"
                  onClick={clearSelection}
                >
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {amazonInvoiceDownloadToggle}
                {showDownloadMenu ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger
                      type="button"
                      disabled={filteredLabels.length === 0 || bulkSkuZipState != null || pdfExportState != null || cropExportBusy}
                      title="Export rows"
                      className={cn(
                        buttonVariants({ variant: "default", size: "sm" }),
                        "min-h-11 gap-1 rounded-xl text-xs font-semibold shadow-sm sm:h-8 sm:min-h-0"
                      )}
                    >
                      <Download className="size-3.5" aria-hidden />
                      Download
                      <ChevronDown className="size-3.5 opacity-85" strokeWidth={2.25} aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={10}
                      className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border-border/70 bg-background p-2 shadow-[0_22px_70px_-30px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.06] backdrop-blur-xl"
                    >
                      {selectedTotal > 0 ? (
                        <DropdownMenuItem
                          className="cursor-pointer rounded-xl px-3 py-3 text-sm font-medium leading-snug whitespace-normal"
                          onClick={() => void downloadFilteredPdf()}
                        >
                          Merged PDF — selected rows only
                        </DropdownMenuItem>
                      ) : null}
                      {selectedTotal > 0 ? (
                        <DropdownMenuItem
                          className="cursor-pointer rounded-xl px-3 py-3 text-sm font-medium leading-snug whitespace-normal"
                          onClick={() => void downloadSelectedSkuFilesZip()}
                        >
                          ZIP — one PDF per SKU (selected rows only)
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        className="cursor-pointer rounded-xl px-3 py-3 text-sm font-medium leading-snug whitespace-normal"
                        onClick={() => void downloadVisiblePdf()}
                      >
                        Merged PDF — all visible rows
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer rounded-xl px-3 py-3 text-sm font-medium leading-snug whitespace-normal"
                        onClick={() => void requestDownloadAllSkuFiles()}
                      >
                        ZIP — one PDF per SKU (all visible rows)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
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

            {viewMode === "mobile" && filteredLabels.length > 0 ? (
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/94 px-4 pt-3 shadow-[0_-10px_34px_-26px_rgba(0,0,0,0.55)] backdrop-blur-sm supports-[backdrop-filter]:bg-background/86 dark:shadow-[0_-12px_40px_-30px_rgb(0_0_0/0.75)] sm:hidden">
                {amazonInvoiceDownloadToggle ? (
                  <div className="mx-auto mb-2 flex max-w-lg justify-end">
                    {amazonInvoiceDownloadToggle}
                  </div>
                ) : null}
                <div className="mx-auto flex max-w-lg items-center gap-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
                  <div className="min-w-0 flex-1 truncate">
                    <p className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground tabular-nums">
                      {(selectedTotal > 0 ? selectedTotal : filteredLabels.length).toLocaleString()}
                      <span className="ml-1.5 text-[12px] font-medium tabular-nums text-muted-foreground/90">
                        {selectedTotal > 0 ? "selected" : "visible"}
                      </span>
                    </p>
                  </div>
                  {selectedTotal > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 shrink-0 touch-manipulation rounded-xl px-3 text-[13px] font-semibold text-muted-foreground"
                      onClick={clearSelection}
                    >
                      Clear
                    </Button>
                  ) : null}
                  {showDownloadMenu ? (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger
                        type="button"
                        data-tour="download-btn"
                        disabled={filteredLabels.length === 0 || bulkSkuZipState != null || pdfExportState != null || cropExportBusy}
                        title="Export rows"
                        className={cn(
                          buttonVariants({ variant: "default", size: "lg" }),
                          "h-11 min-w-[7.5rem] touch-manipulation gap-1.5 rounded-xl px-4 text-[13px] font-semibold shadow-[0_8px_32px_-14px_rgb(96_165_250/0.9)]"
                        )}
                      >
                        <Download className="size-[18px] shrink-0" aria-hidden />
                        Download
                        <ChevronDown className="size-4 shrink-0 opacity-85" strokeWidth={2.25} aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="top"
                        align="end"
                        sideOffset={10}
                        className="w-[min(100vw-2rem,22rem)] rounded-2xl border-border/70 bg-background p-2 shadow-[0_22px_70px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.06] backdrop-blur-xl"
                      >
                        {selectedTotal > 0 ? (
                          <DropdownMenuItem
                            className="cursor-pointer rounded-xl px-3 py-3 text-[13px] font-medium leading-snug whitespace-normal"
                            onClick={() => void downloadFilteredPdf()}
                          >
                            Merged PDF — selected rows only
                          </DropdownMenuItem>
                        ) : null}
                        {selectedTotal > 0 ? (
                          <DropdownMenuItem
                            className="cursor-pointer rounded-xl px-3 py-3 text-[13px] font-medium leading-snug whitespace-normal"
                            onClick={() => void downloadSelectedSkuFilesZip()}
                          >
                            ZIP — one PDF per SKU (selected rows only)
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          className="cursor-pointer rounded-xl px-3 py-3 text-[13px] font-medium leading-snug whitespace-normal"
                          onClick={() => void downloadVisiblePdf()}
                        >
                          Merged PDF — all visible rows
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer rounded-xl px-3 py-3 text-[13px] font-medium leading-snug whitespace-normal"
                          onClick={() => void requestDownloadAllSkuFiles()}
                        >
                          ZIP — all visible rows
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </WorkspaceSurfaceCard>
      ) : null}

      <Dialog open={loginRequiredOpen} onOpenChange={setLoginRequiredOpen}>
        <DialogContent className="overflow-hidden border-primary/20 bg-background/98 p-0 shadow-[0_28px_90px_-38px_rgb(37_99_235/0.85)] backdrop-blur-xl sm:max-w-[31rem]">
          <div className="bg-[radial-gradient(circle_at_12%_0%,hsl(var(--primary)/0.2),transparent_35%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--background)))] px-5 py-5">
            <DialogHeader className="text-left sm:text-left">
              <div className="mb-3 grid size-12 place-items-center rounded-2xl border border-primary/25 bg-primary/12 text-primary shadow-inner">
                <Lock className="size-5" aria-hidden />
              </div>
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                Login to continue
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
                Uploads are welcome anytime. Sign in before processing so Tulmin AI can protect your usage, save your workspace, and keep dispatch history clean.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-3 px-5 pb-5">
            {[
              "Save SKU mapping",
              "Track uploads",
              "Access plans",
              "Process labels securely",
            ].map((benefit) => (
              <div
                key={benefit}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/65 px-3 py-2.5 text-sm font-semibold text-foreground"
              >
                <Check className="size-4 text-emerald-400" aria-hidden />
                {benefit}
              </div>
            ))}
            <DialogFooter className="pt-2">
              <Button
                type="button"
                className="h-11 w-full rounded-2xl"
                onClick={() => {
                  setLoginRequiredOpen(false);
                  openOptionalSignIn();
                }}
              >
                Login to Continue
                <ArrowDown className="size-4 rotate-[-90deg]" aria-hidden />
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto border-primary/20 bg-background/98 p-4 shadow-[0_24px_90px_-38px_rgb(37_99_235/0.75)] backdrop-blur-xl sm:max-w-5xl sm:p-5">
          {upgradeReason ? (
            <div className="mb-4 rounded-[1.35rem] border border-amber-400/20 bg-amber-400/10 p-4">
              <p className="text-lg font-semibold text-foreground">
                You have reached your current plan limit
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {upgradeReason ||
                  "Your monthly label limit is exhausted. Upgrade your plan or buy more usage to continue."}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <RunMetric label="Current plan" value={plan.name} />
                <RunMetric label="Used labels" value={entitlement.labelsUsed.toLocaleString()} />
                <RunMetric
                  label="Remaining"
                  value={entitlement.labelsRemaining == null ? "∞" : entitlement.labelsRemaining.toLocaleString()}
                />
                <RunMetric label="Next plan" value={recommendedPlan.name} tone="amazon" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15"
                  disabled={checkoutBusy}
                  onClick={() => void startBillingCheckout({ type: "topup", labelCredits: 1000 })}
                >
                  {checkoutBusy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                  Buy More Labels
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-xl"
                  disabled={checkoutBusy}
                  onClick={() => {
                    trackEvent("billing_upgrade_popup_cta", { plan: entitlement.plan });
                    void startBillingCheckout({
                      type: "plan",
                      plan: recommendedPlan.id,
                      cycle: "monthly",
                    });
                  }}
                >
                  Upgrade Plan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => {
                    void refreshEntitlement();
                    notify.info(
                      `${entitlement.labelsUsed.toLocaleString()} / ${
                        entitlement.labelsLimit?.toLocaleString() ?? "∞"
                      } labels used this month`
                    );
                  }}
                >
                  View Usage
                </Button>
              </div>
            </div>
          ) : null}
          <PricingCards
            currentPlan={entitlement.plan}
            reason={upgradeReason}
            compact
            onChoosePlan={(planId, cycle) => {
              trackEvent("billing_plan_selected", {
                plan: planId,
                cycle,
                current_plan: entitlement.plan,
              });
              void startBillingCheckout({ type: "plan", plan: planId, cycle });
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={pdfExportState != null} disablePointerDismissal onOpenChange={() => {}}>
        <DialogContent
          showCloseButton={false}
          className="overflow-hidden border-primary/20 bg-card/96 p-0 shadow-[0_24px_90px_-36px_rgb(37_99_235/0.75)] backdrop-blur-xl sm:max-w-[25rem]"
        >
          <div className="border-b border-border/55 bg-primary/[0.05] px-5 py-4">
            <DialogHeader className="gap-0 text-left sm:text-left">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/12 text-primary shadow-sm">
                    {pdfExportState?.phase === "starting" ? (
                      <Check className="size-[18px]" aria-hidden />
                    ) : (
                      <Loader2 className="size-[18px] animate-spin" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-[16px] font-semibold leading-tight tracking-tight text-foreground">
                      {pdfExportModal.title}
                    </DialogTitle>
                    <DialogDescription className="mt-0.5 text-[12px] font-medium leading-snug text-muted-foreground/90">
                      {pdfExportModal.body}
                    </DialogDescription>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-primary">
                  {pdfExportModal.pct}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[12px] font-semibold">
                <span className="text-foreground tabular-nums">{pdfExportModal.count}</span>
                <span className="text-muted-foreground">Local export</span>
              </div>
            </DialogHeader>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="rounded-2xl border border-primary/15 bg-[linear-gradient(180deg,hsl(var(--background)/0.76),hsl(var(--muted)/0.22))] p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/85">Export status</p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-foreground">Preparing print-ready PDF</p>
                </div>
                <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-primary">
                  {pdfExportModal.pct}%
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/30">
                {pdfExportModal.pct === 0 ? (
                  <div className="absolute inset-0 animate-pulse bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.28),transparent)]" />
                ) : null}
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),rgb(125_158_255))] shadow-[0_0_18px_rgb(96_165_250/0.45)] transition-[width] duration-700 ease-out"
                  style={{ width: `${pdfExportModal.pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold">
                <span className="truncate text-muted-foreground">{pdfExportModal.count}</span>
                <span className="shrink-0 text-muted-foreground/80">
                  {pdfExportModal.pct === 0 ? "Starting..." : "In progress"}
                </span>
              </div>
            </div>

            <p className="text-[12px] font-medium leading-snug text-muted-foreground/90">
              {pdfExportModal.helper}
            </p>

            <div className="relative px-1 pt-1">
              <div className="absolute left-5 right-5 top-[1.05rem] h-px bg-border/60" aria-hidden />
              <div className="grid grid-cols-4 gap-2 text-[10px] font-semibold text-muted-foreground">
                {[
                  ["loading", "Prepare"],
                  ["copying", "Build"],
                  ["saving", "Save"],
                  ["starting", "Start"],
                ].map(([phase, label]) => {
                  const phases = ["loading", "copying", "saving", "starting"];
                  const currentIndex = phases.indexOf(pdfExportState?.phase ?? "loading");
                  const stepIndex = phases.indexOf(phase);
                  const isDone = stepIndex < currentIndex || pdfExportState?.phase === "starting";
                  const isActive = stepIndex === currentIndex && pdfExportState?.phase !== "starting";
                  return (
                    <div
                      key={phase}
                      className={cn(
                        "relative z-10 flex flex-col items-center gap-1.5 text-center transition-colors",
                        isDone
                          ? "text-emerald-300"
                          : isActive
                            ? "text-primary"
                            : "text-muted-foreground/65"
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-7 place-items-center rounded-full border bg-card transition-colors",
                          isDone
                            ? "border-emerald-400/35 bg-emerald-400/10"
                            : isActive
                              ? "border-primary/45 bg-primary/10 shadow-[0_0_24px_-12px_rgb(96_165_250/0.95)]"
                              : "border-border/65"
                        )}
                      >
                        {isDone ? <Check className="size-3.5" aria-hidden /> : null}
                        {isActive ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                        {!isDone && !isActive ? <span className="size-1.5 rounded-full bg-current opacity-60" /> : null}
                      </span>
                      <span className="text-[10px] leading-none">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
