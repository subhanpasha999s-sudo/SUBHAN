"use client";
/**
 * Orders module data-viz (V4 rebuild): KPI strip + order-class donut +
 * monthly orders trend. All counts come from Order Data only.
 */
import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useV2 } from "@/book/lib/v2/store";
import { financialBuckets, ordersByMonth, ordersOverview } from "@/book/lib/v2/derived";
import { Card, StatCard, cn } from "@/book/components/ui";
import { ANIM, axis, CHART, ChartLegend, ChartTooltip, DonutCenter, grid } from "@/book/components/v2/charts";
import { formatINR, formatINRCompact, formatPct } from "@/book/lib/engine";

const CLASS_COLOR: Record<string, string> = {
  DELIVERED: "#16a34a", EXCHANGE: "#0ea5e9", CLAIM: "#14b8a6", LOST: "#7c3aed",
  RETURN: "#ef4444", RTO: "#f59e0b", CANCELLED: "#94a3b8",
};

export function OrdersOverview() {
  const { state } = useV2();
  const kpi = useMemo(() => ordersOverview(state), [state]);
  const buckets = useMemo(() => financialBuckets(state).filter((b) => b.count > 0), [state]);
  const months = useMemo(() => ordersByMonth(state), [state]);

  const donut = buckets.map((b) => ({ name: b.label, key: b.key, value: b.count, net: b.net }));

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total orders" value={kpi.total.toLocaleString("en-IN")} />
        <StatCard label="Delivered" value={formatPct(kpi.deliveredPct)} sub={`${kpi.delivered.toLocaleString("en-IN")} orders`} tone="success" />
        <StatCard label="Return rate" value={formatPct(kpi.returnRatePct)} tone={kpi.returnRatePct > 15 ? "danger" : kpi.returnRatePct > 10 ? "warning" : "success"} />
        <StatCard label="Net payout" value={formatINR(kpi.netPayout, true)} tone={kpi.netPayout >= 0 ? "success" : "danger"} />
        <StatCard label="Avg settle time" value={kpi.avgSettleDays === null ? "—" : `${kpi.avgSettleDays} days`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Class donut */}
        <Card className="p-5">
          <h3 className="mb-4 font-semibold">Order breakdown</h3>
          <div className="relative h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} strokeWidth={0} {...ANIM}>
                  {donut.map((d) => <Cell key={d.key} fill={CLASS_COLOR[d.key] ?? CHART.neutral} />)}
                </Pie>
                <Tooltip
                  content={<ChartTooltip
                    hideLabel
                    valueFormatter={(v, item) => `${v} orders · ${formatINR((item.payload as { net?: number })?.net ?? 0, true)} net`}
                  />}
                />
              </PieChart>
            </ResponsiveContainer>
            <DonutCenter value={kpi.total.toLocaleString("en-IN")} label="orders" />
          </div>
          <ChartLegend
            className="mt-3"
            items={donut.map((d) => ({ label: d.name, color: CLASS_COLOR[d.key] ?? CHART.neutral, value: d.value }))}
          />
        </Card>

        {/* Monthly trend */}
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Orders by month</h3>
            <ChartLegend items={[
              { label: "Delivered", color: CHART.success },
              { label: "Returns + RTO", color: CHART.danger },
            ]} />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} barSize={26} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="month" {...axis} dy={4} />
                <YAxis {...axis} width={32} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={<ChartTooltip valueFormatter={(v, item) => `${v} ${item.dataKey === "delivered" ? "delivered" : "returns + RTO"}`} />}
                />
                <Bar dataKey="delivered" name="Delivered" stackId="a" fill={CHART.success} {...ANIM} />
                <Bar dataKey="returns" name="Returns + RTO" stackId="a" fill={CHART.danger} radius={[4, 4, 0, 0]} {...ANIM} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {months.map((m) => (
              <span key={m.month} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
                <span className="font-medium">{m.month}</span>
                <span className={cn("tabular-nums", m.net < 0 ? "text-danger" : "text-muted-foreground")}>{formatINRCompact(m.net)} net</span>
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
