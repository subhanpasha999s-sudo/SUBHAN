"use client";
/**
 * Chart of Accounts (Zoho-style) — every ledger account grouped by type with
 * its live balance, drawn from the complete ledger (derived GL + document
 * postings). Click an account to drill into its transactions.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, Landmark, Scale, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { COA_LIST, type CoaType } from "@/book/lib/engine/accounting";
import { glEntries } from "@/book/lib/v2/reportDerived";
import { collectDocumentPostings } from "@/book/lib/core/documentPostings";
import { postingsFromGl, postingsFromJournal } from "@/book/lib/core/generalLedger";
import { flags } from "@/book/lib/flags";
import { isLedgerAuthed, ensureOrg, fetchAccounts, addAccount, setAccountArchived, type OrgAccount } from "@/book/lib/core/ledgerRemote";

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

      {flags.accountingSetup && <CustomAccounts />}

      <p className="mt-4 text-xs text-muted-foreground">
        Standard-account balances are computed live from your ledger. Post entries under <Link href="/book/ledger" className="text-primary hover:underline">Manual Journals</Link>.
      </p>
    </Guard>
  );
}

/** Custom (non-standard) accounts, managed in the org's stored ledger. Requires sign-in. */
function CustomAccounts() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [custom, setCustom] = useState<OrgAccount[]>([]);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<CoaType>("expense");
  const standard = useMemo(() => new Set(COA_LIST.map((a) => a.code)), []);

  async function refresh(org: string) {
    const all = await fetchAccounts(org);
    setCustom(all.filter((a) => !standard.has(a.code)));
  }
  useEffect(() => {
    (async () => {
      const ok = await isLedgerAuthed();
      setAuthed(ok);
      if (!ok) return;
      const org = await ensureOrg();
      setOrgId(org);
      if (org) await refresh(org);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    if (!orgId || !code.trim() || !name.trim()) return;
    const res = await addAccount(orgId, { code: code.trim(), name: name.trim(), type });
    if (!res.ok) { window.alert(res.message ?? "Could not add account."); return; }
    setCode(""); setName(""); setAdding(false);
    await refresh(orgId);
  }
  const input = "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-semibold">Custom accounts</span>
        {authed && <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> New account</Button>}
      </div>
      {authed === false && (
        <p className="px-4 py-4 text-sm text-muted-foreground">Sign in to add custom accounts beyond the standard chart.</p>
      )}
      {authed && (
        <>
          {adding && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 p-3">
              <input className={cn(input, "w-24")} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
              <input className={cn(input, "min-w-[200px] flex-1")} placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} />
              <select className={input} value={type} onChange={(e) => setType(e.target.value as CoaType)}>
                {(["asset", "liability", "equity", "revenue", "expense"] as CoaType[]).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Button onClick={add} disabled={!code.trim() || !name.trim()}>Save</Button>
            </div>
          )}
          <div className="divide-y divide-border text-sm">
            {custom.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-4 py-2">
                <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                <span className={cn(a.archived && "text-muted-foreground line-through")}>{a.name}</span>
                <Badge tone="default">{a.type}</Badge>
                {a.archived && <Badge tone="danger">archived</Badge>}
                <button onClick={async () => { await setAccountArchived(orgId!, a.id, !a.archived); await refresh(orgId!); }}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground">{a.archived ? "Restore" : "Archive"}</button>
              </div>
            ))}
            {custom.length === 0 && !adding && <p className="px-4 py-4 text-sm text-muted-foreground">No custom accounts yet — the standard chart above covers most needs.</p>}
          </div>
        </>
      )}
    </Card>
  );
}
