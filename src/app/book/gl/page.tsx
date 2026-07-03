"use client";
/**
 * General Ledger (Phase 6) — account transactions with drill-down. Reads the
 * derived GL (parity-proven equal to the stored ledger) so every account's
 * postings, opening/closing balance and running balance are inspectable, with
 * a date range and a two-period comparison of net movement per account.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Button, Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { COA_LIST } from "@/book/lib/engine/accounting";
import { glEntries } from "@/book/lib/v2/reportDerived";
import { collectDocumentPostings } from "@/book/lib/core/documentPostings";
import {
  accountLedger, activeAccountCodes, compareAccountMovements,
  postingsFromGl, postingsFromJournal,
} from "@/book/lib/core/generalLedger";

/** Where a posting's source document lives, when it has a screen. */
function drillHref(sourceType: string, sourceId: string): string | null {
  switch (sourceType) {
    case "order_settlement":
    case "cogs": return `/book/orders/${encodeURIComponent(sourceId)}`;
    case "purchase":
    case "bill": return "/book/purchases";
    case "invoice":
    case "payment": return "/book/invoices";
    case "bank_import": return "/book/matching";
    default: return null;
  }
}

export default function GeneralLedgerPage() {
  const { state } = useV2();
  // The complete ledger = derived GL (orders/purchases/expenses/bank) +
  // document postings (invoices/receipts/credit notes), matching the stored
  // ledger the sync writes.
  const postings = useMemo(
    () => [...postingsFromGl(glEntries(state)), ...postingsFromJournal(collectDocumentPostings(state))],
    [state],
  );
  const active = useMemo(() => activeAccountCodes(postings), [postings]);

  const firstActive = COA_LIST.find((a) => active.has(a.code))?.code ?? "1000";
  const [code, setCode] = useState(firstActive);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [compare, setCompare] = useState(false);

  const led = useMemo(() => accountLedger(postings, code, { from: from || undefined, to: to || undefined }), [postings, code, from, to]);

  // this-month vs last-month movement comparison
  const now = new Date();
  const monthRange = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return { from: d.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  };
  const comparison = useMemo(
    () => (compare ? compareAccountMovements(postings, monthRange(0), monthRange(-1)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [postings, compare],
  );

  const input = "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  return (
    <Guard section="gl">
      <PageHeader title="General Ledger" sub="Account transactions & drill-down — straight from the ledger" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs"><span className="text-muted-foreground">Account</span>
          <select className={cn(input, "min-w-[240px]")} value={code} onChange={(e) => setCode(e.target.value)}>
            {COA_LIST.map((a) => (
              <option key={a.code} value={a.code}>{a.code} · {a.name}{active.has(a.code) ? "" : " (no activity)"}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs"><span className="text-muted-foreground">From</span>
          <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs"><span className="text-muted-foreground">To</span>
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(from || to) && <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>}
        <Button variant={compare ? "primary" : "secondary"} onClick={() => setCompare((v) => !v)}>Compare months</Button>
      </div>

      {compare && (
        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-border px-4 py-3 font-semibold">Net movement — this month vs last month</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">This month</th>
                  <th className="px-3 py-2 text-right">Last month</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((m) => (
                  <tr key={m.account.code} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/60" onClick={() => setCode(m.account.code)}>
                    <td className="px-3 py-2"><span className="font-mono text-xs text-muted-foreground">{m.account.code}</span> {m.account.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(m.a)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(m.b)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium", m.delta > 0 ? "text-success" : m.delta < 0 ? "text-danger" : "")}>{formatINR(m.delta)}</td>
                  </tr>
                ))}
                {comparison.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No movement in either month.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="inline-flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-primary" /> {led?.account.name}</span>
          {led && <span className="text-xs text-muted-foreground">Closing <span className="font-semibold tabular-nums text-foreground">{formatINR(led.closing)}</span></span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <td className="px-3 py-1.5" colSpan={5}>Opening balance{from ? ` (before ${from})` : ""}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatINR(led?.opening ?? 0)}</td>
              </tr>
              {led?.rows.map((r) => {
                const href = drillHref(r.sourceType, r.sourceId);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2">{r.description}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {href ? <Link href={href} className="text-primary hover:underline">{r.sourceType}</Link> : r.sourceType}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.debit ? formatINR(r.debit) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.credit ? formatINR(r.credit) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(r.balance)}</td>
                  </tr>
                );
              })}
              {led && led.rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No transactions for this account in range.</td></tr>
              )}
            </tbody>
            {led && led.rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/50 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>Totals · Closing</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(led.totalDebit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(led.totalCredit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(led.closing)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </Guard>
  );
}
