"use client";
/** Analytics — business health, trend, and clean visual breakdowns. */
import { useMemo } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { useV2 } from "@/book/lib/v2/store";
import { healthCard, monthlyTrends, skuAggregates, stateAggregates } from "@/book/lib/v2/derived";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Card, StatCard } from "@/book/components/ui";
import { ANIM, axis, CHART, ChartLegend, ChartTooltip, grid } from "@/book/components/v2/charts";
import { formatINR, formatINRCompact, formatPct } from "@/book/lib/engine";

type BarRow = { label: string; sub?: string; raw: number; value: string };

/** Tremor-style bar list — a ranked row with an inline magnitude bar. Clean,
 *  scannable, and far less noisy than a wall of separate cards. */
function BarList({ rows, color, empty = "No data yet" }: { rows: BarRow[]; color: string; empty?: string }) {
  if (rows.length === 0) {
    return <p className="px-1 py-8 text-center text-xs text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.raw)), 1);
  return (
    <div className="space-y-0.5">
      {rows.map((r, i) => (
        <div key={i} className="relative flex items-center gap-3 overflow-hidden rounded-lg px-2.5 py-2">
          <span
            aria-hidden
            className="absolute inset-y-1 left-0 rounded-md"
            style={{ width: `${Math.max(2, (Math.abs(r.raw) / max) * 100)}%`, background: color, opacity: 0.14 }}
          />
          <span className="relative z-10 w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
          {r.sub && <span className="relative z-10 shrink-0 text-xs text-muted-foreground">{r.sub}</span>}
          <span className="relative z-10 shrink-0 text-sm font-semibold tabular-nums" style={{ color }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </Card>
  );
}

export default function AnalyticsPage() {
  const { state } = useV2();
  const aggs = useMemo(() => skuAggregates(state), [state]);
  const states = useMemo(() => stateAggregates(state), [state]);
  const trends = useMemo(() => monthlyTrends(state), [state]);
  const health = useMemo(() => healthCard(state), [state]);

  const label = (a: { skuCode: string; productName: string }) => a.productName?.trim() || a.skuCode;

  // ranked, pre-sliced views for the bar lists
  const lists = useMemo(() => {
    const byProfit = [...aggs].sort((a, b) => b.profit - a.profit);
    return {
      topProfit: byProfit.filter((a) => a.profit > 0).slice(0, 7)
        .map((a) => ({ label: label(a), raw: a.profit, value: formatINR(a.profit, true) })),
      bestSellers: [...aggs].sort((a, b) => b.units - a.units).slice(0, 7)
        .map((a) => ({ label: label(a), raw: a.units, value: a.units.toLocaleString("en-IN") })),
      byState: [...states].sort((a, b) => b.revenue - a.revenue).slice(0, 7)
        .map((s) => ({ label: s.state, sub: `${s.orders} ord`, raw: s.revenue, value: formatINRCompact(s.revenue) })),
      lossMaking: byProfit.filter((a) => a.profit < 0).reverse().slice(0, 6)
        .map((a) => ({ label: label(a), raw: a.profit, value: formatINR(a.profit, true) })),
      mostReturned: [...aggs].filter((a) => a.returns > 0).sort((a, b) => b.returnRatePct - a.returnRatePct).slice(0, 6)
        .map((a) => ({ label: label(a), sub: `${a.returns} ret`, raw: a.returnRatePct, value: formatPct(a.returnRatePct) })),
    };
  }, [aggs, states]);

  const isEmpty = trends.length === 0 && aggs.length === 0;

  return (
    <Guard section="analytics">
      <PageHeader title="Analytics" sub="Across all uploaded months" />

      {isEmpty ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BarChart3 className="size-6" /></span>
          <div>
            <p className="text-base font-bold">Analytics unlock after your first import</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Import your Meesho order &amp; payment files to see growth trends, your best and worst products, and where your sales come from.
            </p>
          </div>
          <Link href="/book/integrations" className="mt-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Upload data
          </Link>
        </Card>
      ) : (
        <>
          {/* Business health KPIs */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Monthly growth"
              value={health.growthPct === null ? "—" : `${health.growthPct >= 0 ? "+" : ""}${health.growthPct.toFixed(0)}%`}
              tone={health.growthPct === null ? "default" : health.growthPct >= 0 ? "success" : "danger"}
            />
            <StatCard label="Profit / order" value={formatINR(health.profitPerOrder)} />
            <StatCard label="Avg order value" value={formatINR(health.avgOrderValue)} />
            <StatCard label="Settlement cycle" value={health.settlementCycleDays === null ? "—" : `${health.settlementCycleDays.toFixed(0)} days`} />
            <StatCard label="Stock turnover" value={health.stockTurnover === null ? "—" : `${health.stockTurnover.toFixed(1)}x/yr`} />
          </div>

          {/* Hero trend */}
          <Card className="mb-6 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Revenue &amp; true net profit</h3>
                <p className="text-xs text-muted-foreground">Monthly, accrual basis</p>
              </div>
              <ChartLegend items={[
                { label: "Revenue", color: CHART.revenue },
                { label: "True net", color: CHART.profit },
              ]} />
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trends} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="aRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.revenue} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={CHART.revenue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="month" {...axis} dy={4} />
                  <YAxis {...axis} tickFormatter={(v: number) => formatINRCompact(v)} width={56} />
                  <Tooltip
                    cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                    content={<ChartTooltip valueFormatter={(v) => formatINR(v)} />}
                  />
                  <Area dataKey="revenue" name="Revenue" stroke={CHART.revenue} strokeWidth={2.5}
                    fill="url(#aRevenue)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} {...ANIM} />
                  <Line dataKey="trueNet" name="True net" stroke={CHART.profit} strokeWidth={2.5}
                    dot={false} activeDot={{ r: 4, strokeWidth: 0 }} {...ANIM} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top performers */}
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Panel title="Top products by profit" hint="net ₹">
              <BarList rows={lists.topProfit} color={CHART.success} empty="No profitable products yet" />
            </Panel>
            <Panel title="Best sellers" hint="units">
              <BarList rows={lists.bestSellers} color={CHART.revenue} empty="No sales yet" />
            </Panel>
          </div>

          {/* Geography + watchlist */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Revenue by state" hint="top 7">
              <BarList rows={lists.byState} color={CHART.revenue} empty="No location data yet" />
            </Panel>
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Needs attention</h3>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Loss-making products</p>
              <BarList rows={lists.lossMaking} color={CHART.danger} empty="None — every product is profitable 🎉" />
              <div className="my-4 h-px bg-border" />
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Most returned</p>
              <BarList rows={lists.mostReturned} color={CHART.warning} empty="No returns recorded" />
            </Card>
          </div>
        </>
      )}
    </Guard>
  );
}
