"use client";
/** Dashboard hero: True Net Profit + sparkline + MoM, plus action cards. */
import { useMemo } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { AlertTriangle, ArrowRight, CheckCircle2, OctagonAlert } from "lucide-react";
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

  return (
    <Guard section="dashboard">
      {/* delight: celebrate when this month's profit beats last month */}
      <Confetti fire={momPct !== null && momPct > 0 && data.trueNet > 0} />
      <PageHeader title="Dashboard" sub={`${state.org.name} · ${data.month}`} />

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
    </Guard>
  );
}
