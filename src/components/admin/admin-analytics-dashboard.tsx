"use client";

import * as React from "react";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  IndianRupee,
  LockKeyhole,
  RefreshCw,
  Repeat2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";

type TrendPoint = { date: string; value?: number; labels?: number };

type AnalyticsPayload = {
  generatedAt: string;
  identity: { primary: string; fallback: string; note: string };
  metrics: {
    totalRevenue: number;
    mrr: number;
    arr: number;
    activeSubscribers: number;
    freeUsers: number;
    paidUsers: number;
    totalUsers: number;
    trialUsers: number;
    churnRate: number;
    conversionRate: number;
    retentionRate: number;
    revenueGrowth: number;
    arpu: number;
    ltv: number;
    failedPayments: number;
    renewalsDue: number;
    newUsersToday: number;
    newUsersMonth: number;
    activeUsers: number;
    labelsProcessed: number;
    labelsThisMonth: number;
  };
  revenue: {
    planWiseRevenue: Record<string, number>;
    daily: TrendPoint[];
  };
  users: {
    growth: TrendPoint[];
    planMix: Record<string, number>;
  };
  usage: {
    dailyLabels: TrendPoint[];
    topCustomers: { user: string; userId: string; labels: number }[];
    mostUsedFeatures: { feature: string; count: number }[];
  };
  billing: {
    failedPayments: { user: string; plan: string | null; amount: number; reason: string; createdAt: string | null }[];
    renewals: { user: string; plan: string; renewalDate: string | null; daysLeft: number | null }[];
    refundsOrCancellations: { user: string; plan: string | null; status: string | null; amount: number; createdAt: string | null }[];
  };
  recentActivity: { user: string; userId: string; action: string; labels: number; createdAt: string | null }[];
};

function num(value: number) {
  return value.toLocaleString("en-IN");
}

