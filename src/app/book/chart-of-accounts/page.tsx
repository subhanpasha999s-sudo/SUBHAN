"use client";
/**
 * Chart of Accounts (Zoho-style) — every ledger account grouped by type with
 * its live balance, drawn from the complete ledger (derived GL + document
 * postings). Click an account to drill into its transactions.
 */
import { useMemo } from "react";
import Link from "next/link";
import { Wallet, Landmark, Scale, TrendingUp, TrendingDown } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { COA_LIST, type CoaType } from "@/book/lib/engine/accounting";
import { glEntries } from "@/book/lib/v2/reportDerived";
import { collectDocumentPostings } from "@/book/lib/core/documentPostings";
import { postingsFromGl, postingsFromJournal } from "@/book/lib/core/generalLedger";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const GROUPS: { type: CoaType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "asset", label: "Assets", icon: Wallet },
  { type: "liability", label: "Liabilities", icon: Landmark },
  { type: "equity", label: "Equity", icon: Scale },
  { type: "revenue", label: "Income", icon: TrendingUp },
  { type: "expense", label: "Expenses", icon: TrendingDown },
];

export default function ChartOfAccountsPage() {
  const { state } = useV2();

  const balances = useMemo(() => {
    const postings = [...postingsFromGl(glEntries(state)), ...postingsFromJournal(collectDocumentPostings(state))];
    const dr = new Map<string, number>();
    const cr = new Map<string, number>();
    for (const p of postings) {
      dr.set(p.accountCode, (dr.get(p.accountCode) ?? 0) + p.debit);
      cr.set(p.accountCode, (cr.get(p.accountCode) ?? 0) + p.credit);
    }
    const byCode = new Map<string, number>();
    for (const a of COA_LIST) {
      const d = dr.get(a.code) ?? 0, c = cr.get(a.code) ?? 0;
      byCode.set(a.code, round2(a.creditNormal ? c - d : d - c));
    }
    return byCode;
  }, [state]);

  const groupTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const g of GROUPS) t[g.type] = round2(COA_LIST.filter((a) => a.type === g.type).reduce((s, a) => s + (balances.get(a.code) ?? 0), 0));
    return t;
  }, [balances]);

  const assets = groupTotals.asset ?? 0;
  const liabEquity = round2((groupTotals.liability ?? 0) + (groupTotals.equity ?? 0));
  const netIncome = round2((groupTotals.revenue ?? 0) - (groupTotals.expense ?? 0));

  return (
    <Guard section="coa">
      <PageHeader title="Chart of Accounts" sub="Every account and its live balance — the backbone of your books" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Total assets</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatINR(assets, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Liabilities + equity</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatINR(liabEquity, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Income</p><p className="mt-2 text-2xl font-semibold tabular-nums text-success">{formatINR(groupTotals.revenue ?? 0, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Net income</p><p className={cn("mt-2 text-2xl font-semibold tabular-nums", netIncome < 0 && "text-danger")}>{formatINR(netIncome, true)}</p></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const accounts = COA_LIST.filter((a) => a.type === g.type);
          return (
            <Card key={g.type} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="inline-flex items-center gap-2 font-semibold"><g.icon className="h-4 w-4 text-primary" /> {g.label}</span>
                <span className="tabular-nums font-medium">{formatINR(groupTotals[g.type] ?? 0)}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {accounts.map((a) => {
                    const bal = balances.get(a.code) ?? 0;
                    return (
                      <tr key={a.code} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2">
                          <Link href="/book/gl" className="inline-flex items-baseline gap-2 hover:underline">
                            <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                            <span>{a.name}</span>
                          </Link>
                        </td>
                        <td className={cn("px-4 py-2 text-right tabular-nums", Math.abs(bal) < 0.005 && "text-muted-foreground/50")}>{formatINR(bal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Balances are computed live from your ledger. Manage custom accounts and post entries under <Link href="/book/ledger" className="text-primary hover:underline">Manual Journals</Link>.
      </p>
    </Guard>
  );
}
