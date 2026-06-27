"use client";
/** Dashboard hero: True Net Profit + sparkline + MoM, plus action cards. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { AlertTriangle, ArrowRight, BarChart3, Check, CheckCircle2, Landmark, ListOrdered, OctagonAlert, PackageOpen, Rocket, Sparkles, X } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { bankReconciliation, dashboardData, insightsFeed, orderStatusCounts } from "@/book/lib/v2/derived";
import { Guard, CountUpINR, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Card, StatCard, cn } from "@/book/components/ui";
import { formatINR, formatPct } from "@/book/lib/engine";
import HealthBanner from "@/book/components/v2/HealthBanner";
import Confetti from "@/book/components/v2/Confetti";
import { FinancialBuckets, OrderFlowFunnel } from "@/book/components/v2/OrderFlow";

export default function DashboardPage() {
  const { state } = useV2();
  const data = useMemo(() => dashboardData(state), [state]);
  const insights = useMemo(() => insightsFeed(state), [state]);
  const bank = useMemo(() => bankReconciliation(state), [state]);

  const counts = useMemo(() => orderStatusCounts(state), [state]);
  // raw marketplace rows vs unique orders (canonical merge) — show both honestly
  const rawOrderRows = useMemo(
    () => state.uploads.filter((u) => u.fileType === "ORDERS_CSV").reduce((s, u) => s + u.rowCount, 0),
    [state.uploads]
  );

  const momPct =
    data.prevTrueNet && data.prevTrueNet !== 0
      ? ((data.trueNet - data.prevTrueNet) / Math.abs(data.prevTrueNet)) * 100
      : null;

  // Until the first orders are imported, the dashboard is empty — so we keep it
  // calm and focused on getting set up instead of a wall of ₹0 cards.
  const noOrders = state.orders.length === 0;

  return (
    <Guard section="dashboard">
      {/* delight: celebrate when this month's profit beats last month */}
      <Confetti fire={momPct !== null && momPct > 0 && data.trueNet > 0} />
      <PageHeader title="Dashboard" sub={`${state.org.name} · ${data.month}`} />

      {/* Guided setup — progress-aware, persists until done, dismissible */}
      <SetupGuide />

      {noOrders ? (
        <NewUserHint />
      ) : (
       <>
      <div className="mb-6"><HealthBanner /></div>

      {/* Hero */}
      <Card className="relative overflow-hidden p-6">
        <div className="relative z-10">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            True net profit — {data.month}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <CountUpINR
              value={data.trueNet}
              className={cn("text-4xl font-bold", data.trueNet >= 0 ? "text-success" : "text-danger")}
            />
            {momPct !== null && (
              <Badge tone={momPct >= 0 ? "success" : "danger"}>
                {momPct >= 0 ? "▲" : "▼"} {Math.abs(momPct).toFixed(0)}% vs last month
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Marketplace net {formatINR(data.marketplaceNet, true)} − business expenses {formatINR(data.businessExpenses, true)}
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 opacity-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.profitSpark}>
              <defs>
                <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area dataKey="profit" stroke="var(--primary)" fill="url(#spark)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Bank-confirmed money flow — only the bank statement marks anything paid */}
      <Link href="/book/reconciliation" className="mt-6 block">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total paid · bank-confirmed</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-success">{formatINR(bank.totalPaid, true)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{bank.confirmedReceipts} receipt{bank.confirmedReceipts !== 1 ? "s" : ""} matched in bank</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total receivable</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-warning">{formatINR(bank.totalReceivable, true)}</p>
            <p className="mt-1 text-xs text-muted-foreground">customer dues not yet received{!bank.hasBankData ? " · no bank data" : ` · ${bank.receivablePct}% pending`}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total vendor payout due</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-danger">{formatINR(bank.totalVendorDue, true)}</p>
            <p className="mt-1 text-xs text-muted-foreground">vendor dues not yet paid{!bank.hasBankData ? " · no bank data" : ` · ${bank.vendorDuePct}% unpaid`}</p>
          </Card>
        </div>
      </Link>

      {/* Headline: orders from Order Data only, both numbers shown honestly */}
      <div className="mt-6 flex flex-wrap items-baseline gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Orders &amp; status</h2>
        {rawOrderRows > counts.total && (
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground">{counts.total.toLocaleString("en-IN")} orders</strong> from {rawOrderRows.toLocaleString("en-IN")} marketplace rows ({(rawOrderRows - counts.total)} multi-line merged)
          </span>
        )}
      </div>

      {/* Financially-correct status buckets — count + net ₹ */}
      <div className="mt-3"><FinancialBuckets /></div>

      {/* Order-flow funnel + action cards */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><OrderFlowFunnel /></div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Link href="/book/orders">
            <StatCard
              label="Unpaid / unsettled"
              value={`${counts.unpaid}`}
              sub="orders with no settlement yet →"
              tone={counts.unpaid > 0 ? "warning" : "success"}
            />
          </Link>
          <Link href="/book/returns">
            <StatCard
              label="QC pending"
              value={String(data.qcPending)}
              sub={data.qcAging > 0 ? `${data.qcAging} waiting 7+ days →` : "all fresh →"}
              tone={data.qcAging > 0 ? "danger" : "default"}
            />
          </Link>
          <StatCard
            label="Return rate"
            value={formatPct(data.returnRatePct)}
            tone={data.returnRatePct > 15 ? "danger" : data.returnRatePct > 10 ? "warning" : "success"}
          />
        </div>
      </div>

      {/* Insights feed */}
      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">Insights</div>
        <div className="divide-y divide-border">
          {insights.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing notable — smooth sailing. 🎉
            </p>
          )}
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2 px-4 py-3 text-sm">
              {ins.tone === "critical" ? (
                <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              ) : ins.tone === "warning" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              )}
              {ins.text}
            </div>
          ))}
        </div>
      </Card>

      {/* Recent uploads */}
      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center border-b border-border px-4 py-3">
          <span className="font-semibold">Recent uploads</span>
          <Link href="/book/upload" className="ml-auto flex items-center gap-1 text-sm text-primary">
            Upload month <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-border text-sm">
          {state.uploads.slice(-4).reverse().map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="font-medium">{u.fileName}</span>
              <Badge>{u.monthLabel || u.fileType}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {u.rowCount} rows · {fmtDate(u.at)}
              </span>
            </div>
          ))}
        </div>
      </Card>
       </>
      )}
    </Guard>
  );
}