function money(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function pct(value: number) {
  return `${Number.isFinite(value) ? value : 0}%`;
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "No date";
}

function Metric({
  label,
  value,
  helper,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone?: "blue" | "green" | "amber" | "rose";
}) {
  const tones = {
    blue: "border-[#6f82ff]/25 bg-[#6f82ff]/12 text-[#b9c3ff]",
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    rose: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  };

  return (
    <section className="rounded-lg border border-white/10 bg-[#0e141f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <span className={`grid size-9 shrink-0 place-items-center rounded-md border ${tones[tone]}`}>
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-400">{helper}</p>
    </section>
  );
}

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0e141f] p-4">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {eyebrow ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{eyebrow}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MiniBars({ data, valueKey, tone = "bg-[#6f82ff]" }: { data: TrendPoint[]; valueKey: "value" | "labels"; tone?: string }) {
  const max = Math.max(1, ...data.map((point) => Number(point[valueKey]) || 0));
  return (
    <div className="mt-5 flex h-44 items-end gap-2">
      {data.length === 0 ? (
        <p className="m-auto text-sm text-slate-500">No data yet.</p>
      ) : (
        data.map((point) => {
          const value = Number(point[valueKey]) || 0;
          return (
            <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
              <div className={`w-full rounded-t ${tone}`} style={{ height: `${Math.max(4, (value / max) * 100)}%` }} />
              <span className="text-[10px] text-slate-600">{point.date.slice(5)}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

function Row({
  left,
  right,
  sub,
}: {
  left: string;
  right: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-3 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-300">{left}</p>
        {sub ? <p className="truncate text-xs text-slate-500">{sub}</p> : null}
      </div>
      <p className="shrink-0 text-sm font-bold text-white">{right}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-32 animate-pulse rounded-lg border border-white/10 bg-white/[0.06]" />
      ))}
    </div>
  );
}

export function AdminAnalyticsDashboard() {
  const [data, setData] = React.useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load analytics.");
      setData(json as AnalyticsPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const maxPlanRevenue = Math.max(1, ...(data ? Object.values(data.revenue.planWiseRevenue) : [1]));
  const totalPlanUsers = Math.max(1, ...(data ? [Object.values(data.users.planMix).reduce((sum, count) => sum + count, 0)] : [1]));

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="border-b border-white/10 bg-[#0b0f17]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8fa8ff]">Tulmin Admin</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">SaaS health</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav />
            <Button className="h-9 rounded-md" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Business overview</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Revenue, subscriptions, usage, billing risk, and customer growth in one simple operating view.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-[#0e141f] px-3 py-2 text-xs font-semibold text-slate-400">
            Refreshes every 60s
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-400/20 bg-[#1a0f13] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md border border-red-400/20 bg-red-400/10 text-red-100">
                  <LockKeyhole className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-red-50">{error}</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-red-100/62">
                    Sign in with an allowlisted admin account to unlock SaaS analytics.
                  </p>
                </div>
              </div>
              <Link href="/admin/login" className="inline-flex h-9 items-center justify-center rounded-md bg-[#335cff] px-3 text-sm font-semibold text-white">
                Admin login
              </Link>
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          {loading && !data ? (
            <Skeleton />
          ) : data ? (
            <div className="space-y-5">
              <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-lg border border-[#6f82ff]/25 bg-[#101827] p-5 shadow-[0_24px_80px_-64px_rgb(51_92_255/0.9)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8fa8ff]">Revenue command center</p>
                      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-400">MRR</p>
                          <p className="mt-1 text-4xl font-semibold tracking-tight">{money(data.metrics.mrr)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-400">ARR</p>
                          <p className="mt-1 text-2xl font-semibold tracking-tight">{money(data.metrics.arr)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-400">Total revenue</p>
                          <p className="mt-1 text-2xl font-semibold tracking-tight">{money(data.metrics.totalRevenue)}</p>
                        </div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                      <TrendingUp className="size-4" aria-hidden />
                      {pct(data.metrics.revenueGrowth)} growth
                    </span>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold text-slate-500">ARPU</p>
                      <p className="mt-2 text-xl font-semibold">{money(data.metrics.arpu)}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold text-slate-500">LTV</p>
                      <p className="mt-2 text-xl font-semibold">{money(data.metrics.ltv)}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold text-slate-500">Conversion</p>
                      <p className="mt-2 text-xl font-semibold">{pct(data.metrics.conversionRate)}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold text-slate-500">Churn</p>
                      <p className="mt-2 text-xl font-semibold">{pct(data.metrics.churnRate)}</p>
                    </div>
                  </div>
                </div>

                <Panel title="Customer mix" eyebrow="email-first admin view">
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-black/20 p-3">
                      <p className="text-xs text-slate-500">Active subscribers</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.activeSubscribers)}</p>
                    </div>
                    <div className="rounded-md bg-black/20 p-3">
                      <p className="text-xs text-slate-500">Trial users</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.trialUsers)}</p>
                    </div>
                    <div className="rounded-md bg-black/20 p-3">
                      <p className="text-xs text-slate-500">Paid users</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.paidUsers)}</p>
                    </div>
                    <div className="rounded-md bg-black/20 p-3">
                      <p className="text-xs text-slate-500">Free users</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.freeUsers)}</p>
                    </div>
                  </div>
                  <p className="mt-4 rounded-md border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-500">
                    {data.identity.note}
                  </p>
                </Panel>
              </section>

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric icon={Users} label="Active users" value={num(data.metrics.activeUsers)} helper={`${num(data.metrics.newUsersMonth)} new this month`} />
                <Metric icon={IndianRupee} label="Plan MRR" value={money(data.metrics.mrr)} helper={`${num(data.metrics.activeSubscribers)} paying subscriptions`} tone="green" />
                <Metric icon={Activity} label="Usage" value={num(data.metrics.labelsThisMonth)} helper={`${num(data.metrics.labelsProcessed)} labels lifetime`} />
                <Metric icon={AlertTriangle} label="Billing risk" value={num(data.metrics.failedPayments)} helper={`${num(data.metrics.renewalsDue)} renewals in 14 days`} tone={data.metrics.failedPayments ? "rose" : "amber"} />
              </section>

              <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <Panel title="Revenue trend" eyebrow="last 14 days">
                  <MiniBars data={data.revenue.daily} valueKey="value" tone="bg-emerald-300" />
                </Panel>
                <Panel title="Usage trend" eyebrow="labels processed">
                  <MiniBars data={data.usage.dailyLabels} valueKey="labels" />
                </Panel>
              </section>

              <section className="grid gap-4 xl:grid-cols-3">
                <Panel title="Plan revenue" eyebrow="MRR by plan">
                  <div className="mt-4 space-y-3">
                    {Object.entries(data.revenue.planWiseRevenue).map(([plan, revenue]) => (
                      <div key={plan}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold capitalize text-slate-300">{plan}</span>
                          <span className="text-sm font-semibold tabular-nums">{money(revenue)}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-black/30">
                          <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(3, Math.min(100, (revenue / maxPlanRevenue) * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Plan mix" eyebrow="users by plan">
                  <div className="mt-4 space-y-3">
                    {Object.entries(data.users.planMix).map(([plan, count]) => (
                      <div key={plan}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold capitalize text-slate-300">{plan}</span>
                          <span className="text-sm font-semibold tabular-nums">{num(count)}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-black/30">
                          <div className="h-full rounded-full bg-[#6f82ff]" style={{ width: `${Math.max(3, Math.min(100, (count / totalPlanUsers) * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Most used features" eyebrow="usage events">
                  <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                    {data.usage.mostUsedFeatures.length ? (
                      data.usage.mostUsedFeatures.map((item) => <Row key={item.feature} left={item.feature} right={num(item.count)} />)
                    ) : (
                      <p className="bg-black/20 p-3 text-sm text-slate-500">No feature usage yet.</p>
                    )}
                  </div>
                </Panel>
              </section>

              <section className="grid gap-4 xl:grid-cols-3">
                <Panel title="Renewals" eyebrow="next 14 days">
                  <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                    {data.billing.renewals.length ? (
                      data.billing.renewals.map((item) => (
                        <Row key={`${item.user}-${item.renewalDate}`} left={item.user} right={item.daysLeft == null ? "Soon" : `${item.daysLeft}d`} sub={`${item.plan} · ${dateLabel(item.renewalDate)}`} />
                      ))
                    ) : (
                      <p className="bg-black/20 p-3 text-sm text-slate-500">No upcoming renewals.</p>
                    )}
                  </div>
                </Panel>

                <Panel title="Failed payments" eyebrow="needs attention">
                  <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                    {data.billing.failedPayments.length ? (
                      data.billing.failedPayments.map((item, index) => (
                        <Row key={`${item.user}-${index}`} left={item.user} right={money(item.amount)} sub={`${item.reason} · ${dateLabel(item.createdAt)}`} />
                      ))
                    ) : (
                      <p className="bg-black/20 p-3 text-sm text-slate-500">No failed payments.</p>
                    )}
                  </div>
                </Panel>

                <Panel title="Refunds & cancellations" eyebrow="retention signals">
                  <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                    {data.billing.refundsOrCancellations.length ? (
                      data.billing.refundsOrCancellations.map((item, index) => (
                        <Row key={`${item.user}-${index}`} left={item.user} right={item.status ?? "event"} sub={`${item.plan ?? "plan"} · ${dateLabel(item.createdAt)}`} />
                      ))
                    ) : (
                      <p className="bg-black/20 p-3 text-sm text-slate-500">No refunds or cancellations.</p>
                    )}
                  </div>
                </Panel>
              </section>

              <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Top customers" eyebrow="by labels processed">
                  <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                    {data.usage.topCustomers.length ? (
                      data.usage.topCustomers.map((user) => <Row key={user.userId} left={user.user} right={`${num(user.labels)} labels`} />)
                    ) : (
                      <p className="bg-black/20 p-3 text-sm text-slate-500">No customers yet.</p>
                    )}
                  </div>
                </Panel>

                <Panel title="Recent activity" eyebrow="latest usage">
                  <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                    {data.recentActivity.length ? (
                      data.recentActivity.map((item, index) => (
                        <Row key={`${item.userId}-${index}`} left={item.user} right={`${num(item.labels)} labels`} sub={`${item.action} · ${dateLabel(item.createdAt)}`} />
                      ))
                    ) : (
                      <p className="bg-black/20 p-3 text-sm text-slate-500">No recent activity.</p>
                    )}
                  </div>
                </Panel>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                <Metric icon={Repeat2} label="Retention" value={pct(data.metrics.retentionRate)} helper="Active vs churned paid accounts" tone="green" />
                <Metric icon={CalendarClock} label="New today" value={num(data.metrics.newUsersToday)} helper={`${num(data.metrics.newUsersMonth)} new users this month`} />
                <Metric icon={TrendingDown} label="Churn rate" value={pct(data.metrics.churnRate)} helper="Canceled or past-due accounts" tone={data.metrics.churnRate ? "rose" : "green"} />
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
