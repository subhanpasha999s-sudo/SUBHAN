"use client";
/** Payout & P/L — Summary (spec §5.3). Executive one-page statement. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { payoutSummary } from "@/book/lib/v2/derived";
import { exportSummary } from "@/book/lib/v2/exportPnl";
import { PnlNav, useDefaultPnlControls } from "@/book/components/v2/PnlNav";
import { CountUpINR, Guard, PageHeader } from "@/book/components/v2/common";
import { Card, cn } from "@/book/components/ui";
import { ANIM, axis, ChartTooltip, grid } from "@/book/components/v2/charts";
import { formatINR, formatINRCompact, formatPct } from "@/book/lib/engine";

export default function SummaryPage() {
  const def = useDefaultPnlControls();
  const [controls, setControls] = useState(def);
  const { state } = useV2();
  const s = useMemo(() => payoutSummary(state, controls), [state, controls]);

  // income-vs-expense waterfall
  const waterfall = useMemo(() => [
    { name: "Income", value: s.income.total, fill: "#16a34a" },
    { name: "COGS", value: -s.expenses.cogs, fill: "#f97316" },
    { name: "Returns", value: -s.expenses.returnLosses, fill: "#ef4444" },
    { name: "Affiliate", value: -s.expenses.platformDeductions, fill: "#64748b" },
    { name: "Ads", value: -s.expenses.ads, fill: "#eab308" },
    { name: "Write-off", value: -s.expenses.qcWriteOff, fill: "#f43f5e" },
    { name: "Expenses", value: -s.expenses.businessExpenses, fill: "#a855f7" },
    { name: "Net", value: s.netProfit, fill: s.netProfit >= 0 ? "#7c3aed" : "#dc2626" },
  ], [s]);

  const line = (label: string, v: number, opts: { bold?: boolean; sign?: "-" } = {}) => {
    // Expense rows (sign:"-") show the magnitude with a leading minus — but a
    // zero must read "₹0.00", never "−₹0.00" (and stays neutral, not red).
    // Result rows (no sign) use formatINR(v) so a real negative keeps its sign.
    const isDeduction = opts.sign === "-" && Math.round(v * 100) !== 0;
    const text = opts.sign === "-"
      ? (isDeduction ? `−${formatINR(Math.abs(v))}` : formatINR(0))
      : formatINR(v);
    return (
      <div className={cn("flex justify-between py-1.5", opts.bold && "border-t border-border pt-2 font-semibold")}>
        <span className={opts.bold ? "" : "text-muted-foreground"}>{label}</span>
        <span className={cn("tabular-nums", isDeduction && "text-danger")}>{text}</span>
      </div>
    );
  };
  const deductionText = (v: number) => Math.round(v * 100) === 0 ? formatINR(0) : `−${formatINR(v)}`;

  return (
    <Guard section="pnl">
      <PageHeader title="Payout & P/L" sub="Profit/Loss — your executive statement" />
      <PnlNav controls={controls} onChange={setControls} onExport={() => exportSummary(s, `${controls.fromMonth}_${controls.toMonth}`)} />

      {/* Hero */}
      <Card className="mb-6 p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net profit · {controls.fromMonth}–{controls.toMonth} ({controls.view})</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <CountUpINR value={s.netProfit} className={cn("text-4xl font-bold", s.netProfit >= 0 ? "text-success" : "text-danger")} />
          <span className="text-sm text-muted-foreground">net margin {formatPct(s.netMarginPct)}</span>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Statement */}
        <Card className="p-5 text-sm">
          <h3 className="mb-3 font-semibold">Statement</h3>
          {line("Delivered payout", s.income.delivered)}
          {line("Exchange payout", s.income.exchange)}
          {line("Claim / compensation", s.income.claim)}
          {line("Lost-order compensation", s.income.lostComp)}
          {line("Total income", s.income.total, { bold: true })}
          {line("COGS", s.expenses.cogs, { sign: "-" })}
          {line("Return-leg losses", s.expenses.returnLosses, { sign: "-" })}
          {line("Order gross profit", s.orderGrossProfit, { bold: true })}
          {line("Affiliate / platform fees", s.expenses.platformDeductions, { sign: "-" })}
          {line("Ads", s.expenses.ads, { sign: "-" })}
          {line("QC-damaged write-offs", s.expenses.qcWriteOff, { sign: "-" })}
          {line("Marketplace net", s.marketplaceNet, { bold: true })}
          {line("Business expenses", s.expenses.businessExpenses, { sign: "-" })}
          <div className="mt-1 flex justify-between border-t-2 border-border py-2 text-base font-bold">
            <span>Net profit</span>
            <span className={cn("tabular-nums", s.netProfit >= 0 ? "text-success" : "text-danger")}>{formatINR(s.netProfit)}</span>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">Recoverable (not expensed): TCS {formatINR(s.recoverable.tcs)} · TDS {formatINR(s.recoverable.tds)}</p>
        </Card>

        {/* Waterfall */}
        <Card className="p-5">
          <h3 className="mb-1 font-semibold">Income → Net profit</h3>
          <p className="mb-4 text-xs text-muted-foreground">Green builds you up; coloured bars are what each cost takes away.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfall} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="name" {...axis} interval={0} dy={4} />
                <YAxis {...axis} tickFormatter={(v: number) => formatINRCompact(v)} width={56} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={<ChartTooltip hideLabel valueFormatter={(v) => formatINR(v)} />}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} {...ANIM}>
                  {waterfall.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v: React.ReactNode) => formatINRCompact(Number(v ?? 0))}
                    style={{ fill: "var(--muted-foreground)", fontSize: 10, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Receivables + reconciliation */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-1 font-semibold">Unmatched payout impact</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Payment rows waiting for their order file. They auto-match by Sub Order No after the order data is uploaded.
          </p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Unmatched sub orders</span><span className="tabular-nums">{s.unmatchedPayouts.subOrders.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Rows held for matching</span><span className="tabular-nums">{s.unmatchedPayouts.rows.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Credits / compensation</span><span className="tabular-nums">{formatINR(s.unmatchedPayouts.credits)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Affiliate / platform fees</span><span className={cn("tabular-nums", s.unmatchedPayouts.affiliateFees > 0 && "text-danger")}>{deductionText(s.unmatchedPayouts.affiliateFees)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Return/RTO deductions</span><span className={cn("tabular-nums", s.unmatchedPayouts.returnDeductions > 0 && "text-danger")}>{deductionText(s.unmatchedPayouts.returnDeductions)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Other deductions</span><span className={cn("tabular-nums", s.unmatchedPayouts.otherDeductions > 0 && "text-danger")}>{deductionText(s.unmatchedPayouts.otherDeductions)}</span></div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Net unmatched impact</span><span className={cn("tabular-nums", s.unmatchedPayouts.net >= 0 ? "text-success" : "text-danger")}>{formatINR(s.unmatchedPayouts.net)}</span></div>
          </div>
          <Link href="/book/reconciliation" className="mt-3 inline-block text-sm text-primary">Review unmatched payouts →</Link>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Receivable from Meesho</h3>
          <CountUpINR value={s.receivables.total} className="text-2xl font-bold text-warning" />
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Unpaid orders ({s.receivables.unpaidOrders})</span><span className="tabular-nums">{formatINR(s.receivables.unpaidAmount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pending claims ({s.receivables.pendingClaims})</span><span className="tabular-nums">{formatINR(s.receivables.pendingClaimAmount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Recoverable TCS + TDS</span><span className="tabular-nums">{formatINR(s.receivables.tcs + s.receivables.tds)}</span></div>
          </div>
          <Link href="/book/settlements" className="mt-3 inline-block text-sm text-primary">View open settlements →</Link>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Reconciliation status</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-2xl font-bold tabular-nums text-success">{s.reconciliation.matched}</p><p className="text-xs text-muted-foreground">matched</p></div>
            <div><p className="text-2xl font-bold tabular-nums">{s.reconciliation.unmatched}</p><p className="text-xs text-muted-foreground">unmatched</p></div>
            <div><p className={cn("text-2xl font-bold tabular-nums", s.reconciliation.unmapped > 0 && "text-warning")}>{s.reconciliation.unmapped}</p><p className="text-xs text-muted-foreground">unmapped</p></div>
          </div>
          {s.reconciliation.unmapped > 0 && (
            <Link href="/book/mapping" className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" /> {s.reconciliation.unmapped} unmapped SKU(s) excluded from inventory — map them →
            </Link>
          )}
        </Card>
      </div>
    </Guard>
  );
}
