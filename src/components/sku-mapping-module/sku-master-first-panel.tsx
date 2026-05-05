"use client";

import * as React from "react";
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
import { Label } from "@/components/ui/label";
import type { SkuMasterFirstRow } from "@/types/sku-mapping-module";
import type { MasterSkuRecord } from "@/types/sku-map";
import { newEmptyMasterRow } from "@/lib/sku-mapping-module/master-first-helpers";
import {
  closeMatchScore,
  isLikelyNonListingSkuLabel,
} from "@/lib/sku-mapping-module/sku-close-match";
import { cn } from "@/lib/utils";

const GRID_TEMPLATE =
  "grid grid-cols-[minmax(160px,1fr)_minmax(220px,2fr)_72px_minmax(88px,0.7fr)_40px] items-center gap-x-3 gap-y-0 px-4 py-2.5 transition-colors";

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
  /** Used to rank listing SKUs: closest string match appears first */
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
    // Order must NOT depend on selection — otherwise checking an item re-sorts the list
    // and jumps the scroll / “moves” rows to the top (bad multi-select UX).
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
  /** Enables guest vs local-only wording in the footer hint */
  cloudConfigured: boolean;
  onSaveAll: () => void | Promise<void>;
  saveBusy: boolean;
}

export function SkuMasterFirstPanel({
  uploadedSkus,
  masterRows,
  setMasterRows,
  masterNameSuggestions,
  globalBusy,
  remoteAvailable,
  cloudConfigured,
  onSaveAll,
  saveBusy,
}: SkuMasterFirstPanelProps) {
  const [gridSearch, setGridSearch] = React.useState("");

  const suggestionsListId = React.useId();

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

  const q = gridSearch.trim().toLowerCase();
  const visibleRows = React.useMemo(() => {
    if (!q) return masterRows;
    return masterRows.filter((r) => {
      if (r.masterName.toLowerCase().includes(q)) return true;
      return r.listingSkus.some((s) => s.toLowerCase().includes(q));
    });
  }, [masterRows, q]);

  const assignedCount = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of masterRows) {
      for (const ls of r.listingSkus) s.add(ls);
    }
    return s.size;
  }, [masterRows]);

  const unmappedCount = uploadedSkus.length - assignedCount;

  return (
    <div className="space-y-3">
      <datalist id={suggestionsListId}>
        {masterNameSuggestions.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-elevate-xs">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Filter rows
          </Label>
          <Input
            value={gridSearch}
            onChange={(e) => setGridSearch(e.target.value)}
            placeholder="SKU or listing SKU…"
            className="min-h-11 rounded-md border-input bg-muted/40 text-[14px] placeholder:text-muted-foreground focus-visible:bg-background sm:min-h-10"
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 flex-1 rounded-md px-3.5 text-[13px] font-medium shadow-sm hover:bg-muted sm:min-h-10 sm:flex-initial"
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
            className="min-h-11 flex-[2] rounded-md px-5 text-[13px] font-semibold shadow-sm hover:bg-primary/90 sm:min-h-10 sm:flex-initial"
            disabled={globalBusy || saveBusy || uploadedSkus.length === 0}
            onClick={() => void onSaveAll()}
          >
            {saveBusy ? "Saving…" : "Save mappings"}
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
        Add each <span className="font-medium text-foreground">SKU</span>, choose{" "}
        <span className="font-medium text-foreground">Select listings</span>, attach
        any SKUs from your import, then{" "}
        <span className="font-medium text-foreground">Save mappings</span>.
        {!remoteAvailable && cloudConfigured ? (
          <span className="text-muted-foreground">
            {" "}
            First save asks for email verification once, then writes to your cloud
            workspace.
          </span>
        ) : null}
        {!remoteAvailable && !cloudConfigured ? (
          <span className="text-muted-foreground">
            {" "}
            Configure Supabase under Settings—or keep drafts on this device only.
          </span>
        ) : null}
      </p>

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
                    <span className="font-medium text-foreground">Add SKU row</span>
                    , or pull the latest map once you&apos;re signed in.
                  </>
                ) : (
                  "Clear the filter or try another search."
                )}
              </p>
            </div>
          ) : (
            visibleRows.map((row, idx) => {
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
                      Mapped
                    </Badge>
                  ) : status === "partial" ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-50"
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
          })
          )}
        </div>
      </div>

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
          {masterRows.length === 1 ? "SKU" : "SKUs"}
        </span>
      </div>
    </div>
  );
}
