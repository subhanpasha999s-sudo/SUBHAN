"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";

import { useRuntimePerformanceProfile } from "@/hooks/use-runtime-performance-profile";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { SkuSpreadsheetRowModel } from "@/types/sku-mapping-module";
import type { MasterSkuRecord } from "@/types/sku-map";

const ROW_H = 44;

function StatusBadge({ status }: { status: SkuSpreadsheetRowModel["status"] }) {
  if (status === "mapped") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-300 bg-emerald-50 text-[10px] font-semibold uppercase tracking-wide text-emerald-900"
      >
        Mapped SKU
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-300 bg-amber-50 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
    >
      SKU Missing
    </Badge>
  );
}

function MappingRow({
  row,
  selected,
  saving,
  checkboxDisabled,
  remoteAvailable,
  onToggleSelect,
  onCommitMaster,
}: {
  row: SkuSpreadsheetRowModel;
  selected: boolean;
  saving: boolean;
  checkboxDisabled?: boolean;
  /** When false, edits still save — only changes placeholder copy (local vs cloud). */
  remoteAvailable?: boolean;
  onToggleSelect: (on: boolean) => void;
  onCommitMaster: (listingSku: string, masterNameOrEmpty: string) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState(row.master_name ?? "");

  React.useEffect(() => {
    setDraft(row.master_name ?? "");
  }, [row.master_name, row.listing_sku]);

  async function onBlurSave() {
    const next = draft.trim();
    const prev = (row.master_name ?? "").trim();
    if (next === prev) return;
    await onCommitMaster(row.listing_sku, next);
  }

  const cell =
    "h-9 border border-[#cbd5e1] bg-white font-mono text-[13px] text-[#0f172a] shadow-none focus-visible:border-[#1868DB] focus-visible:ring-1 focus-visible:ring-[#1868DB]/25";

  return (
    <div
      role="row"
      className={
        row.status === "unmapped"
          ? "grid grid-cols-[40px_minmax(120px,1fr)_minmax(200px,1.2fr)_112px] items-center gap-0 border-b border-slate-100 bg-amber-50/30 hover:bg-amber-50/50"
          : "grid grid-cols-[40px_minmax(120px,1fr)_minmax(200px,1.2fr)_112px] items-center gap-0 border-b border-slate-100 bg-white hover:bg-slate-50/90"
      }
    >
      <div className="flex w-10 shrink-0 justify-center px-1 py-1.5">
        <Checkbox
          aria-label={`Select ${row.listing_sku}`}
          checked={selected}
          disabled={checkboxDisabled}
          onCheckedChange={(c) => onToggleSelect(Boolean(c))}
        />
      </div>
      <div className="min-w-0 truncate px-2 py-1.5 font-mono text-[13px] font-medium text-[#17324d]">
        {row.listing_sku}
      </div>
      <div className="min-w-0 px-2 py-1.5">
        <div className="flex items-center gap-2">
          <Input
            aria-label={`SKU for ${row.listing_sku}`}
            className={`min-w-0 flex-1 ${cell}`}
            value={draft}
            disabled={saving || checkboxDisabled}
            placeholder={
              remoteAvailable
                ? "Type or pick SKU…"
                : "Type SKU — saved on this device"
            }
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void onBlurSave()}
            list="sku-mapping-master-names"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
          {saving ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-[#1868DB]" aria-hidden />
          ) : null}
        </div>
      </div>
      <div className="px-2 py-1.5">
        <StatusBadge status={row.status} />
      </div>
    </div>
  );
}

export interface SkuMappingTableProps {
  rows: SkuSpreadsheetRowModel[];
  masters: MasterSkuRecord[];
  selectedIds: Record<string, true>;
  savingListingSku: string | null;
  globalBusy: boolean;
  remoteAvailable?: boolean;
  onToggleSelect: (listingSku: string, on: boolean) => void;
  onCommitMaster: (listingSku: string, masterNameOrEmpty: string) => Promise<void>;
}

export function SkuMappingTable({
  rows,
  masters,
  selectedIds,
  savingListingSku,
  globalBusy,
  remoteAvailable,
  onToggleSelect,
  onCommitMaster,
}: SkuMappingTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const perf = useRuntimePerformanceProfile();
  const vt = perf.skuTableVirtual;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: vt.overscan,
    useAnimationFrameWithResizeObserver: vt.useAnimationFrameWithResizeObserver,
  });

  return (
    <div className="overflow-hidden rounded-lg border border-[#dbe4ee] bg-white">
      <datalist id="sku-mapping-master-names">
        {masters.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      <div
        role="rowgroup"
        className="grid grid-cols-[40px_minmax(120px,1fr)_minmax(200px,1.2fr)_112px] items-center border-b border-[#dbe4ee] bg-[#fafbfc] px-0 py-2 text-left"
      >
        <div className="flex w-10 shrink-0 items-center justify-center" aria-label="Select rows">
          <span className="sr-only">Select</span>
        </div>
        <div className="min-w-0 px-3 text-[11px] font-bold uppercase tracking-wide text-[#475569]">
          Listing SKU
        </div>
        <div className="min-w-0 px-3 text-[11px] font-bold uppercase tracking-wide text-[#475569]">
          SKU
        </div>
        <div className="min-w-0 px-3 text-[11px] font-bold uppercase tracking-wide text-[#475569]">
          Status
        </div>
      </div>

      <div
        ref={parentRef}
        className="max-h-[min(70vh,640px)] overflow-auto"
        role="rowgroup"
      >
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#64748b]">
            No rows match filters.
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              if (!row) return null;
              return (
                <div
                  key={row.listing_sku}
                  className="virtual-row absolute left-0 top-0 w-full"
                  style={{
                    height: `${vi.size}px`,
                    transform: `translate3d(0, ${vi.start}px, 0)`,
                  }}
                >
                  <MappingRow
                    row={row}
                    selected={Boolean(selectedIds[row.listing_sku])}
                    saving={savingListingSku === row.listing_sku}
                    checkboxDisabled={globalBusy}
                    remoteAvailable={remoteAvailable}
                    onToggleSelect={(on) => onToggleSelect(row.listing_sku, on)}
                    onCommitMaster={onCommitMaster}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rows.length > 0 ? (
        <p className="border-t border-[#eef2f6] px-3 py-2 text-[11px] tabular-nums text-[#64748b]">
          {rows.length.toLocaleString()} row(s) · virtual scroll
        </p>
      ) : null}
    </div>
  );
}
