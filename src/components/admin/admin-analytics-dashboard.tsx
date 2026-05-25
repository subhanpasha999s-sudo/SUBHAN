"use client";

import * as React from "react";

import Link from "next/link";
import {
  Activity,
  BarChart3,
  CreditCard,
  Eye,
  IndianRupee,
  LockKeyhole,
  MousePointerClick,
  RefreshCw,
  Target,
  TrendingUp,
  UploadCloud,
  Users,
} from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";

type AnalyticsPayload = {
  generatedAt: string;
  users: Record<string, number>;
  usage: {
    totalPdfsUploaded: number;
    totalLabelsUploaded: number;
    totalLabelsProcessed: number;
    averageLabelsPerUser: number;
    currentMonthLabels: number;
    topUsers: { userId: string; labels: number }[];
  };
  revenue: {
    revenue: number;
    mrr: number;
    arr: number;
    monthlyGrowth: number;
    conversionRate: number;
    planWiseRevenue: Record<string, number>;
  };
  traffic: {
    totalVisits: number;
    uniqueVisitors: number;
    sessionDuration: string;
    mostVisitedPages: string[];
  };
  plans: Record<string, number>;
  chart: { date: string; labels: number }[];
  recentActivity: { userId: string; action: string; labels: number; createdAt: string | null }[];
};

