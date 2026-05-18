"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";

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
    "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
    "border border-border/70 bg-background/55 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
  );
  const chipActive = cn(
    "rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-sm",
    "border border-primary/65 bg-primary text-primary-foreground"
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
    <div className="rounded-2xl border border-border/70 bg-muted/18 p-4 shadow-elevate-xs sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.78fr)_minmax(360px,1fr)] xl:items-end">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-foreground">
                Mapping progress
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {mapped.toLocaleString()} of {total.toLocaleString()} listings assigned
              </p>
            </div>
            <div className="text-right text-[22px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
              {Math.round(completedPercent)}%
            </div>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-background shadow-inner"
            role="progressbar"
            aria-valuenow={Math.round(completedPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/95 to-emerald-400 shadow-sm transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{
                width: `${Math.min(100, Math.max(0, completedPercent))}%`,
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] tabular-nums">
            <span className="rounded-full border border-border/70 bg-background/55 px-2.5 py-1 text-muted-foreground">
              Total <span className="font-semibold text-foreground">{total.toLocaleString()}</span>
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-50">
              Matched <span className="font-semibold">{mapped.toLocaleString()}</span>
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-50">
              Open <span className="font-semibold">{remaining.toLocaleString()}</span>
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search listing or master SKU"
                className="h-11 rounded-xl border-border/80 bg-background/70 pl-9 text-[13px] shadow-sm"
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {(
                [
                  ["all", "All"] as const,
                  ["mapped", "Matched"] as const,
                  ["unmapped", "Open"] as const,
                ] satisfies readonly [MappingStatusFilter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onStatusFilterChange(key)}
                  className={statusFilter === key ? chipActive : chip}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center rounded-full border border-border/70 bg-background/55 px-2.5 py-1 font-medium",
                autosaveState === "syncing" && "text-primary"
              )}
            >
              {autosaveState === "syncing" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : null}
              {statusLabel}
            </span>
            <span>
              Last sync{" "}
              <span className="tabular-nums text-foreground/90">
                {formatSyncedLabel(lastSyncedAtForMappings)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
