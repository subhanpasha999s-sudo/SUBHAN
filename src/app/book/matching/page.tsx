"use client";
/**
 * Bank Match (Phase 5) — reconcile imported bank lines against documents and
 * Meesho payout batches without double-booking cash. Suggested matches are
 * one-click; a manual picker covers the rest. Matched lines are EXCLUDED from
 * the GL (the receipt/payment or the original settlement is the cash source).
 */
import { useMemo, useState } from "react";
import { Landmark, Check, X, Sparkles } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import Link from "next/link";
import {
  payoutBatches, suggestPayoutMatches, suggestDocMatches, bankBalanceSummary,
  perAccountBalances,
  type PayoutSuggestion, type DocSuggestion,
} from "@/book/lib/core/bankMatch";

export default function BankMatchPage() {
  const { state, actions } = useV2();
  const txns = useMemo(() => state.bankTxns ?? [], [state.bankTxns]);
  const pending = useMemo(() => txns.filter((t) => t.status === "PENDING"), [txns]);
  const matched = useMemo(() => txns.filter((t) => t.matchedInvoiceId || t.matchedBillId || t.matchedBatchId), [txns]);

  const batches = useMemo(() => payoutBatches(state.events ?? []), [state.events]);
  const payoutSugg = useMemo(() => suggestPayoutMatches(pending, batches), [pending, batches]);
  const docSugg = useMemo(() => suggestDocMatches(pending, state.invoices, state.purchases), [pending, state.invoices, state.purchases]);
  const balance = useMemo(() => bankBalanceSummary(txns), [txns]);
  const accountRows = useMemo(() => perAccountBalances(state.bankAccounts ?? [], txns), [state.bankAccounts, txns]);

  const payoutByTxn = new Map(payoutSugg.map((s) => [s.txnId, s]));
  const docByTxn = new Map(docSugg.map((s) => [s.txnId, s]));
  const suggestedCount = new Set([...payoutByTxn.keys(), ...docByTxn.keys()]).size;

  function applyPayout(s: PayoutSuggestion) { const r = actions.matchDepositToPayout(s.txnId, s.batchId); if (!r.ok && r.message) window.alert(r.message); }
  function applyDoc(s: DocSuggestion) {
    const r = s.kind === "invoice" ? actions.matchBankToInvoice(s.txnId, s.docId) : actions.matchBankToBill(s.txnId, s.docId);
    if (!r.ok && r.message) window.alert(r.message);
  }

  return (
    <Guard section="matching">
      <PageHeader title="Bank Match" sub="Reconcile bank lines to documents & Meesho payouts — no double-counting" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Statement balance</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatINR(balance.statementBalance, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Unmatched lines</p><p className={cn("mt-2 text-2xl font-semibold tabular-nums", pending.length > 0 && "text-warning")}>{pending.length}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Suggestions</p><p className="mt-2 text-2xl font-semibold tabular-nums">{suggestedCount}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Payout batches</p><p className="mt-2 text-2xl font-semibold tabular-nums">{batches.filter((b) => b.net > 0).length}</p></Card>
      </div>

      {accountRows.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="inline-flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4 text-primary" /> Accounts</span>
            <Link href="/book/bank" className="text-xs text-primary hover:underline">Import statement →</Link>
          </div>
          <div className="divide-y divide-border text-sm">
            {accountRows.map((a) => (
              <div key={a.accountId ?? "orphan"} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className={cn("font-medium", a.accountId === null && "text-muted-foreground")}>{a.name}</span>
                <span className="text-xs text-muted-foreground">{a.txnCount} line{a.txnCount === 1 ? "" : "s"}</span>
                {a.pendingCount > 0 && <Badge tone="warning">{a.pendingCount} to match</Badge>}
                <span className="ml-auto tabular-nums font-semibold">{formatINR(a.balance)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {txns.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <Landmark className="h-8 w-8" />
          <p>No bank transactions yet. Import a statement in <span className="font-medium text-foreground">Bank Import</span> to start matching.</p>
        </Card>
      )}

      {pending.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold">Unmatched lines</span>
            <span className="ml-auto text-xs text-muted-foreground">{suggestedCount} auto-suggested</span>
          </div>
          <div className="divide-y divide-border text-sm">
            {pending.map((t) => {
              const p = payoutByTxn.get(t.id);
              const d = docByTxn.get(t.id);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(t.txnDate)}</p>
                  </div>
                  <span className={cn("ml-auto tabular-nums font-medium", t.credit > 0 ? "text-success" : "text-danger")}>
                    {t.credit > 0 ? `+${formatINR(t.credit)}` : `−${formatINR(t.debit)}`}
                  </span>
                  {p && (
                    <button onClick={() => applyPayout(p)} className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10">
                      Match payout {p.batchId.slice(0, 10)} {p.diff !== 0 ? `(Δ ${formatINR(Math.abs(p.diff))})` : "✓"}
                    </button>
                  )}
                  {d && (
                    <button onClick={() => applyDoc(d)} className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary hover:bg-primary/10">
                      Match {d.kind} {d.docNumber} {d.exact ? "✓" : `(Δ ${formatINR(Math.abs(d.amount - d.outstanding))})`}
                    </button>
                  )}
                  <ManualMatch txnId={t.id} isCredit={t.credit > 0} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {matched.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 font-semibold">Matched ({matched.length})</div>
          <div className="divide-y divide-border text-sm">
            {matched.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="truncate">{t.description}</span>
                <Badge tone="success"><Check className="mr-1 h-3 w-3" />{t.category}</Badge>
                <span className="ml-auto tabular-nums font-medium">{t.credit > 0 ? `+${formatINR(t.credit)}` : `−${formatINR(t.debit)}`}</span>
                <button onClick={() => actions.unmatchBankTxn(t.id)} title="Unmatch" className="rounded-md border border-border p-1 text-muted-foreground hover:text-danger">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Guard>
  );
}

/** Manual picker for lines the engine couldn't auto-match. */
function ManualMatch({ txnId, isCredit }: { txnId: string; isCredit: boolean }) {
  const { state, actions } = useV2();
  const [open, setOpen] = useState(false);
  const openInvoices = state.invoices.filter((i) => i.status !== "paid");
  const openBills = state.purchases.filter((p) => p.paymentStatus !== "paid");
  const batches = payoutBatches(state.events ?? []).filter((b) => b.net > 0);
  const input = "h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary";

  if (!open) return <button onClick={() => setOpen(true)} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Match…</button>;

  return (
    <select
      autoFocus
      className={input}
      defaultValue=""
      onChange={(e) => {
        const [kind, id] = e.target.value.split(":");
        let r: { ok: boolean; message?: string } | undefined;
        if (kind === "inv") r = actions.matchBankToInvoice(txnId, id);
        else if (kind === "bill") r = actions.matchBankToBill(txnId, id);
        else if (kind === "payout") r = actions.matchDepositToPayout(txnId, id);
        if (r && !r.ok && r.message) window.alert(r.message);
        setOpen(false);
      }}
    >
      <option value="" disabled>Choose match…</option>
      {isCredit && openInvoices.map((i) => <option key={i.id} value={`inv:${i.id}`}>Invoice {i.number || i.id} — {formatINR(i.amount - i.amountPaid - (i.amountCredited ?? 0))}</option>)}
      {isCredit && batches.map((b) => <option key={b.batchId} value={`payout:${b.batchId}`}>Payout {b.batchId.slice(0, 12)} — {formatINR(b.net)}</option>)}
      {!isCredit && openBills.map((p) => <option key={p.id} value={`bill:${p.id}`}>Bill {p.invoiceNo || p.id} — {formatINR(p.totalAmount - (p.amountPaid ?? 0) - (p.amountCredited ?? 0))}</option>)}
    </select>
  );
}