const SETUP_DISMISS_KEY = "meeshoprofit:setupDismissed";

/**
 * Premium guided setup — progress-aware, persists across the journey until every
 * step is done, and dismissible. New users always know the single next action.
 */
function SetupGuide() {
  const { state } = useV2();
  // start hidden until we've read storage, so the card never flashes for power users
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(SETUP_DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const steps = [
    { icon: ListOrdered, title: "Import your Meesho orders", desc: "Upload your order + payment files to see real numbers.", href: "/book/integrations", cta: "Import files", done: state.orders.length > 0 },
    { icon: PackageOpen, title: "Add product costs", desc: "Set cost price (COGS) so profit & inventory stay accurate.", href: "/book/inventory", cta: "Add products", done: state.skus.length > 0 },
    { icon: Landmark, title: "Reconcile your bank", desc: "Import a statement — only bank-confirmed money counts as paid.", href: "/book/bank", cta: "Import statement", done: state.bankTxns.length > 0 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const nextIdx = steps.findIndex((s) => !s.done);

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(SETUP_DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  };

  if (allDone) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500"><Rocket className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">You&apos;re all set 🎉</p>
          <p className="text-xs text-muted-foreground">Orders, costs and bank are connected — your numbers below are live.</p>
        </div>
        <button onClick={dismiss} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Got it</button>
      </div>
    );
  }

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] to-transparent p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Sparkles className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold sm:text-lg">Set up Tulmin Book</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">Three quick steps to your real numbers — do them in any order.</p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss setup" className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
      </div>

      {/* progress */}
      <div className="mb-5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">{doneCount}/{steps.length} done</span>
      </div>

      {/* steps */}
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <Link
              key={s.title}
              href={s.href}
              className={cn(
                "group flex flex-col rounded-xl border p-4 transition-all",
                s.done
                  ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                  : isNext
                    ? "border-primary/50 bg-card ring-1 ring-primary/20 hover:border-primary"
                    : "border-border bg-card hover:border-primary/40"
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={cn("flex size-9 items-center justify-center rounded-lg", s.done ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-primary")}>
                  {s.done ? <Check className="size-5" /> : <s.icon className="size-5" />}
                </span>
                {s.done ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">Done</span>
                ) : isNext ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Start here</span>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground">Step {i + 1}</span>
                )}
              </div>
              <p className={cn("text-sm font-bold", s.done && "text-muted-foreground")}>{s.title}</p>
              <p className="mt-1 flex-1 text-xs text-muted-foreground">{s.desc}</p>
              {!s.done && (
                <span className={cn("mt-3 inline-flex items-center gap-1 text-xs font-semibold", isNext ? "text-primary" : "text-muted-foreground")}>
                  {s.cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Calm placeholder shown before the first import — no wall of ₹0 cards. */
function NewUserHint() {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><BarChart3 className="size-6" /></span>
      <div>
        <p className="text-base font-bold">Your numbers appear here</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Once you import your first Meesho file, this dashboard fills with true profit, bank-confirmed payments, orders, inventory and returns.
        </p>
      </div>
      <Link href="/book/integrations" className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
        Import your first file <ArrowRight className="size-4" />
      </Link>
    </Card>
  );
}
