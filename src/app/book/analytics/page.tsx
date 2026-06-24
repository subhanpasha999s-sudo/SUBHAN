"use client";
/** Growth & analytics — leaderboards, trends, business health. */
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useV2 } from "@/book/lib/v2/store";
import { healthCard, monthlyTrends, skuAggregates, stateAggregates } from "@/book/lib/v2/derived";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Card, StatCard, cn } from "@/book/components/ui";
import { ANIM, axis, CHART, ChartLegend, ChartTooltip, grid } from "@/book/components/v2/charts";
import { formatINR, formatINRCompact, formatPct } from "@/book/lib/engine";

function Leaderboard({ title, rows, tone }: {
  title: string;
  rows: { label: string; value: string; sub?: string }[];
  tone?: "danger" | "warning";
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</div>
      <div className="divide-y divide-border text-sm">
        {rows.length === 0 && <p className="px-4 py-5 text-center text-xs text-muted-foreground">No data.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2">
            <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {r.sub && <span className="text-xs text-muted-foreground">{r.sub}</span>}
            <span className={cn("tabular-nums font-medium", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { state } = useV2();
  const aggs = useMemo(() => skuAggregates(state), [state]);
  const states = useMemo(() => stateAggregates(state), [state]);
  const trends = useMemo(() => monthlyTrends(state), [state]);
  const health = useMemo(() => healthCard(state), [state]);

  const top = (n: number) => (xs: typeof aggs) => xs.slice(0, n);
  const t10 = top(10);

  return (
    <Guard section="analytics">
      <PageHeader title="Analytics" sub="Across all uploaded months" />

      {/* Business health */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
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

      {/* Trends */}
      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Revenue & true net profit by month</h3>
          <ChartLegend items={[
            { label: "Revenue", color: CHART.revenue },
            { label: "True net", color: CHART.profit },
          ]} />
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.revenue} stopOpacity={0.18} />
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
              <Line dataKey="revenue" name="Revenue" stroke={CHART.revenue} strokeWidth={2.5}
                dot={false} activeDot={{ r: 4, strokeWidth: 0 }} {...ANIM} />
              <Line dataKey="trueNet" name="True net" stroke={CHART.profit} strokeWidth={2.5}
                dot={false} activeDot={{ r: 4, strokeWidth: 0 }} {...ANIM} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {trends.map((t) => (
            <span key={t.month} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
              <span className="font-medium">{t.month}</span>
              <span className="text-muted-foreground">margin {formatPct(t.marginPct)}</span>
              <span className="text-muted-foreground">· returns {formatPct(t.returnRatePct)}</span>
            </span>
          ))}
        </div>
      </Card>

      {/* Leaderboards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Leaderboard
          title="🏆 Top selling (units)"
          rows={t10([...aggs].sort((a, b) => b.units - a.units)).map((a) => ({ label: a.skuCode, value: String(a.units) }))}
        />
        <Leaderboard
          title="💰 Top profit makers"
          rows={t10([...aggs].sort((a, b) => b.profit - a.profit)).map((a) => ({ label: a.skuCode, value: formatINR(a.profit, true) }))}
        />
        <Leaderboard
          title="🔻 Loss-making products"
          tone="danger"
          rows={t10(aggs.filter((a) => a.profit < 0).sort((a, b) => a.profit - b.profit)).map((a) => ({ label: a.skuCode, value: formatINR(a.profit, true) }))}
        />
        <Leaderboard
          title="⚠️ Lowest margins"
          tone="warning"
          rows={t10(aggs.filter((a) => a.revenue > 0).sort((a, b) => a.marginPct - b.marginPct)).map((a) => ({ label: a.skuCode, value: formatPct(a.marginPct) }))}
        />
        <Leaderboard
          title="↩️ Most returned"
          tone="danger"
          rows={t10([...aggs].sort((a, b) => b.returnRatePct - a.returnRatePct)).map((a) => ({ label: a.skuCode, value: formatPct(a.returnRatePct), sub: `${a.returns} returns` }))}
        />
        <Leaderboard
          title="🗺️ Top revenue states"
          rows={[...states].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((s) => ({
            label: s.state, value: formatINR(s.revenue, true), sub: `${s.orders} orders`,
          }))}
        />
        <Leaderboard
          title="🚚 Highest-RTO states"
          tone="warning"
          rows={[...states].filter((s) => s.orders >= 5).sort((a, b) => b.rtoPct - a.rtoPct).slice(0, 10).map((s) => ({
            label: s.state, value: formatPct(s.rtoPct), sub: `${s.rtoCount}/${s.orders}`,
          }))}
        />
      </div>
    </Guard>
  );
}
