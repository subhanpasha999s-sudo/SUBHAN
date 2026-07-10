"use client";
/**
 * Shared list controls (daily-use ergonomics) — a search box and status filter
 * chips used across the Sales/Purchases list screens for a consistent,
 * Zoho-style "find it fast" experience.
 */
import { Search, X } from "lucide-react";
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
