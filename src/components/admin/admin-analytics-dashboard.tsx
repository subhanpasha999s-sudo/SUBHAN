"use client";

import * as React from "react";

import Link from "next/link";
import { Activity, BarChart3, CreditCard, RefreshCw, Users } from "lucide-react";

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

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.055] p-5 shadow-[0_18px_70px_-52px_rgb(0_0_0/0.9)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/42">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <span className="grid size-11 place-items-center rounded-2xl border border-[#6b7cff]/22 bg-[#6b7cff]/12 text-[#aab4ff]">
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      <p className="mt-4 text-sm leading-5 text-white/55">{helper}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-[1.35rem] border border-white/10 bg-white/[0.06]" />
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

  return (
    <main className="min-h-screen bg-[#05070c] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-[#aab4ff]">
              Tulmin Admin
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              Analytics command center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Live usage, revenue, plans, uploads, and dispatch processing signals for the SaaS.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/billing"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white hover:bg-white/[0.1]"
            >
              <CreditCard className="mr-2 size-4" aria-hidden />
              Billing
            </Link>
            <Button className="h-11 rounded-2xl" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-semibold text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-7">
          {loading && !data ? (
            <Skeleton />
          ) : data ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Users} label="Total users" value={num(data.users.total)} helper={`${num(data.users.paid)} paid · ${num(data.users.free)} free`} />
                <MetricCard icon={Activity} label="Labels processed" value={num(data.usage.totalLabelsProcessed)} helper={`${num(data.usage.currentMonthLabels)} labels this month`} />
                <MetricCard icon={CreditCard} label="MRR" value={money(data.revenue.mrr)} helper={`${money(data.revenue.arr)} ARR · ${data.revenue.conversionRate}% conversion`} />
                <MetricCard icon={BarChart3} label="PDF uploads" value={num(data.usage.totalPdfsUploaded)} helper={`${num(data.usage.averageLabelsPerUser)} avg labels/user`} />
              </div>

              <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-lg font-semibold">Label activity</h2>
                    <span className="text-xs font-semibold text-white/42">last 14 days</span>
                  </div>
                  <div className="mt-6 flex h-64 items-end gap-2">
                    {data.chart.length === 0 ? (
                      <p className="m-auto text-sm text-white/45">No usage events yet.</p>
                    ) : (
                      data.chart.map((item) => (
                        <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                          <div
                            className="w-full rounded-t-xl bg-gradient-to-t from-[#6b63ff] to-[#aab4ff]"
                            style={{ height: `${Math.max(6, (item.labels / maxChart) * 100)}%` }}
                          />
                          <span className="text-[10px] text-white/35">{item.date.slice(5)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5">
                  <h2 className="text-lg font-semibold">Plans</h2>
                  <div className="mt-5 space-y-3">
                    {Object.entries(data.plans).map(([plan, count]) => (
                      <div key={plan} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                        <span className="text-sm font-semibold capitalize text-white/72">{plan}</span>
                        <span className="text-xl font-semibold tabular-nums">{num(count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5">
                  <h2 className="text-lg font-semibold">Top users</h2>
                  <div className="mt-4 space-y-2">
                    {data.usage.topUsers.map((user) => (
                      <div key={user.userId} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3">
                        <span className="truncate text-sm text-white/62">{user.userId}</span>
                        <span className="text-sm font-bold">{num(user.labels)} labels</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5">
                  <h2 className="text-lg font-semibold">Recent activity</h2>
                  <div className="mt-4 space-y-2">
                    {data.recentActivity.map((item, index) => (
                      <div key={`${item.userId}-${index}`} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3">
                        <span className="truncate text-sm text-white/62">{item.action}</span>
                        <span className="text-sm font-bold">{num(item.labels)} labels</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