function num(value: number) {
  return value.toLocaleString("en-IN");
}

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function pct(value: number) {
  return `${Number.isFinite(value) ? value : 0}%`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "blue",
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  helper: string;
  tone?: "blue" | "green" | "amber" | "violet";
}) {
  const tones = {
    blue: "border-[#6b7cff]/22 bg-[#6b7cff]/12 text-[#aab4ff]",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    violet: "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100",
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#0f151f] p-4 shadow-[0_18px_60px_-52px_rgb(0_0_0/0.9)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <span className={`grid size-9 place-items-center rounded-md border ${tones[tone]}`}>
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-400">{helper}</p>
    </div>
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
    <section className="rounded-lg border border-white/10 bg-[#0f151f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {eyebrow ? <p className="mt-1 text-xs font-semibold text-slate-500">{eyebrow}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg border border-white/10 bg-white/[0.06]" />
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
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const maxChart = Math.max(1, ...(data?.chart.map((d) => d.labels) ?? [1]));
  const totalPlanUsers = Math.max(1, data ? Object.values(data.plans).reduce((sum, value) => sum + value, 0) : 1);
  const maxPlanRevenue = Math.max(1, data ? Math.max(...Object.values(data.revenue.planWiseRevenue), 0) : 1);
  const paidUsers = Number(data?.users.paid ?? 0);
  const totalUsers = Number(data?.users.total ?? 0);
  const freeUsers = Number(data?.users.free ?? 0);
  const revenuePerPaidUser = paidUsers > 0 && data ? Math.round(data.revenue.mrr / paidUsers) : 0;

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="border-b border-white/10 bg-[#0b0f17]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8fa8ff]">Tulmin Admin</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Analytics</h1>
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
            <h2 className="text-2xl font-semibold tracking-tight">Business dashboard</h2>
            <p className="mt-1 text-sm text-slate-400">
              Revenue, acquisition, plan mix, product usage, and customer activity in one operational view.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-[#0f151f] px-3 py-2 text-xs font-semibold text-slate-400">
            Auto-refreshes every 30s
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
                    Sign in with an allowlisted admin account to unlock revenue, usage, and customer analytics.
                  </p>
                </div>
              </div>
              <Link
                href="/admin/login"
                className="inline-flex h-9 items-center justify-center rounded-md bg-[#335cff] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#284ae4]"
              >
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
              <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-lg border border-white/10 bg-[#101827] p-5 shadow-[0_24px_80px_-64px_rgb(51_92_255/0.9)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8fa8ff]">
                        Revenue snapshot
                      </p>
                      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-400">Monthly recurring revenue</p>
                          <p className="mt-1 text-4xl font-semibold tracking-tight">{money(data.revenue.mrr)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-400">Annual run rate</p>
                          <p className="mt-1 text-2xl font-semibold tracking-tight">{money(data.revenue.arr)}</p>
                        </div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                      <TrendingUp className="size-4" aria-hidden />
                      {pct(data.revenue.monthlyGrowth)} growth
                    </span>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold text-slate-500">Conversion</p>
                      <p className="mt-2 text-xl font-semibold">{pct(data.revenue.conversionRate)}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold text-slate-500">Paid users</p>
                      <p className="mt-2 text-xl font-semibold">{num(paidUsers)}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold text-slate-500">MRR / paid user</p>
                      <p className="mt-2 text-xl font-semibold">{money(revenuePerPaidUser)}</p>
                    </div>
                  </div>
                </div>

                <Panel title="Customer funnel" eyebrow="account mix">
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-md bg-black/20 p-3">
                        <p className="text-xs text-slate-500">Total</p>
                        <p className="mt-1 text-xl font-semibold">{num(totalUsers)}</p>
                      </div>
                      <div className="rounded-md bg-black/20 p-3">
                        <p className="text-xs text-slate-500">Paid</p>
                        <p className="mt-1 text-xl font-semibold">{num(paidUsers)}</p>
                      </div>
                      <div className="rounded-md bg-black/20 p-3">
                        <p className="text-xs text-slate-500">Free</p>
                        <p className="mt-1 text-xl font-semibold">{num(freeUsers)}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-semibold text-slate-500">
                        <span>Paid conversion</span>
                        <span>{pct(data.revenue.conversionRate)}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-black/30">
                        <div
                          className="h-full rounded-full bg-[#6f82ff]"
                          style={{ width: `${Math.max(3, Math.min(100, data.revenue.conversionRate))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Panel>
              </section>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Users} label="Total users" value={num(totalUsers)} helper={`${num(paidUsers)} paid · ${num(freeUsers)} free`} tone="blue" />
                <MetricCard icon={IndianRupee} label="MRR" value={money(data.revenue.mrr)} helper={`${money(data.revenue.arr)} ARR`} tone="green" />
                <MetricCard icon={Activity} label="Labels processed" value={num(data.usage.totalLabelsProcessed)} helper={`${num(data.usage.currentMonthLabels)} labels this month`} tone="violet" />
                <MetricCard icon={UploadCloud} label="PDF uploads" value={num(data.usage.totalPdfsUploaded)} helper={`${num(data.usage.averageLabelsPerUser)} avg labels/user`} tone="amber" />
              </div>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <Panel title="Usage trend" eyebrow="labels processed · last 14 days">
                  <div className="flex items-center justify-between gap-4">
                    <span className="mt-1 text-xs text-slate-500">
                      Current month: {num(data.usage.currentMonthLabels)} labels
                    </span>
                  </div>
                  <div className="mt-5 flex h-60 items-end gap-2">
                    {data.chart.length === 0 ? (
                      <p className="m-auto text-sm text-slate-500">No usage events yet.</p>
                    ) : (
                      data.chart.map((item) => (
                        <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                          <div
                            className="w-full rounded-t bg-[#6f82ff]"
                            style={{ height: `${Math.max(6, (item.labels / maxChart) * 100)}%` }}
                          />
                          <span className="text-[10px] text-slate-500">{item.date.slice(5)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </Panel>

                <Panel title="Plan mix" eyebrow="users by subscription">
                  <div className="mt-4 space-y-3">
                    {Object.entries(data.plans).map(([plan, count]) => (
                      <div key={plan}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold capitalize text-slate-300">{plan}</span>
                          <span className="text-sm font-semibold tabular-nums">{num(count)}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-black/30">
                          <div
                            className="h-full rounded-full bg-[#6f82ff]"
                            style={{ width: `${Math.max(3, Math.min(100, (count / totalPlanUsers) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </section>

              <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Plan revenue" eyebrow="MRR contribution">
                  <div className="mt-4 space-y-3">
                    {Object.entries(data.revenue.planWiseRevenue).length === 0 ? (
                      <p className="rounded-md bg-black/20 p-3 text-sm text-slate-500">No plan revenue yet.</p>
                    ) : (
                      Object.entries(data.revenue.planWiseRevenue).map(([plan, revenue]) => (
                        <div key={plan}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold capitalize text-slate-300">{plan}</span>
                            <span className="text-sm font-semibold tabular-nums">{money(revenue)}</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-black/30">
                            <div
                              className="h-full rounded-full bg-emerald-300"
                              style={{ width: `${Math.max(3, Math.min(100, (revenue / maxPlanRevenue) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Panel>

                <Panel title="Traffic & acquisition" eyebrow="site engagement">
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md bg-black/20 p-3">
                      <Eye className="size-4 text-[#aab4ff]" aria-hidden />
                      <p className="mt-2 text-xs text-slate-500">Visits</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.traffic.totalVisits)}</p>
                    </div>
                    <div className="rounded-md bg-black/20 p-3">
                      <MousePointerClick className="size-4 text-emerald-200" aria-hidden />
                      <p className="mt-2 text-xs text-slate-500">Unique visitors</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.traffic.uniqueVisitors)}</p>
                    </div>
                    <div className="rounded-md bg-black/20 p-3">
                      <Target className="size-4 text-amber-100" aria-hidden />
                      <p className="mt-2 text-xs text-slate-500">Session</p>
                      <p className="mt-1 text-xl font-semibold">{data.traffic.sessionDuration}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Top pages</p>
                    <div className="mt-2 space-y-2">
                      {data.traffic.mostVisitedPages.length === 0 ? (
                        <p className="rounded-md bg-black/20 p-3 text-sm text-slate-500">No traffic pages connected yet.</p>
                      ) : (
                        data.traffic.mostVisitedPages.map((page) => (
                          <div key={page} className="truncate rounded-md bg-black/20 px-3 py-2 text-sm text-slate-300">
                            {page}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </Panel>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <Panel title="Top customers" eyebrow="highest label usage">
                  <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                    {data.usage.topUsers.map((user) => (
                      <div key={user.userId} className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-3 py-2.5 last:border-b-0">
                        <span className="truncate text-sm text-slate-400">{user.userId}</span>
                        <span className="text-sm font-bold">{num(user.labels)} labels</span>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel title="Recent activity" eyebrow="latest usage events">
                  <div className="mt-4 overflow-hidden rounded-md border border-white/10">
                    {data.recentActivity.map((item, index) => (
                      <div key={`${item.userId}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/10 bg-black/20 px-3 py-2.5 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-300">{item.action}</p>
                          <p className="truncate text-xs text-slate-500">{item.userId}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{num(item.labels)} labels</p>
                          <p className="text-xs text-slate-500">
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : "No date"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
