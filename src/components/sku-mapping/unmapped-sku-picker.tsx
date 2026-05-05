"use client";

import * as React from "react";

import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SkuMapRecord } from "@/types/sku-map";

export interface UnmappedSkuPickerProps {
  rows: SkuMapRecord[];
  globalSearch: string;
  localFilter: string;
  onLocalFilterChange: (q: string) => void;
  selected: Record<string, true>;
  onToggle: (listingSku: string) => void;
  /** Select every listing SKU that matches current filters (not only the visible slice). */
  onSelectAllMatching: (listingSkus: string[]) => void;
  onClearSelection: () => void;
}

export function UnmappedSkuPicker({
  rows,
  globalSearch,
  localFilter,
  onLocalFilterChange,
  selected,
  onToggle,
  onSelectAllMatching,
  onClearSelection,
}: UnmappedSkuPickerProps) {
  const g = globalSearch.trim().toLowerCase();
  const l = localFilter.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      const hay = `${r.listing_sku} ${r.category ?? ""}`.toLowerCase();
      if (g && !hay.includes(g)) return false;
      if (l && !hay.includes(l)) return false;
      return true;
    });
  }, [rows, g, l]);

  const selectedInView = filtered.filter((r) => selected[r.listing_sku]).length;
  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected[r.listing_sku]);
  const someSelected =
    filtered.some((r) => selected[r.listing_sku]) && !allSelected;

  const slice =
    filtered.length > 500 ? filtered.slice(0, 500) : filtered;
  const truncated = filtered.length > 500;

  return (
    <div className="space-y-2 rounded border border-neutral-200 bg-[#fafbfc]">
      <div className="flex flex-col gap-2 border-b border-neutral-200 bg-white px-2 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-neutral-800">Unmapped</span>
          <Badge
            variant="secondary"
            className="h-5 border-0 bg-neutral-100 px-1.5 text-[10px] font-normal tabular-nums text-neutral-600"
          >
            {selectedInView}/{filtered.length}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-neutral-200 px-2 text-[11px]"
            disabled={filtered.length === 0}
            onClick={() =>
              onSelectAllMatching(filtered.map((r) => r.listing_sku))
            }
          >
            All matching
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-neutral-600"
            onClick={onClearSelection}
          >
            Clear
          </Button>
        </div>
      </div>

      <div className="relative px-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-3 -translate-y-1/2 text-neutral-400" />
        <Input
          value={localFilter}
          onChange={(e) => onLocalFilterChange(e.target.value)}
          placeholder="Filter…"
          className="h-7 border-neutral-200 bg-white pl-7 text-xs"
          aria-label="Filter unmapped SKUs"
        />
      </div>

      {truncated ? (
        <p className="px-2 text-[10px] text-amber-800/90">
          First 500 shown — refine filter.
        </p>
      ) : null}

      <div className="flex items-center gap-2 border-b border-neutral-100 px-2 pb-1.5">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          disabled={slice.length === 0}
          onCheckedChange={(c) => {
            if (Boolean(c))
              onSelectAllMatching(filtered.map((r) => r.listing_sku));
            else onClearSelection();
          }}
          aria-label="Select all filtered unmapped SKUs"
        />
        <Label className="text-[11px] text-neutral-500">Select all filtered</Label>
      </div>

      <ScrollArea className="max-h-[min(280px,38vh)]">
        <div className="divide-y divide-neutral-100 bg-white">
          {slice.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-neutral-400">
              No rows match filters.
            </p>
          ) : (
            slice.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50/80"
              >
                <Checkbox
                  checked={Boolean(selected[row.listing_sku])}
                  onCheckedChange={() => onToggle(row.listing_sku)}
                  aria-label={`Select ${row.listing_sku}`}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-800">
                  {row.listing_sku}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
