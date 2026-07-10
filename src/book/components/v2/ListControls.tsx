"use client";
/**
 * Shared list controls (daily-use ergonomics) — a search box and status filter
 * chips used across the Sales/Purchases list screens for a consistent,
 * Zoho-style "find it fast" experience.
 */
import { useState } from "react";
import { Search, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/book/components/ui";

export function SearchBox({ value, onChange, placeholder = "Search…", className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-xs", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary"
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export interface ChipOption { value: string; label: string; count?: number; tone?: "default" | "warning" | "danger" | "success" }

export function FilterChips({ options, active, onChange }: {
  options: ChipOption[]; active: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = active === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("tabular-nums", on ? "opacity-80" : "text-muted-foreground")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Case-insensitive "does any field contain the needle" helper for row filters. */
export function matchesQuery(needle: string, ...fields: (string | number | undefined | null)[]): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f ?? "").toLowerCase().includes(q));
}

// ── Sorting ───────────────────────────────────────────────────────────

export type SortDir = "asc" | "desc";

/** Column-sort state + a stable sorter given per-key accessors. */
export function useSort<T>(defaultKey: string, defaultDir: SortDir = "desc") {
  const [key, setKey] = useState(defaultKey);
  const [dir, setDir] = useState<SortDir>(defaultDir);
  const toggle = (k: string) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("asc"); }
  };
  const sort = (rows: T[], accessors: Record<string, (r: T) => string | number>): T[] => {
    const acc = accessors[key];
    if (!acc) return rows;
    return [...rows].sort((a, b) => {
      const av = acc(a), bv = acc(b);
      const c = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "asc" ? c : -c;
    });
  };
  return { key, dir, toggle, sort };
}

/** A clickable <th> that shows the active sort direction. */
export function SortHeader({ label, sortKey, active, dir, onSort, align = "left", className }: {
  label: string; sortKey: string; active: string; dir: SortDir; onSort: (k: string) => void;
  align?: "left" | "right"; className?: string;
}) {
  const on = active === sortKey;
  return (
    <th className={cn("px-3 py-2", align === "right" && "text-right", className)}>
      <button onClick={() => onSort(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "flex-row-reverse")}>
        {label}
        {on ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}
