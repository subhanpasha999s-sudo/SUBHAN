"use client";
/**
 * Phase 1 (upgrade spec) — org accounting setup on the stored ledger:
 *   • Chart of Accounts manager (custom accounts, archive/restore)
 *   • Accounting periods (generate Indian FY, close/reopen — closed periods
 *     reject postings via a DB trigger, not just UI)
 *   • Opening balances wizard (posts ONE balanced entry, equity-plugged,
 *     idempotent via externalId "opening-balance")
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Lock, LockOpen, Plus } from "lucide-react";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import type { CoaType } from "@/book/lib/engine/accounting";
import { openingBalanceEntry, EmptyOpeningBalanceError, type OpeningBalanceLine } from "@/book/lib/core/postings";
import {
  fetchAccounts, addAccount, setAccountArchived,
  fetchPeriods, generateFiscalYear, setPeriodStatus,
  postJournalEntry, type OrgAccount, type OrgPeriod,
} from "@/book/lib/core/ledgerRemote";

const input = "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const ACCOUNT_TYPES: CoaType[] = ["asset", "liability", "equity", "revenue", "expense"];

export default function AccountingSetup({ orgId, onLedgerChanged }: { orgId: string; onLedgerChanged: () => void }) {
  const [accounts, setAccounts] = useState<OrgAccount[]>([]);
  const [periods, setPeriods] = useState<OrgPeriod[]>([]);

  const refresh = useCallback(async () => {
    const [a, p] = await Promise.all([fetchAccounts(orgId), fetchPeriods(orgId)]);
    setAccounts(a);
    setPeriods(p);
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="mt-6 space-y-6">
      <CoaManager orgId={orgId} accounts={accounts} onChanged={refresh} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PeriodsManager orgId={orgId} periods={periods} onChanged={refresh} />
        <OpeningBalances orgId={orgId} accounts={accounts} onPosted={onLedgerChanged} />
      </div>
    </div>
  );
}

// ── Chart of Accounts ─────────────────────────────────────────────────
function CoaManager({ orgId, accounts, onChanged }: { orgId: string; accounts: OrgAccount[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<CoaType>("expense");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!code.trim() || !name.trim()) return;
    setBusy(true); setErr(null);
    const res = await addAccount(orgId, { code, name, type });
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? "Failed"); return; }
    setCode(""); setName(""); setAdding(false);
    onChanged();
  }

  async function toggleArchived(a: OrgAccount) {
    setErr(null);
    const res = await setAccountArchived(orgId, a.id, !a.archived);
    if (!res.ok) setErr(res.message ?? "Failed");
    onChanged();
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="font-semibold">Chart of Accounts</span>
        <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4 text-primary" /> Custom account</Button>
      </div>
      {adding && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 p-3">
          <input className={cn(input, "w-24")} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className={cn(input, "min-w-[200px] flex-1")} placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={input} value={type} onChange={(e) => setType(e.target.value as CoaType)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button onClick={save} disabled={busy || !code.trim() || !name.trim()}>Add</Button>
          {err && <span className="text-xs text-danger">{err}</span>}
        </div>
      )}
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className={cn("border-b border-border last:border-0", a.archived && "opacity-50")}>
                <td className="px-4 py-2 font-mono text-xs">{a.code}</td>
                <td className="px-3 py-2">{a.name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{a.type}</td>
                <td className="px-3 py-2">{a.isSystem ? <Badge tone="default">system</Badge> : <Badge tone="info">custom</Badge>}</td>
                <td className="px-3 py-2 text-right">
                  {!a.isSystem && (
                    <button onClick={() => toggleArchived(a)} title={a.archived ? "Restore" : "Archive"}
                      className="text-muted-foreground hover:text-foreground">
                      {a.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Accounting periods ────────────────────────────────────────────────
function PeriodsManager({ orgId, periods, onChanged }: { orgId: string; periods: OrgPeriod[]; onChanged: () => void }) {
  const fyDefault = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [year, setYear] = useState(String(fyDefault));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    const y = parseInt(year, 10);
    if (!y || y < 2000 || y > 2100) return;
    setBusy(true); setErr(null);
    const res = await generateFiscalYear(orgId, y);
    setBusy(false);
    if (!res.ok) setErr(res.message ?? "Failed");
    onChanged();
  }

  async function toggle(p: OrgPeriod) {
    setErr(null);
    const res = await setPeriodStatus(orgId, p.id, p.status === "open" ? "closed" : "open");
    if (!res.ok) setErr(res.message ?? "Failed");
    onChanged();
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3 font-semibold">Accounting periods</div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 p-3">
        <span className="text-sm text-muted-foreground">FY (Apr–Mar) starting</span>
        <input className={cn(input, "w-24")} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        <Button variant="secondary" onClick={generate} disabled={busy}>Generate months</Button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
      <div className="max-h-72 overflow-y-auto">
        {periods.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No periods yet — generate a fiscal year.</p>}
        <table className="w-full text-sm">
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{p.startDate} → {p.endDate}</td>
                <td className="px-3 py-2">
                  <Badge tone={p.status === "closed" ? "warning" : "success"}>{p.status}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => toggle(p)} title={p.status === "open" ? "Close period (locks postings)" : "Reopen period"}
                    className="text-muted-foreground hover:text-foreground">
                    {p.status === "open" ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Closed periods reject postings at the database level.
      </p>
    </Card>
  );
}

// ── Opening balances wizard ───────────────────────────────────────────
function OpeningBalances({ orgId, accounts, onPosted }: { orgId: string; accounts: OrgAccount[]; onPosted: () => void }) {
  const usable = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const [date, setDate] = useState(() => {
    const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    return `${y}-04-01`;
  });
  const [rows, setRows] = useState<Record<string, string>>({}); // accountId -> amount
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lines = useMemo<OpeningBalanceLine[]>(() =>
    usable
      .map((a) => ({ a, amt: parseFloat(rows[a.id] ?? "") || 0 }))
      .filter((x) => x.amt > 0)
      .map((x) => ({
        accountCode: x.a.code,
        amount: x.amt,
        side: (x.a.creditNormal ? "credit" : "debit") as OpeningBalanceLine["side"],
      })), [usable, rows]);

  const plug = useMemo(() => {
    const d = lines.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0);
    const c = lines.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0);
    return Math.round((d - c) * 100) / 100;
  }, [lines]);

  async function post() {
    setBusy(true); setMsg(null);
    try {
      const entry = openingBalanceEntry(lines, date);
      const res = await postJournalEntry(orgId, entry);
      setMsg(res.ok ? "Opening balances posted." : res.message ?? "Failed");
      if (res.ok) { setRows({}); onPosted(); }
    } catch (e) {
      setMsg(e instanceof EmptyOpeningBalanceError ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3 font-semibold">Opening balances</div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 p-3 text-sm">
        <span className="text-muted-foreground">As of</span>
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {usable.filter((a) => !a.isSystem || ["asset", "liability", "equity"].includes(a.type)).map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-1.5"><span className="font-mono text-xs text-muted-foreground">{a.code}</span> {a.name}</td>
                <td className="px-3 py-1.5 text-right">
                  <input className={cn(input, "h-8 w-28 text-right")} inputMode="decimal" placeholder="0.00"
                    value={rows[a.id] ?? ""} onChange={(e) => setRows((r) => ({ ...r, [a.id]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Equity plug: <span className={cn("font-medium tabular-nums", plug >= 0 ? "text-success" : "text-warning")}>{formatINR(Math.abs(plug))} {plug >= 0 ? "CR" : "DR"}</span> to 3100 Owner Equity
        </span>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-xs">{msg}</span>}
          <Button onClick={post} disabled={busy || lines.length === 0}>Post opening entry</Button>
        </div>
      </div>
    </Card>
  );
}
