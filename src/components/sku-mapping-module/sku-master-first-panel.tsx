"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SkuMasterFirstRow, MappingStatusFilter } from "@/types/sku-mapping-module";
import type { MasterSkuRecord } from "@/types/sku-map";
import { newEmptyMasterRow } from "@/lib/sku-mapping-module/master-first-helpers";
import {
  closeMatchScore,
  isLikelyNonListingSkuLabel,
} from "@/lib/sku-mapping-module/sku-close-match";
import { cn } from "@/lib/utils";

const GRID_TEMPLATE =
  "grid grid-cols-[minmax(160px,1fr)_minmax(220px,2fr)_72px_minmax(88px,0.7fr)_40px] items-center gap-x-3 gap-y-0 px-4 py-2.5 transition-colors";

const GRID_VIRTUAL_THRESHOLD = 500;
const UNMAPPED_VIRTUAL_THRESHOLD = 400;
const ROW_ESTIMATE_PX = 72;

function ChildSkuPicker({
  rowId,
  masterName,
  rowSelections,
  uploadedSkus,
  masterRows,
  globalBusy,
  onToggle,
}: {
  rowId: string;
  masterName: string;
  rowSelections: string[];
  uploadedSkus: string[];
  masterRows: SkuMasterFirstRow[];
  globalBusy: boolean;
  onToggle: (sku: string, checked: boolean) => void;
}) {
  const [q, setQ] = React.useState("");
  const takenElsewhere = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of masterRows) {
      if (r.id === rowId) continue;
      for (const ls of r.listingSkus) s.add(ls);
    }
    return s;
  }, [masterRows, rowId]);

  const pool = React.useMemo(() => {
    return uploadedSkus.filter(
      (sku) =>
        (!takenElsewhere.has(sku) || rowSelections.includes(sku)) &&
        !isLikelyNonListingSkuLabel(sku)
    );
  }, [uploadedSkus, takenElsewhere, rowSelections]);

  const filteredSorted = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = needle
      ? pool.filter((sku) => sku.toLowerCase().includes(needle))
      : pool.slice();

    const masterTrim = masterName.trim();
    matched.sort((a, b) => {
      if (!masterTrim) {
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      }
      const da = closeMatchScore(masterTrim, a);
      const db = closeMatchScore(masterTrim, b);
      if (db !== da) return db - da;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    return matched;
  }, [pool, q, masterName]);

  const label =
    rowSelections.length === 0
      ? "Select listings…"
      : `${rowSelections.length.toLocaleString()} listing SKU${rowSelections.length === 1 ? "" : "s"}`;

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) setQ("");
      }}
    >
      <DropdownMenuTrigger
        type="button"
        disabled={globalBusy}
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          "h-9 w-full justify-between rounded-md border-border bg-background px-3 text-left text-[13px] font-normal text-foreground shadow-sm hover:bg-muted/50",
          rowSelections.length === 0 && "text-muted-foreground"
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={2}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="max-h-[min(320px,50vh)] w-[min(100vw-2rem,380px)] overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-lg sm:w-[380px]"
        align="start"
      >
        <div className="border-b border-border bg-muted/40 px-3 py-2.5">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search listings…"
            className="h-9 rounded-md border-input bg-background text-[13px] shadow-sm placeholder:text-muted-foreground"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <DropdownMenuGroup className="max-h-[240px] overflow-y-auto overscroll-contain px-0.5 pb-1">
          <DropdownMenuLabel className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Best match first
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-2 bg-border" />
          {filteredSorted.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] leading-snug text-muted-foreground">
              No matches. Try different search terms—or assign those SKUs on another row first.
            </p>
          ) : (
            filteredSorted.map((sku) => (
              <DropdownMenuCheckboxItem
                key={sku}
                checked={rowSelections.includes(sku)}
                onCheckedChange={(c) => onToggle(sku, Boolean(c))}
                className="mx-1 rounded-md font-mono text-[12px] text-foreground"
              >
                <span className="truncate">{sku}</span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface SkuMasterFirstPanelProps {
  uploadedSkus: string[];
  masterRows: SkuMasterFirstRow[];
  setMasterRows: React.Dispatch<React.SetStateAction<SkuMasterFirstRow[]>>;
  masterNameSuggestions: MasterSkuRecord[];
  globalBusy: boolean;
  remoteAvailable: boolean;
  cloudConfigured: boolean;
  workspaceSearch: string;
  mappingStatusFilter: MappingStatusFilter;
  onFlushSaveNow: () => void | Promise<void>;
  flushSaveBusy: boolean;
}

export function SkuMasterFirstPanel({
  uploadedSkus,
  masterRows,
  setMasterRows,
  masterNameSuggestions,
  globalBusy,
  remoteAvailable,
  cloudConfigured,
  workspaceSearch,
  mappingStatusFilter,
  onFlushSaveNow,
  flushSaveBusy,
}: SkuMasterFirstPanelProps) {
  const suggestionsListId = React.useId();
  const scrollParentRef = React.useRef<HTMLDivElement>(null);
  const unmappedScrollRef = React.useRef<HTMLDivElement>(null);

  function toggleChild(rowId: string, sku: string, checked: boolean) {
    setMasterRows((rows) =>
      rows.map((r) => {
        if (r.id !== rowId) {
          if (checked)
            return { ...r, listingSkus: r.listingSkus.filter((x) => x !== sku) };
          return r;
        }
        if (checked) {
          if (r.listingSkus.includes(sku)) return r;
          return { ...r, listingSkus: [...r.listingSkus, sku] };
        }
        return { ...r, listingSkus: r.listingSkus.filter((x) => x !== sku) };
      })
    );
  }

  function updateMasterName(rowId: string, name: string) {
    setMasterRows((rows) =>
      rows.map((r) => (r.id === rowId ? { ...r, masterName: name } : r))
    );
  }

  function removeRow(rowId: string) {
    setMasterRows((rows) => rows.filter((r) => r.id !== rowId));
  }

  const assignedSet = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of masterRows) {
      for (const ls of r.listingSkus) s.add(ls);
    }
    return s;
  }, [masterRows]);

  const assignedCount = assignedSet.size;
  const unmappedCount = uploadedSkus.length - assignedCount;

  const unmappedSkusFiltered = React.useMemo(() => {
    const q = workspaceSearch.trim().toLowerCase();
    const base = uploadedSkus.filter((s) => !assignedSet.has(s));
    if (!q) return base;
    return base.filter((s) => s.toLowerCase().includes(q));
  }, [uploadedSkus, assignedSet, workspaceSearch]);

  const needle = workspaceSearch.trim().toLowerCase();
  const visibleRows = React.useMemo(() => {
    let rows = masterRows;
    if (mappingStatusFilter === "mapped") {
      rows = rows.filter((r) => r.listingSkus.length > 0);
    }
    if (!needle) return rows;
    return rows.filter((r) => {
      if (r.masterName.toLowerCase().includes(needle)) return true;
      return r.listingSkus.some((s) => s.toLowerCase().includes(needle));
    });
  }, [masterRows, mappingStatusFilter, needle]);

  const rowVirtualizer = useVirtualizer({
    count: mappingStatusFilter === "unmapped" ? 0 : visibleRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 14,
  });

  const unmappedVirtualizer = useVirtualizer({
    count: unmappedSkusFiltered.length,
    getScrollElement: () => unmappedScrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX - 24,
    overscan: 12,
  });

  function renderRow(row: SkuMasterFirstRow, idx: number) {
    const named = Boolean(row.masterName.trim());
    const hasChildren = row.listingSkus.length > 0;
    const status =
      named && hasChildren
        ? "mapped"
        : named || hasChildren
          ? "partial"
          : "draft";

    return (
      <div
        key={row.id}
        className={cn(
          GRID_TEMPLATE,
          "min-w-[min(100%,880px)] border-b border-border last:border-b-0 hover:bg-muted/40",
          idx % 2 === 1 && "bg-muted/25"
        )}
        role="row"
      >
        <div className="min-w-0 pr-1">
          <Input
            value={row.masterName}
            onChange={(e) => updateMasterName(row.id, e.target.value)}
            disabled={globalBusy}
            placeholder="e.g. KURTI_RED_FAMILY"
            list={suggestionsListId}
            className="min-h-11 rounded-md border-input bg-background font-mono text-[13px] shadow-sm sm:min-h-9"
          />
        </div>
        <div className="min-w-0 pl-0.5">
          <ChildSkuPicker
            rowId={row.id}
            masterName={row.masterName}
            rowSelections={row.listingSkus}
            uploadedSkus={uploadedSkus}
            masterRows={masterRows}
            globalBusy={globalBusy}
            onToggle={(sku, c) => toggleChild(row.id, sku, c)}
          />
        </div>
        <div className="text-center tabular-nums text-[13px] font-medium text-muted-foreground">
          {row.listingSkus.length.toLocaleString()}
        </div>
        <div className="flex justify-center">
          {status === "mapped" ? (
            <Badge
              variant="outline"
              className="rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/45 dark:text-emerald-50"
            >
              Mapped SKU
            </Badge>
          ) : status === "partial" ? (
            <Badge
              variant="outline"
              className="rounded-full border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:border-amber-800/60 dark:text-amber-950/40 dark:text-amber-50"
            >
              Partial
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="rounded-full border-border bg-muted/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Draft
            </Badge>
          )}
        </div>
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 rounded-md p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:min-h-8 sm:min-w-8"
            disabled={globalBusy}
            aria-label="Remove SKU row"
            onClick={() => removeRow(row.id)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <datalist id={suggestionsListId}>
        {masterNameSuggestions.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-elevate-xs">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 flex-1 rounded-md px-3.5 text-[13px] font-medium shadow-sm hover:bg-muted sm:flex-initial"
            disabled={globalBusy}
            onClick={() =>
              setMasterRows((rows) => [newEmptyMasterRow(), ...rows])
            }
          >
            <Plus className="mr-1.5 size-4 text-emerald-600" aria-hidden />
            Add SKU row
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-h-10 flex-[2] rounded-md px-5 text-[13px] font-semibold shadow-sm hover:bg-primary/90 sm:flex-initial"
            disabled={
              globalBusy || flushSaveBusy || uploadedSkus.length === 0
            }
            onClick={() => void onFlushSaveNow()}
          >
            {flushSaveBusy ? "Syncing Tulmin workspace…" : "Save now"}
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
        Add each{" "}
        <span className="font-medium text-foreground">master SKU name</span>, choose{" "}
        <span className="font-medium text-foreground">Select listings</span>, then attach listings.
        Signed-in workspaces{" "}
        <span className="font-semibold text-foreground">sync automatically every few seconds</span>
        . Use <span className="font-medium text-foreground">Save now</span> after large edits when you want an immediate confirmation.
        {!remoteAvailable && cloudConfigured ? (
          <span className="text-muted-foreground">
            {" "}
            First save may ask you to verify email once—then cloud sync kicks in quietly.
          </span>
        ) : null}
        {!remoteAvailable && !cloudConfigured ? (
          <span className="text-muted-foreground">
            {" "}
            Configure Supabase in Settings—or stay on-device only.
          </span>
        ) : null}
      </p>

      {mappingStatusFilter === "unmapped" ? (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-elevate-sm">
          <div className="border-b border-border bg-muted/30 px-4 py-3 text-[13px]">
            <p className="font-semibold text-foreground">
              SKU Missing (
              <span className="tabular-nums">
                {unmappedSkusFiltered.length.toLocaleString()}
              </span>
              )
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Switch to{" "}
              <span className="font-semibold text-foreground">All</span> filter to attach these to master SKUs in the grid.
            </p>
          </div>
          <div
            ref={unmappedScrollRef}
            className="max-h-[min(55vh,560px)] min-h-[160px] overflow-y-auto overscroll-contain px-4 py-2"
          >
            {unmappedSkusFiltered.length === 0 ? (
              <p className="py-14 text-center text-[13px] text-muted-foreground">
                Everything in your import matches a filter—or all listings are already assigned.
              </p>
            ) : unmappedSkusFiltered.length > UNMAPPED_VIRTUAL_THRESHOLD ? (
              <div
                className="relative w-full"
                style={{ height: unmappedVirtualizer.getTotalSize() }}
              >
                {unmappedVirtualizer.getVirtualItems().map((v) => (
                  <div
                    key={v.key}
                    className="virtual-row absolute left-0 top-0 w-full px-2"
                    style={{
                      transform: `translate3d(0, ${v.start}px, 0)`,
                    }}
                  >
                    <div
                      className={cn(
                        "rounded-lg border border-border/70 bg-muted/20 px-3 py-2 font-mono text-[12px] text-foreground",
                        v.index % 2 === 1 && "bg-muted/35"
                      )}
                    >
                      {unmappedSkusFiltered[v.index]}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-1.5 pb-2">
                {unmappedSkusFiltered.map((sku, i) => (
                  <li
                    key={sku}
                    className={cn(
                      "rounded-lg border border-border/70 px-3 py-2 font-mono text-[12px] text-foreground",
                      i % 2 === 1 ? "bg-muted/25" : "bg-muted/10"
                    )}
                  >
                    {sku}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-elevate-sm">
          <div className="overflow-x-auto border-b border-border">
            <div
              className={cn(
                GRID_TEMPLATE,
                "min-w-[min(100%,880px)] shrink-0 bg-label-grid-header py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              )}
              role="row"
            >
              <div className="min-w-0">SKU</div>
              <div className="min-w-0">Listing SKUs</div>
              <div className="text-center tabular-nums">Qty</div>
              <div className="min-w-0 text-center">Status</div>
              <span className="sr-only">Remove</span>
            </div>
          </div>

          <div
            ref={scrollParentRef}
            className="max-h-[min(55vh,560px)] min-h-[140px] overflow-x-auto overflow-y-auto overscroll-contain"
            role="rowgroup"
          >
            {visibleRows.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-[15px] font-medium text-foreground">
                  {masterRows.length === 0
                    ? "Start with a SKU row"
                    : "No rows match this filter"}
                </p>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {masterRows.length === 0 ? (
                    <>
                      Use{" "}
                      <span className="font-medium text-foreground">
                        Add SKU row
                      </span>
                      , or pull fresh mappings when signed in.
                    </>
                  ) : (
                    "Clear the toolbar search or widen the workspace filter chips."
                  )}
                </p>
              </div>
            ) : visibleRows.length > GRID_VIRTUAL_THRESHOLD ? (
              <div
                className="relative min-w-[min(100%,880px)]"
                style={{ height: rowVirtualizer.getTotalSize() }}
              >
                {rowVirtualizer.getVirtualItems().map((v) => {
                  const row = visibleRows[v.index];
                  return (
                    <div
                      key={v.key}
                      className="virtual-row absolute left-0 top-0 min-w-[min(100%,880px)] px-2"
                      style={{
                        transform: `translate3d(0, ${v.start}px, 0)`,
                      }}
                    >
                      {renderRow(row, v.index)}
                    </div>
                  );
                })}
              </div>
            ) : (
              visibleRows.map((row, idx) => renderRow(row, idx))
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-[12px] tabular-nums text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">
            {assignedCount.toLocaleString()}
          </span>
          <span className="text-muted-foreground/70"> / </span>
          {uploadedSkus.length.toLocaleString()} listings assigned ·{" "}
          <span className="text-amber-800 dark:text-amber-400">
            {unmappedCount.toLocaleString()} open
          </span>
        </span>
        <span className="text-muted-foreground">
          {masterRows.length.toLocaleString()}{" "}
          {masterRows.length === 1 ? "SKU row" : "SKU rows"}
        </span>
      </div>
    </div>
  );
}
