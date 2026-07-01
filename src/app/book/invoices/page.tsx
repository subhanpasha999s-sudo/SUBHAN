"use client";
/**
 * Invoices (Phase 3 — Sales & Receivables). Create customer invoices, track
 * paid/partial/open status, and record receipts. Each invoice posts DR AR /
 * CR Sales into the stored ledger on the next Ledger sync (collectDocumentPostings).
 */
import { useMemo, useState } from "react";
import { Plus, IndianRupee } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { canDo } from "@/book/lib/v2/rbac";
import { arAgingFromState } from "@/book/lib/core/documentPostings";
import { agingTotal } from "@/book/lib/core/aging";

export default function InvoicesPage() {
  const { state, actions, me } = useV2();
  const canManage = canDo(me.role, "manage_invoices");
  const [adding, setAdding] = useState(false);

  const customerName = (id: string) => state.customers.find((c) => c.id === id)?.name ?? "—";
  const outstanding = useMemo(() => agingTotal(arAgingFromState(state, new Date().toISOString().slice(0, 10))), [state]);
  const invoices = useMemo(() => [...state.invoices].reverse(), [state.invoices]);

  return (
    <Guard section="invoices">
      <PageHeader
        title="Invoices"
        sub="Customer invoices & receivables"
        right={canManage ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New invoice</Button> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding (AR)</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatINR(outstanding, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Invoices</p><p className="mt-2 text-2xl font-semibold tabular-nums">{state.invoices.length}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Customers</p><p className="mt-2 text-2xl font-semibold tabular-nums">{state.customers.length}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Unpaid</p><p className="mt-2 text-2xl font-semibold tabular-nums">{state.invoices.filter((i) => i.status !== "paid").length}</p></Card>
      </div>

      {adding && <NewInvoice onClose={() => setAdding(false)} />}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">All invoices</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2">Status</th>
                {canManage && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{inv.number || inv.id}</td>
                  <td className="px-3 py-2">{customerName(inv.customerId)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(inv.invoiceDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(inv.dueDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(inv.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(inv.amountPaid)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={inv.status === "paid" ? "success" : inv.status === "partial" ? "warning" : "danger"}>{inv.status}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      {inv.status !== "paid" && (
                        <button
                          onClick={() => {
                            const raw = window.prompt(`Record receipt for ${inv.number || inv.id} (outstanding ${formatINR(inv.amount - inv.amountPaid)})`, String(inv.amount - inv.amountPaid));
                            const amt = raw ? parseFloat(raw) : NaN;
                            if (amt > 0) actions.recordInvoiceReceipt(inv.id, amt);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                          <IndianRupee className="h-3 w-3" /> Receipt
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={canManage ? 8 : 7} className="px-4 py-10 text-center text-muted-foreground">No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Guard>
  );
}

function NewInvoice({ onClose }: { onClose: () => void }) {
  const { state, actions } = useV2();
  const [customerId, setCustomerId] = useState("");
  const [newName, setNewName] = useState(state.customers.length === 0 ? "" : "");
  const [addNew, setAddNew] = useState(state.customers.length === 0);
  const [number, setNumber] = useState(`INV-${String(state.invoices.length + 1).padStart(4, "0")}`);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const amt = parseFloat(amount) || 0;
  const valid = amt > 0 && number.trim() && (addNew ? newName.trim() : customerId);
  const input = "h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm outline-none focus:border-primary";

  function save() {
    if (!valid) return;
    let cid = customerId;
    if (addNew) cid = actions.addCustomer({ name: newName.trim() });
    actions.addInvoice({ customerId: cid, number: number.trim(), amount: amt, invoiceDate, dueDate, notes: notes || undefined });
    onClose();
  }

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border px-4 py-3 font-semibold">New invoice</div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium">Customer<span className="text-danger">*</span></label>
          {addNew ? (
            <div className="flex gap-2">
              <input className={input} placeholder="Customer name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              {state.customers.length > 0 && <button onClick={() => setAddNew(false)} className="h-11 shrink-0 rounded-lg border border-border px-3 text-sm hover:bg-muted">Pick existing</button>}
            </div>
          ) : (
            <div className="flex gap-2">
              <select className={input} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select customer…</option>
                {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => { setAddNew(true); setCustomerId(""); }} className="flex h-11 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-muted"><Plus className="h-4 w-4 text-primary" /> New</button>
            </div>
          )}
        </div>
        <label className="space-y-2 text-sm"><span className="font-medium">Invoice #<span className="text-danger">*</span></span><input className={input} value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Amount (₹)<span className="text-danger">*</span></span><input className={input} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Invoice date</span><input type="date" className={input} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></label>
        <label className="space-y-2 text-sm"><span className="font-medium">Due date</span><input type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label className="space-y-2 text-sm md:col-span-2"><span className="font-medium">Notes</span><input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Button onClick={save} disabled={!valid}>Save invoice</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <span className={cn("ml-auto text-xs", valid ? "text-muted-foreground" : "text-muted-foreground/60")}>Posts DR Accounts Receivable / CR Sales on ledger sync</span>
      </div>
    </Card>
  );
}
