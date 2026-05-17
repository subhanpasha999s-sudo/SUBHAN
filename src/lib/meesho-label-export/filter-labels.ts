import type { EnrichedMeeshoLabelRow } from "@/lib/meesho-label-export/master-lookup";
import type { MarketplaceKind, PaymentKind } from "@/types/meesho-label-export";

/**
 * Order rows for a grouped PDF: master → carrier → qty → listing → page.
 * Unmapped masters sort last (null / empty → high sentinel).
 */
export function sortLabelsForGroupedExport(
  rows: readonly EnrichedMeeshoLabelRow[]
): EnrichedMeeshoLabelRow[] {
  const masterKey = (r: EnrichedMeeshoLabelRow) =>
    (r.master_sku ?? "").trim() || "\uffff";

  return [...rows].sort((a, b) => {
    let c = masterKey(a).localeCompare(masterKey(b), undefined, {
      sensitivity: "base",
    });
    if (c !== 0) return c;

    c = (a.delivery_partner ?? "").localeCompare(b.delivery_partner ?? "", undefined, {
      sensitivity: "base",
    });
    if (c !== 0) return c;

    const qa = a.quantity ?? Number.NEGATIVE_INFINITY;
    const qb = b.quantity ?? Number.NEGATIVE_INFINITY;
    if (qa !== qb) return qa - qb;

    c = (a.listing_sku ?? "").localeCompare(b.listing_sku ?? "", undefined, {
      sensitivity: "base",
    });
    if (c !== 0) return c;

    return a.page - b.page;
  });
}

/** How rows are narrowed by mapped master SKU (OR across names when `masters`). */
export type MappedSkuMasterFilter =
  | { mode: "all" }
  | { mode: "unmapped" }
  | { mode: "masters"; names: readonly string[] };

export interface MeeshoLabelFilters {
  mappedMaster: MappedSkuMasterFilter;
  marketplace: MarketplaceKind | "all";
  payment: PaymentKind | "all";
  listingSearch: string;
  /** `null` = no quantity filter; otherwise match PDF-extracted quantity exactly */
  qtyExact: number | null;
  partner: string;
}

function rowMatchesMasterNames(
  rowMasterTrimmed: string,
  names: readonly string[]
): boolean {
  for (const n of names) {
    const filterM = n.trim();
    if (
      rowMasterTrimmed.localeCompare(filterM, undefined, {
        sensitivity: "base",
      }) === 0
    ) {
      return true;
    }
  }
  return false;
}

export function applyMeeshoLabelFilters(
  rows: EnrichedMeeshoLabelRow[],
  f: MeeshoLabelFilters
): EnrichedMeeshoLabelRow[] {
  const q = f.listingSearch.trim().toLowerCase();
  const partnerNeedle = f.partner.trim().toLowerCase();

  return rows.filter((r) => {
    if (f.marketplace !== "all" && r.marketplace !== f.marketplace) return false;
    if (f.payment !== "all" && r.payment !== f.payment) return false;

    const mm = f.mappedMaster;
    if (mm.mode === "unmapped") {
      if ((r.master_sku ?? "").trim()) return false;
    } else if (mm.mode === "masters" && mm.names.length > 0) {
      const rowM = (r.master_sku ?? "").trim();
      if (!rowM || !rowMatchesMasterNames(rowM, mm.names)) return false;
    }

    const sku = (r.listing_sku ?? "").toLowerCase();
    const orderId = (r.orderId ?? "").toLowerCase();
    if (q && !sku.includes(q) && !orderId.includes(q)) return false;

    const qty = r.quantity;
    if (f.qtyExact != null && Number.isFinite(f.qtyExact)) {
      if (qty == null || qty !== f.qtyExact) return false;
    }

    if (partnerNeedle) {
      const p = (r.delivery_partner ?? "").toLowerCase();
      if (!p.includes(partnerNeedle)) return false;
    }

    return true;
  });
}

export type SortKey =
  | "master_sku"
  | "listing_sku"
  | "quantity"
  | "delivery_partner";

export function sortMeeshoLabels(
  rows: EnrichedMeeshoLabelRow[],
  sortKey: SortKey,
  dir: "asc" | "desc"
): EnrichedMeeshoLabelRow[] {
  const mult = dir === "asc" ? 1 : -1;
  const safeQty = (q: number | null) => (q == null ? Number.NEGATIVE_INFINITY : q);

  const cmp = (a: EnrichedMeeshoLabelRow, b: EnrichedMeeshoLabelRow) => {
    switch (sortKey) {
      case "master_sku": {
        const av = a.master_sku ?? "\uffff";
        const bv = b.master_sku ?? "\uffff";
        return av.localeCompare(bv, undefined, { sensitivity: "base" }) * mult;
      }
      case "listing_sku":
        return (
          a.listing_sku.localeCompare(b.listing_sku, undefined, {
            sensitivity: "base",
          }) * mult
        );
      case "quantity":
        return (safeQty(a.quantity) - safeQty(b.quantity)) * mult;
      case "delivery_partner":
        return (
          a.delivery_partner.localeCompare(b.delivery_partner, undefined, {
            sensitivity: "base",
          }) * mult
        );
      default:
        return 0;
    }
  };

  return [...rows].sort(cmp);
}

export function totalPages(rowCount: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(rowCount / pageSize));
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number
): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
