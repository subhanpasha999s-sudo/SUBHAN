"use client";
/**
 * Ledger (Phase 1) — the stored, immutable double-entry ledger.
 *
 * Unlike the derived reports, this reads/writes real Postgres tables (per-org,
 * RLS). "Sync from activity" ports today's derived GL into stored journal
 * entries (idempotent); the trial balance below is read back from those entries
 * and shown next to the derived numbers to prove parity. A manual journal-entry
 * form posts balanced entries directly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2, Check, AlertCircle } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Button, Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { COA_LIST, trialBalance } from "@/book/lib/engine/accounting";
import { glEntries } from "@/book/lib/v2/reportDerived";
import { glEntryToJournal } from "@/book/lib/core/journal";
import { collectDocumentPostings, arAgingFromState, apAgingFromState } from "@/book/lib/core/documentPostings";
import { agingTotal } from "@/book/lib/core/aging";
import {
  ensureOrg, postJournalBatch, fetchStoredTrialBalance, postJournalEntry,
  isLedgerAuthed, type StoredTrialBalanceRow,
} from "@/book/lib/core/ledgerRemote";
import AccountingSetup from "@/book/components/v2/AccountingSetup";
import { flags } from "@/book/lib/flags";

interface FormLine { id: string; accountCode: string; side: "debit" | "credit"; amount: string }
const newFormLine = (): FormLine => ({ id: Math.random().toString(36).slice(2), accountCode: "", side: "debit", amount: "" });

export default function LedgerPage() {
  const { state } = useV2();
  const derivedGl = useMemo(() => glEntries(state), [state]);
  const derivedTb = useMemo(() => trialBalance(derivedGl), [derivedGl]);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredTrialBalanceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async (org: string) => {
    setStored(await fetchStoredTrialBalance(org));
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await isLedgerAuthed();
      setAuthed(ok);
      if (!ok) return;
      const org = await ensureOrg(state.org?.name || "My Business");
      setOrgId(org);
      if (org) await refresh(org);
    })();
  }, [state.org?.name, refresh]);

  const aging = useMemo(() => {
    const asOf = new Date().toISOString().slice(0, 10);
    return { ar: arAgingFromState(state, asOf), ap: apAgingFromState(state, asOf) };
  }, [state]);

  async function onSync() {
    if (!orgId) return;
    setBusy(true); setMsg(null);
    // e-commerce + purchases/expenses/bank (derived GL) + sales AR (documents)
    const entries = [...derivedGl.map(glEntryToJournal), ...collectDocumentPostings(state)];
    const res = await postJournalBatch(orgId, entries);
    await refresh(orgId);
    setMsg(res.failed ? `Synced ${res.posted}, ${res.failed} failed${res.firstError ? ` — ${res.firstError}` : ""}` : `Synced ${res.posted} entries.`);
    setBusy(false);
  }

  const storedTotals = useMemo(() => {
    const debit = stored.reduce((s, r) => s + r.debit, 0);
    const credit = stored.reduce((s, r) => s + r.credit, 0);
    return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
  }, [stored]);
  const balanced = Math.abs(storedTotals.debit - storedTotals.credit) < 0.005;

  // parity: stored balance vs derived balance per account
  const derivedByCode = useMemo(() => new Map(derivedTb.map((r) => [r.account.code, r.balance])), [derivedTb]);

  return (
    <Guard section="ledger">
      <PageHeader title="Ledger" sub="Stored double-entry general ledger — the posted source of truth" />

      {authed === false && (
        <Card className="p-6 text-sm text-muted-foreground">
          The stored ledger is per-organization and requires sign-in. Sign in to your Tulmin
          account to create your organization ledger and post entries.
        </Card>
      )}

      {authed && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button onClick={onSync} disabled={busy || !orgId}>
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} /> Sync from activity
            </Button>
            <span className="text-xs text-muted-foreground">
              Posts {derivedGl.length} derived entries into the stored ledger (idempotent).
            </span>
            {msg && <span className="text-xs font-medium">{msg}</span>}
          </div>

          {/* Trial balance (stored) with derived parity */}
          <Card className="mb-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold">Trial Balance — stored ledger</span>
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium", balanced ? "text-success" : "text-danger")}>
                {balanced ? <><Check className="h-3.5 w-3.5" /> balanced</> : <><AlertCircle className="h-3.5 w-3.5" /> out of balance</>}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2 text-right">Derived</th>
                    <th className="px-3 py-2 text-center">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {stored.filter((r) => r.debit || r.credit).map((r) => {
                    const d = derivedByCode.get(r.code) ?? 0;
                    const match = Math.abs(r.balance - d) < 0.005;
                    return (
                      <tr key={r.code} className="border-b border-border last:border-0">
                        <td className="px-3 py-2"><span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.debit ? formatINR(r.debit) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.credit ? formatINR(r.credit) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(r.balance)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(d)}</td>
                        <td className="px-3 py-2 text-center">{match ? <Check className="mx-auto h-4 w-4 text-success" /> : <AlertCircle className="mx-auto h-4 w-4 text-danger" />}</td>
                      </tr>
                    );
                  })}
                  {stored.every((r) => !r.debit && !r.credit) && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No posted entries yet. Click “Sync from activity”.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/50 font-semibold">
                    <td className="px-3 py-2">Totals</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(storedTotals.debit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(storedTotals.credit)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* AR / AP aging */}
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            {([["Receivables (AR)", aging.ar], ["Payables (AP)", aging.ap]] as const).map(([title, rows]) => (
              <Card key={title} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="font-semibold">{title} aging</span>
                  <span className="tabular-nums font-medium">{formatINR(agingTotal(rows))}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.bucket} className="border-b border-border last:border-0">
                        <td className="px-4 py-1.5 text-muted-foreground">{r.bucket === "current" ? "Current" : `${r.bucket} days`}</td>
                        <td className="px-4 py-1.5 text-right text-xs text-muted-foreground">{r.count}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{formatINR(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>

          <ManualEntry orgId={orgId} onPosted={() => orgId && refresh(orgId)} />

          {flags.accountingSetup && orgId && (
            <AccountingSetup orgId={orgId} onLedgerChanged={() => refresh(orgId)} />
          )}
        </>
      )}
    </Guard>
  );
}

function ManualEntry({ orgId, onPosted }: { orgId: string | null; onPosted: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<FormLine[]>([newFormLine(), newFormLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const l of lines) {
      const a = parseFloat(l.amount) || 0;
      if (l.side === "debit") d += a; else c += a;
    }
    return { debit: Math.round(d * 100) / 100, credit: Math.round(c * 100) / 100 };
  }, [lines]);
  const balanced = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.005;
  const valid = balanced && lines.every((l) => !parseFloat(l.amount) || l.accountCode) && lines.filter((l) => parseFloat(l.amount) > 0 && l.accountCode).length >= 2;

  async function post() {
    if (!orgId || !valid) return;
    setBusy(true); setErr(null);
    const res = await postJournalEntry(orgId, {
      entryDate: date, memo: memo || undefined, sourceType: "manual",
      lines: lines.filter((l) => parseFloat(l.amount) > 0 && l.accountCode).map((l) => ({
        accountCode: l.accountCode,
        debit: l.side === "debit" ? parseFloat(l.amount) : 0,
        credit: l.side === "credit" ? parseFloat(l.amount) : 0,
      })),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? "Failed to post"); return; }
    setMemo(""); setLines([newFormLine(), newFormLine()]);
    onPosted();
  }

  const patch = (id: string, p: Partial<FormLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const inputCls = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3 font-semibold">Manual journal entry</div>
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Date</span>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Memo</span>
            <input className={inputCls} placeholder="Optional description" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
        </div>

        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2">
              <select className={cn(inputCls, "flex-1 min-w-[180px]")} value={l.accountCode} onChange={(e) => patch(l.id, { accountCode: e.target.value })}>
                <option value="">Select account…</option>
                {COA_LIST.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
              </select>
              <select className={cn(inputCls, "w-28")} value={l.side} onChange={(e) => patch(l.id, { side: e.target.value as "debit" | "credit" })}>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
              <input className={cn(inputCls, "w-32 text-right")} inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => patch(l.id, { amount: e.target.value })} />
              {lines.length > 2 && (
                <button onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          ))}
          <Button variant="secondary" onClick={() => setLines((ls) => [...ls, newFormLine()])}>
            <Plus className="h-4 w-4 text-primary" /> Add line
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
          <div className="flex gap-4">
            <span>Debit <span className="font-semibold tabular-nums">{formatINR(totals.debit)}</span></span>
            <span>Credit <span className="font-semibold tabular-nums">{formatINR(totals.credit)}</span></span>
            <span className={cn("inline-flex items-center gap-1 font-medium", balanced ? "text-success" : "text-muted-foreground")}>
              {balanced ? <><Check className="h-3.5 w-3.5" /> balanced</> : "not balanced"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {err && <span className="text-xs text-danger">{err}</span>}
            <Button onClick={post} disabled={!valid || busy}>Post entry</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
