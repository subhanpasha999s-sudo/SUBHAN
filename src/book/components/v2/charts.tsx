"use client";
/**
 * Shared chart toolkit — consistent, legible recharts styling across the app.
 *
 * Goals: less ink, clearer hierarchy. Hidden axis/tick lines, a single set of
 * faint horizontal gridlines, one polished tooltip, legend chips, and helpers
 * for value labels + donut centres. Import these instead of hand-rolling
 * tooltip/axis props per page so every chart reads the same way.
 */
import type { ReactNode } from "react";

// ── Palette ──────────────────────────────────────────────────────────────
// Semantic, colour-blind-friendlier set. Reuse these so the same concept gets
// the same colour everywhere (revenue = blue, profit = violet, loss = red…).
export const CHART = {
  revenue: "#0ea5e9",
  profit:  "#7c3aed",
  success: "#16a34a",
  warning: "#f59e0b",
  danger:  "#ef4444",
  cogs:    "#f97316",
  neutral: "#94a3b8",
  ads:     "#eab308",
} as const;

// ── Shared axis / grid props ───────────────────────────────────────────────
export const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const grid = {
  strokeDasharray: "2 6",
  stroke: "var(--border)",
  vertical: false,
} as const;

/** Consistent, slightly slower reveal so chart growth reads as intentional. */
export const ANIM = { isAnimationActive: true, animationDuration: 850, animationEasing: "ease-out" } as const;

// ── Tooltip ─────────────────────────────────────────────────────────────
interface TooltipItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  /** Format each series value (e.g. INR). */
  valueFormatter?: (v: number, item: TooltipItem) => ReactNode;
  /** Format the header label (e.g. month). */
  labelFormatter?: (l: string | number) => ReactNode;
  /** Hide the header row (single-series charts). */
  hideLabel?: boolean;
}

/**
 * Drop-in clean tooltip: `<Tooltip content={<ChartTooltip valueFormatter={…} />} />`.
 * Recharts injects active/payload/label at render time.
 */
export function ChartTooltip({
  active, payload, label, valueFormatter, labelFormatter, hideLabel,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[8rem] rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {!hideLabel && label != null && label !== "" && (
        <p className="mb-1.5 font-semibold text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => {
          const swatch = p.color ?? (p.payload?.fill as string | undefined) ?? "var(--muted-foreground)";
          const v = Number(p.value ?? 0);
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: swatch }} />
              {p.name != null && p.name !== "" && (
                <span className="text-muted-foreground">{p.name}</span>
              )}
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {valueFormatter ? valueFormatter(v, p) : p.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Legend chips ───────────────────────────────────────────────────────
export function ChartLegend({
  items, className = "",
}: { items: { label: string; color: string; value?: string | number }[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs ${className}`}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
          <span className="text-muted-foreground">{it.label}</span>
          {it.value != null && <span className="font-medium tabular-nums text-foreground">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

// ── Donut centre overlay ──────────────────────────────────────────────────
/** Absolutely-centred label for a donut chart. Wrap the chart in `relative`. */
export function DonutCenter({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-2xl font-bold tabular-nums leading-none">{value}</span>
      <span className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
