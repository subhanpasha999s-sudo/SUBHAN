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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TrendPoint = { date: string; value?: number; labels?: number };
type UserDetail = {
  userId: string;
  email: string | null;
  name: string | null;
  joinedAt: string | null;
  plan: string;
  status: string | null;
  isActive: boolean;
  isPaid: boolean;
  labelsProcessed: number;
  labelsThisMonth: number;
  usageEvents: number;
  lastActiveAt: string | null;
  totalRevenue: number;
  failedPayments: number;
};

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
    failedPaymentAmount: number;
    renewalsDue: number;
    newUsersToday: number;
    newUsersMonth: number;
    activeUsers: number;
    activeFreeUsers: number;
    activationRate: number;
    labelsProcessed: number;
    labelsThisMonth: number;
    labelsPerActiveUser: number;
  };
  revenue: {
    planWiseRevenue: Record<string, number>;
    daily: TrendPoint[];
  };
  users: {
    growth: TrendPoint[];
    planMix: Record<string, number>;
    details: UserDetail[];
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

function dateTimeLabel(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "No activity";
}

function Metric({
  label,
  value,
  helper,
  icon: Icon,
  tone = "blue",
  onClick,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone?: "blue" | "green" | "amber" | "rose";
  onClick?: () => void;
}) {
  const tones = {
    blue: "border-[#6f82ff]/25 bg-[#6f82ff]/12 text-[#b9c3ff]",
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    rose: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  };

  const content = (
    <>
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
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg border border-white/10 bg-[#0e141f] p-4 text-left transition hover:border-[#6f82ff]/45 hover:bg-[#121b2b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fa8ff]/60"
      >
        {content}
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#0e141f] p-4">
      {content}
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

function ActionCard({
  title,
  value,
  helper,
  tone = "blue",
  onClick,
}: {
  title: string;
  value: string;
  helper: string;
  tone?: "blue" | "green" | "amber" | "rose";
  onClick?: () => void;
}) {
  const tones = {
    blue: "border-[#6f82ff]/30 bg-[#6f82ff]/10 text-[#c5ccff]",
    green: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    rose: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  };

  const className = `rounded-lg border p-4 ${tones[tone]} ${onClick ? "text-left transition hover:border-white/35 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fa8ff]/60" : ""}`;

  const content = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-70">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm leading-5 text-slate-300">{helper}</p>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

type UserFilter = "all" | "active" | "free" | "paid" | "conversion";

function filterUsers(users: UserDetail[], filter: UserFilter) {
  if (filter === "active") return users.filter((user) => user.isActive);
  if (filter === "free") return users.filter((user) => !user.isPaid);
  if (filter === "paid") return users.filter((user) => user.isPaid);
  if (filter === "conversion") return users.filter((user) => user.isActive && !user.isPaid);
  return users;
}

function UserDrilldownDialog({
  open,
  onOpenChange,
  filter,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: UserFilter;
  users: UserDetail[];
}) {
  const labels: Record<UserFilter, string> = {
    all: "All unique users",
    active: "Active users",
    free: "Free users",
    paid: "Paid users",
    conversion: "Conversion pool",
  };
  const rows = filterUsers(users, filter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0e141f] text-white sm:max-w-[min(1120px,calc(100vw-2rem))]">
        <DialogHeader className="pr-10">
          <DialogTitle className="text-xl font-semibold">{labels[filter]}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {num(rows.length)} unique users with email, plan, join date, activity, labels, and revenue.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[68dvh] overflow-auto rounded-lg border border-white/10">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-[#111827] text-slate-400">
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-slate-400">User</TableHead>
                <TableHead className="text-slate-400">Plan</TableHead>
                <TableHead className="text-slate-400">Joined</TableHead>
                <TableHead className="text-right text-slate-400">Labels</TableHead>
                <TableHead className="text-right text-slate-400">This month</TableHead>
                <TableHead className="text-slate-400">Last active</TableHead>
                <TableHead className="text-right text-slate-400">Revenue</TableHead>
                <TableHead className="text-right text-slate-400">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((user) => (
                  <TableRow key={user.userId} className="border-white/10 hover:bg-white/[0.04]">
                    <TableCell className="min-w-[240px]">
                      <p className="font-semibold text-slate-100">{user.name || user.email || "Unknown user"}</p>
                      <p className="text-xs text-slate-500">{user.email || user.userId}</p>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold capitalize text-slate-200">
                        {user.plan || "free"} · {user.status || "unknown"}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-300">{dateLabel(user.joinedAt)}</TableCell>
                    <TableCell className="text-right font-semibold text-white">{num(user.labelsProcessed)}</TableCell>
                    <TableCell className="text-right text-slate-300">{num(user.labelsThisMonth)}</TableCell>
                    <TableCell className="text-slate-300">{dateTimeLabel(user.lastActiveAt)}</TableCell>
                    <TableCell className="text-right text-slate-300">{money(user.totalRevenue)}</TableCell>
                    <TableCell className="text-right text-slate-300">{num(user.failedPayments)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-white/10">
                  <TableCell colSpan={8} className="py-8 text-center text-slate-500">
                    No users in this segment yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
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
  const [userFilter, setUserFilter] = React.useState<UserFilter>("all");
  const [usersOpen, setUsersOpen] = React.useState(false);

  const openUsers = React.useCallback((filter: UserFilter) => {
    setUserFilter(filter);
    setUsersOpen(true);
  }, []);

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
                    <button type="button" onClick={() => openUsers("all")} className="rounded-md bg-black/20 p-3 text-left transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fa8ff]/60">
                      <p className="text-xs text-slate-500">Total users</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.totalUsers)}</p>
                    </button>
                    <button type="button" onClick={() => openUsers("active")} className="rounded-md bg-black/20 p-3 text-left transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fa8ff]/60">
                      <p className="text-xs text-slate-500">Active users</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.activeUsers)}</p>
                    </button>
                    <button type="button" onClick={() => openUsers("paid")} className="rounded-md bg-black/20 p-3 text-left transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fa8ff]/60">
                      <p className="text-xs text-slate-500">Active subscribers</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.activeSubscribers)}</p>
                    </button>
                    <div className="rounded-md bg-black/20 p-3">
                      <p className="text-xs text-slate-500">Trial users</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.trialUsers)}</p>
                    </div>
                    <button type="button" onClick={() => openUsers("paid")} className="rounded-md bg-black/20 p-3 text-left transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fa8ff]/60">
                      <p className="text-xs text-slate-500">Paid users</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.paidUsers)}</p>
                    </button>
                    <button type="button" onClick={() => openUsers("free")} className="rounded-md bg-black/20 p-3 text-left transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fa8ff]/60">
                      <p className="text-xs text-slate-500">Free users</p>
                      <p className="mt-1 text-xl font-semibold">{num(data.metrics.freeUsers)}</p>
                    </button>
                  </div>
                  <p className="mt-4 rounded-md border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-500">
                    {data.identity.note}
                  </p>
                </Panel>
              </section>

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric icon={Users} label="Active users" value={num(data.metrics.activeUsers)} helper={`${pct(data.metrics.activationRate)} of all users active in 30 days`} onClick={() => openUsers("active")} />
                <Metric icon={IndianRupee} label="Plan MRR" value={money(data.metrics.mrr)} helper={`${num(data.metrics.paidUsers)} paid users tracked`} tone="green" />
                <Metric icon={Activity} label="Usage" value={num(data.metrics.labelsThisMonth)} helper={`${num(data.metrics.labelsPerActiveUser)} labels per active user`} />
                <Metric icon={AlertTriangle} label="Billing risk" value={money(data.metrics.failedPaymentAmount)} helper={`${num(data.metrics.failedPayments)} failed payments · ${num(data.metrics.renewalsDue)} renewals`} tone={data.metrics.failedPayments ? "rose" : "amber"} />
              </section>

              <section className="grid gap-4 lg:grid-cols-4">
                <ActionCard
                  title="Conversion pool"
                  value={num(data.metrics.activeFreeUsers)}
                  helper="Active free users who already see value and should be nudged toward paid plans."
                  tone={data.metrics.activeFreeUsers ? "amber" : "green"}
                  onClick={() => openUsers("conversion")}
                />
                <ActionCard
                  title="Activation"
                  value={pct(data.metrics.activationRate)}
                  helper={`${num(data.metrics.activeUsers)} active users out of ${num(data.metrics.totalUsers)} total accounts.`}
                  tone={data.metrics.activationRate >= 40 ? "green" : data.metrics.activationRate > 0 ? "amber" : "rose"}
                  onClick={() => openUsers("all")}
                />
                <ActionCard
                  title="Revenue focus"
                  value={money(data.metrics.mrr)}
                  helper={`${pct(data.metrics.conversionRate)} paid conversion across the customer base.`}
                  tone={data.metrics.mrr ? "green" : "amber"}
                />
                <ActionCard
                  title="Usage depth"
                  value={num(data.metrics.labelsPerActiveUser)}
                  helper={`${num(data.metrics.labelsProcessed)} labels processed across recent activity.`}
                />
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
      {data ? (
        <UserDrilldownDialog
          open={usersOpen}
          onOpenChange={setUsersOpen}
          filter={userFilter}
          users={data.users.details}
        />
      ) : null}
    </main>
  );
}
