"use client";

import { Loader2, Tag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface SkuMappingBulkToolbarProps {
  filteredCount: number;
  selectedCount: number;
  busy: boolean;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onAssignToMaster: () => void;
  onCreateMaster: () => void;
  onClearMapping: () => void;
}

export function SkuMappingBulkToolbar({
  filteredCount,
  selectedCount,
  busy,
  onSelectAllFiltered,
  onClearSelection,
  onAssignToMaster,
  onCreateMaster,
  onClearMapping,
}: SkuMappingBulkToolbarProps) {
  if (filteredCount === 0) return null;

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-[#dbe4ee] bg-[#f0f6ff] px-3 py-2 shadow-sm sm:px-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-[#c9d9ec] bg-white text-[11px] font-semibold text-[#1868DB]"
          disabled={busy || filteredCount === 0}
          onClick={onSelectAllFiltered}
        >
          Select all filtered ({filteredCount.toLocaleString()})
        </Button>
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#dbe4ee] pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
          <span className="text-xs font-bold tabular-nums text-[#17324d]">
            {selectedCount.toLocaleString()} selected
          </span>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1 bg-[#1868DB] px-3 text-[11px] font-semibold text-white hover:bg-[#1356b8] disabled:opacity-40"
            disabled={busy}
            onClick={onAssignToMaster}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Tag className="size-3.5" aria-hidden />
            )}
            Assign to SKU
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-[#15803d] bg-[#f0fdf4] px-3 text-[11px] font-semibold text-[#166534] hover:bg-[#dcfce7]"
            disabled={busy}
            onClick={onCreateMaster}
          >
            Create new SKU
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 border-amber-300 bg-amber-50 px-3 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-40"
            disabled={busy}
            onClick={onClearMapping}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Clear mapping
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-[11px] font-medium text-[#475569]"
            disabled={busy}
            onClick={onClearSelection}
          >
            Clear selection
          </Button>
        </div>
      ) : null}
    </div>
  );
}
