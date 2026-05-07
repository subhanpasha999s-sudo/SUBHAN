"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { MappingStatusFilter } from "@/types/sku-mapping-module";
import { cn } from "@/lib/utils";

function formatSyncedLabel(iso: string | null): string {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export type WorkspaceAutosaveState =
  | "idle"
  | "syncing"
  | "saved"
  | "error"
  | "offline";

export function SkuMappingWorkspaceToolbar({
  total,
  mapped,
  remaining,
  completedPercent,
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  autosaveState,
  autosaveMessage,
  lastSyncedAtForMappings,
}: {
  total: number;
  mapped: number;
  remaining: number;
  completedPercent: number;
  searchValue: string;
  onSearchChange: (v: string) => void;
  statusFilter: MappingStatusFilter;
  onStatusFilterChange: (f: MappingStatusFilter) => void;
  autosaveState: WorkspaceAutosaveState;
  autosaveMessage?: string | null;
  lastSyncedAtForMappings: string | null;
}) {
  const chip = cn(
    "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
    "border border-border/80 bg-muted/35 text-foreground shadow-sm hover:bg-muted/55"
  );
  const chipActive = cn(
    "rounded-full px-3 py-1 text-[12px] font-semibold ring-2 ring-primary ring-offset-2 ring-offset-background",
    "border border-primary bg-primary/10 text-foreground"
  );

  const statusLabel =
    autosaveState === "syncing"
      ? "Syncing Tulmin workspace…"
      : autosaveState === "saved"
        ? "Changes synced"
        : autosaveState === "offline"
          ? "Working offline · using local cache"
          : autosaveState === "error"
            ? autosaveMessage || "Could not sync · changes kept on device"
            : "Auto-save on";

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-card p-4 shadow-elevate-xs sm:p-5">
      {/* Progress */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] tabular-nums">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Total
              </p>
              <p className="font-semibold text-foreground">
                {total.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Matched
              </p>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                {mapped.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Remaining
              </p>
              <p className="font-semibold text-amber-800 dark:text-amber-400">
                {remaining.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-4 text-[11px] tabular-nums text-muted-foreground">
              <span>Mapping progress</span>
              <span className="font-medium text-foreground">
                {Math.round(completedPercent)}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted shadow-inner"
              role="progressbar"
              aria-valuenow={Math.round(completedPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/95 to-primary shadow-sm transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{
                  width: `${Math.min(100, Math.max(0, completedPercent))}%`,
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <Badge
            variant="outline"
            className={cn(
              "border-border/70 bg-muted/30 font-medium normal-case tracking-normal",
              autosaveState === "syncing" && "animate-pulse"
            )}
          >
            {autosaveState === "syncing" ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                {statusLabel}
              </>
            ) : (
              statusLabel
            )}
          </Badge>
          <p className="text-[11px] text-muted-foreground">
            Mapping last synced:{" "}
            <span className="tabular-nums text-foreground/90">
              {formatSyncedLabel(lastSyncedAtForMappings)}
            </span>
          </p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Search listing or master SKU
          </p>
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Type to narrow rows…"
            className="h-10 rounded-md border-input bg-background text-[13px]"
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Filter
          </span>
          {(
            [
              ["all", "All"] as const,
              ["mapped", "Matched"] as const,
              ["unmapped", "SKU Missing"] as const,
            ] satisfies readonly [MappingStatusFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onStatusFilterChange(key)}
              className={
                statusFilter === key ? chipActive : chip
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
