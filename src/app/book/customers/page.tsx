"use client";
/**
 * Customers (Phase 3 — Sales & Receivables). Customer master with balances and
 * a per-customer statement: invoices (debits) and receipts (credits) in date
 * order with a running balance — the classic ledger-style account statement.
 */
import { useMemo, useState } from "react";
import { Plus, FileText } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { canDo } from "@/book/lib/v2/rbac";

interface CustomerRow {
  id: string;
  name: string;
  invoiceCount: number;
  invoiced: number;
  received: number;
  outstanding: number;
  lastActivity: string | null;
}

interface StatementLine {
  date: string;
  kind: "invoice" | "receipt";
  label: string;
  debit: number;   // invoice amount (customer owes more)
  credit: number;  // receipt amount (customer owes less)
}

export default function CustomersPage() {
  const { state, actions, me } = useV2();
  const canManage = canDo(me.role, "manage_invoices");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo<CustomerRow[]>(() => {
    return state.customers.map((c) => {
      const invoices = state.invoices.filter((i) => i.customerId === c.id);
      const invoiced = invoices.reduce((s, i) => s + i.amount, 0);
      const received = invoices.reduce((s, i) => s + i.amountPaid, 0);
      const dates = invoices.map((i) => i.invoiceDate).sort();
      return {
        id: c.id,
        name: c.name,
        invoiceCount: invoices.length,
        invoiced: Math.round(invoiced * 100) / 100,
        received: Math.round(received * 100) / 100,
        outstanding: Math.round((invoiced - received) * 100) / 100,
        lastActivity: dates[dates.length - 1] ?? null,
      };
    });
  }, [state.customers, state.invoices]);

  const totals = useMemo(() => ({
    outstanding: Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100,
    invoiced: Math.round(rows.reduce((s, r) => s + r.invoiced, 0) * 100) / 100,
    received: Math.round(rows.reduce((s, r) => s + r.received, 0) * 100) / 100,
  }), [rows]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // Statement for the selected customer: invoices + receipts in date order.
  const statement = useMemo<StatementLine[]>(() => {
    if (!selectedId) return [];
    const lines: StatementLine[] = [];
    const invoiceIds = new Set<string>();
    for (const inv of state.invoices) {
      if (inv.customerId !== selectedId) continue;
      invoiceIds.add(inv.id);
      lines.push({ date: inv.invoiceDate, kind: "invoice", label: `Invoice ${inv.number || inv.id}`, debit: inv.amount, credit: 0 });
    }
    for (const r of state.receipts ?? []) {
      if (!invoiceIds.has(r.invoiceId)) continue;
      const inv = state.invoices.find((i) => i.id === r.invoiceId);
      lines.push({ date: r.date, kind: "receipt", label: `Receipt — ${inv?.number || r.invoiceId}`, debit: 0, credit: r.amount });
    }
    return lines.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "invoice" ? -1 : 1));
  }, [selectedId, state.invoices, state.receipts]);

  function addCustomer() {
    const n = name.trim();
    if (!n) return;
    actions.addCustomer({ name: n });
    setName("");
    setAdding(false);
  }

  return (
    <Guard section="customers">
      <PageHeader
        title="Customers"
        sub="Customer master, balances & statements"
        right={canManage ? <Button onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> New customer</Button> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Customers</p><p className="mt-2 text-2xl font-semibold tabular-nums">{rows.length}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p><p className={cn("mt-2 text-2xl font-semibold tabular-nums", totals.outstanding > 0 && "text-warning")}>{formatINR(totals.outstanding, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Invoiced</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatINR(totals.invoiced, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Received</p><p className="mt-2 text-2xl font-semibold tabular-nums text-success">{formatINR(totals.received, true)}</p></Card>
      </div>

      {adding && (
        <Card className="mb-6 flex flex-wrap items-center gap-2 p-4">
          <input
            className="h-11 min-w-[240px] flex-1 rounded-lg border border-border bg-background px-3.5 text-sm outline-none focus:border-primary"
            placeholder="Customer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustomer(); }}
          />
          <Button onClick={addCustomer} disabled={!name.trim()}>Save customer</Button>
          <Button variant="ghost" onClick={() => { setAdding(false); setName(""); }}>Cancel</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">All customers</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Invoices</th>
                <th className="px-3 py-2 text-right">Invoiced</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2">Last invoice</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}
                  className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-muted/60", selectedId === r.id && "bg-muted/60")}
                  onClick={() => setSelectedId((cur) => (cur === r.id ? null : r.id))}>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.invoiceCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.invoiced)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(r.received)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-medium", r.outstanding > 0.005 && "text-warning")}>{formatINR(r.outstanding)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{r.lastActivity ? fmtDate(r.lastActivity) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1 text-xs text-primary"><FileText className="h-3.5 w-3.5" /> Statement</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No customers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="font-semibold">Statement — {selected.name}</span>
            <Badge tone={selected.outstanding > 0.005 ? "warning" : "success"}>
              {selected.outstanding > 0.005 ? `Owes ${formatINR(selected.outstanding)}` : "Settled"}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Detail</th>
                  <th className="px-3 py-2 text-right">Invoiced</th>
                  <th className="px-3 py-2 text-right">Received</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let bal = 0;
                  return statement.map((l, i) => {
                    bal = Math.round((bal + l.debit - l.credit) * 100) / 100;
                    return (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(l.date)}</td>
                        <td className="px-3 py-2">{l.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.debit ? formatINR(l.debit) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-success">{l.credit ? formatINR(l.credit) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(bal)}</td>
                      </tr>
                    );
                  });
                })()}
                {statement.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No transactions for this customer yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Guard>
  );
}
