"use client";
/**
 * Reconciliation (discrepancy dashboard, F3). Makes the order↔payment calendar
 * offset legible: three cause-labelled states (Matched / Awaiting Settlement /
 * Unacknowledged Payouts), a file-coverage indicator, aging, and one-click CTAs
 * to import the missing order file. Nothing is framed as "lost".
 */
import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, FileQuestion, Landmark, Link2 } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { bankReconciliation, reconciliationState, reconcileAll } from "@/book/lib/v2/derived";
import { ClassBadge, Guard, PageHeader } from "@/book/components/v2/common";
import { Badge, Button, Card, StatCard, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { canDo } from "@/book/lib/v2/rbac";
import { flags } from "@/book/lib/flags";
import { detectSettlementExceptions, openExceptions, deductionBreakdown } from "@/book/lib/core/settlementHealth";

const EXC_LABEL: Record<string, string> = {
  MISSING_SETTLEMENT: "Missing settlement",
  NEGATIVE_ON_DELIVERED: "Negative on delivered",
  LOW_REALIZATION: "Low realization",
  UNMATCHED_PAYOUT: "Unmatched payout",
};

const monthName = (m: string) => {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  return new Date(`${m}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

export default function ReconciliationPage() {
  const { state, actions, me } = useV2();
  const r = useMemo(() => reconciliationState(state), [state]);
  const bank = useMemo(() => bankReconciliation(state), [state]);
  const totalOrders = r.matched + r.awaiting + r.closed;
  const staleCount = r.awaitingRows.filter((a) => a.stale).length;
  const canResolve = canDo(me.role, "mark_disputed");

  const reconciled = useMemo(() => reconcileAll(state), [state]);
  const allExceptions = useMemo(() => (flags.settlement2 ? detectSettlementExceptions(reconciled) : []), [reconciled]);
  const { open: openExc } = useMemo(() => openExceptions(allExceptions, state.settlementResolutions ?? []), [allExceptions, state.settlementResolutions]);
  const excAtStake = useMemo(() => openExc.reduce((s, e) => s + e.amount, 0), [openExc]);
  const deductions = useMemo(() => (flags.settlement2 ? deductionBreakdown(reconciled).slice(-6) : []), [reconciled]);

  return (
    <Guard section="reconciliation">
      <PageHeader title="Reconciliation" sub="Order files and payment files are offset in time — this is a rolling, cross-month process, not lost data." />

      {/* Bank-confirmed reconciliation — the bank statement is the source of truth */}
      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4" /> Bank-confirmed reconciliation</h3>
            <p className="text-xs text-muted-foreground">Only bank statement entries count as paid — an order or payout file saying &quot;paid&quot; is not enough.</p>
          </div>
          <Link href="/book/bank" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            Import bank statement <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {!bank.hasBankData && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>No bank statement confirmed yet — so nothing is marked paid. Everything the files claim shows as <strong>Receivable</strong> (from the marketplace) or <strong>Vendor Payout Due</strong>. Import &amp; categorize your statement in Bank Import to confirm what actually moved.</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-success/30 bg-success/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Paid · bank-confirmed</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-success">{formatINR(bank.totalPaid)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{bank.confirmedReceipts} receipt{bank.confirmedReceipts !== 1 ? "s" : ""} matched in bank</p>
          </div>
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Receivable · customer dues</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-warning">{formatINR(bank.totalReceivable)}</p>
            <p className="mt-1 text-xs text-muted-foreground">of {formatINR(bank.expectedFromMarketplace, true)} expected · {bank.receivablePct}% not yet received</p>
          </div>
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Vendor Payout Due</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-danger">{formatINR(bank.totalVendorDue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">of {formatINR(bank.expectedVendorPayout, true)} billed · {bank.vendorDuePct}% unpaid</p>
          </div>
        </div>
      </Card>

      {/* Three cause-labelled states */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Matched" value={r.matched.toLocaleString("en-IN")} tone="success"
          sub="in an order file AND settled" />
        <StatCard label="Awaiting settlement" value={r.awaiting.toLocaleString("en-IN")} tone="warning"
          sub={staleCount > 0 ? `${staleCount} over 60 days — chase Meesho` : "waiting for Meesho to settle"} />
        <StatCard label="Unacknowledged payouts" value={r.unacknowledged.count.toLocaleString("en-IN")}
          tone="default" sub={`${formatINR(r.unacknowledged.total, true)} · order file not imported`} />
      </div>

      {/* Conservation line — every number reproducible, none framed as loss */}
      <Card className="mb-6 p-4 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span><strong>{totalOrders.toLocaleString("en-IN")}</strong> orders</span>
          <span className="text-muted-foreground">= {r.matched.toLocaleString("en-IN")} matched + {r.awaiting.toLocaleString("en-IN")} awaiting{r.closed > 0 ? ` + ${r.closed.toLocaleString("en-IN")} closed (₹0/no sale settlement)` : ""}.</span>
          <span className="text-muted-foreground">Plus {r.unacknowledged.count.toLocaleString("en-IN")} payouts whose order file isn&apos;t imported yet (mostly a later month).</span>
        </p>
      </Card>

      {/* Coverage indicator */}
      <Card className="mb-6 p-5">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><FileQuestion className="h-4 w-4" /> File coverage</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Order files cover</p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {r.coverage.orderFileMonths.length
                ? r.coverage.orderFileMonths.map((m) => <Badge key={m} tone="success">{m}</Badge>)
                : <span className="text-sm text-muted-foreground">none</span>}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Payments reference order months</p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {r.coverage.paymentOrderMonths.map((m) => (
                <Badge key={m} tone={r.coverage.missingOrderMonths.includes(m) ? "warning" : "default"}>{m}</Badge>
              ))}
            </p>
          </div>
        </div>
        {r.coverage.missingOrderMonths.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            To fully reconcile, also import the <strong>order file(s)</strong> for {r.coverage.missingOrderMonths.map(monthName).join(", ")} —
            payments for those months are already loaded.
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Unacknowledged by month + CTA */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">Unacknowledged payouts by order month</span>
          </div>
          <div className="divide-y divide-border">
            {r.unacknowledged.byMonth.map((m) => (
              <div key={m.month} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{m.month === "—" ? "Unknown month" : monthName(m.month)}</span>
                <Badge>{m.count} orders</Badge>
                <span className={cn("tabular-nums", m.net < 0 && "text-danger")}>{formatINR(m.net, true)}</span>
                <Link href="/book/integrations" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Import order file <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
            {r.unacknowledged.byMonth.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Every payout is tied to a known order. 🎉</p>
            )}
          </div>
        </Card>

        {/* Awaiting settlement — aging */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">Awaiting settlement</span>
            {staleCount > 0 && <Badge tone="danger">{staleCount} over 60d</Badge>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Sub Order No</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2 text-right">Days waiting</th>
                </tr>
              </thead>
              <tbody>
                {r.awaitingRows.slice(0, 200).map((a, i) => (
                  <tr key={a.subOrderNo} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">#{String(i + 1).padStart(4, "0")}</td>
                    <td className="px-3 py-1.5">
                      <Link href={`/book/orders/${encodeURIComponent(a.subOrderNo)}`} className="font-mono text-xs text-primary hover:underline">{a.subOrderNo}</Link>
                    </td>
                    <td className="px-3 py-1.5"><ClassBadge cls={a.currentClass} /></td>
                    <td className={cn("px-3 py-1.5 text-right tabular-nums", a.stale && "font-medium text-danger")}>{a.daysWaiting}</td>
                  </tr>
                ))}
                {r.awaitingRows.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nothing awaiting — all orders settled.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-muted-foreground">Awaiting means a sale or compensation payment is expected. RTO/return orders without payment rows stay closed unless Meesho posts a deduction later.</p>
        </Card>
      </div>

      {flags.settlement2 && (
        <>
          {/* Settlement 2.0 — exceptions queue */}
          <Card className="mt-6 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="font-semibold">Settlement exceptions</span>
              <Badge tone={openExc.length ? "warning" : "success"}>{openExc.length} open</Badge>
              {excAtStake > 0 && <span className="ml-auto text-xs text-muted-foreground">{formatINR(excAtStake)} at stake</span>}
            </div>
            <div className="divide-y divide-border text-sm">
              {openExc.slice(0, 100).map((e) => (
                <div key={e.key} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <Badge tone={e.kind === "MISSING_SETTLEMENT" || e.kind === "NEGATIVE_ON_DELIVERED" ? "danger" : "warning"}>{EXC_LABEL[e.kind]}</Badge>
                  <Link href={`/book/orders/${encodeURIComponent(e.subOrderNo)}`} className="font-mono text-xs text-primary hover:underline">{e.subOrderNo}</Link>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{e.detail}</span>
                  <span className="tabular-nums font-medium">{formatINR(e.amount)}</span>
                  {canResolve && (
                    <span className="flex gap-1">
                      <button onClick={() => actions.resolveSettlementException(e.key, "resolved")} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">Resolve</button>
                      <button onClick={() => actions.resolveSettlementException(e.key, "ignored")} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">Ignore</button>
                    </span>
                  )}
                </div>
              ))}
              {openExc.length === 0 && (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-center text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" /> No open settlement exceptions.</p>
              )}
            </div>
          </Card>

          {/* Deduction breakdown by month */}
          {deductions.length > 0 && (
            <Card className="mt-6 overflow-hidden">
              <div className="border-b border-border px-4 py-3 font-semibold">Deduction breakdown — last {deductions.length} months</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2 text-right">Gross in</th>
                      <th className="px-3 py-2 text-right">Return charges</th>
                      <th className="px-3 py-2 text-right">Platform fees</th>
                      <th className="px-3 py-2 text-right">Claims</th>
                      <th className="px-3 py-2 text-right">TCS</th>
                      <th className="px-3 py-2 text-right">TDS</th>
                      <th className="px-3 py-2 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductions.map((d) => (
                      <tr key={d.month} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium">{d.month}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-success">{formatINR(d.grossIn)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-danger">−{formatINR(d.returnCharges)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-danger">−{formatINR(d.platformFees)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(d.claimsIncome)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(d.tcs)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(d.tds)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", d.net < 0 && "text-danger")}>{formatINR(d.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </Guard>
  );
}
