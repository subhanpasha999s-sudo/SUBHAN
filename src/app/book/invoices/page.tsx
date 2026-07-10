"use client";
/**
 * Invoices (Phase 3 — Sales & Receivables). Create customer invoices, track
 * paid/partial/open status, and record receipts. Each invoice posts DR AR /
 * CR Sales into the stored ledger on the next Ledger sync (collectDocumentPostings).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, IndianRupee, Repeat, FileText } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { SearchBox, FilterChips, matchesQuery, useSort, SortHeader } from "@/book/components/v2/ListControls";
import { formatINR } from "@/book/lib/engine";
import { canDo } from "@/book/lib/v2/rbac";
import { arAgingFromState } from "@/book/lib/core/documentPostings";
import { agingTotal } from "@/book/lib/core/aging";

export default function InvoicesPage() {
  const { state, actions, me } = useV2();
  const canManage = canDo(me.role, "manage_invoices");
  const [adding, setAdding] = useState(false);

  // Client-side scheduler: materialize due recurring invoices + raise
  // overdue reminders (throttled in the store) once per visit.
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current || !canManage) return;
    ranRef.current = true;
    actions.runRecurringInvoices();
    actions.runPaymentReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  // Global quick-create deep-link (?new=1 opens the form).
  useEffect(() => {
    if (canManage && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1") setAdding(true);
  }, [canManage]);

  async function downloadPdf(inv: (typeof state.invoices)[number]) {
    const { buildInvoicePdf } = await import("@/book/lib/core/invoicePdf");
    const bytes = await buildInvoicePdf({
      org: state.org,
      invoice: inv,
      customer: state.customers.find((c) => c.id === inv.customerId),
    });
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.number || inv.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const today = new Date().toISOString().slice(0, 10);

  const customerName = (id: string) => state.customers.find((c) => c.id === id)?.name ?? "—";
  const outstanding = useMemo(() => agingTotal(arAgingFromState(state, new Date().toISOString().slice(0, 10))), [state]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const allInvoices = useMemo(() => [...state.invoices].reverse(), [state.invoices]);
  const isOverdue = (inv: (typeof allInvoices)[number]) => inv.status !== "paid" && inv.dueDate < today;
  const counts = useMemo(() => ({
    all: allInvoices.length,
    open: allInvoices.filter((i) => i.status === "open").length,
    overdue: allInvoices.filter(isOverdue).length,
    partial: allInvoices.filter((i) => i.status === "partial").length,
    paid: allInvoices.filter((i) => i.status === "paid").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [allInvoices]);
  const sort = useSort<(typeof allInvoices)[number]>("date", "desc");
  const invoices = useMemo(() => {
    const filtered = allInvoices.filter((inv) => {
      if (status === "overdue" ? !isOverdue(inv) : status !== "all" && inv.status !== status) return false;
      return matchesQuery(q, inv.number, customerName(inv.customerId), inv.notes);
    });
    return sort.sort(filtered, {
      number: (i) => i.number || i.id,
      customer: (i) => customerName(i.customerId).toLowerCase(),
      date: (i) => i.invoiceDate,
      due: (i) => i.dueDate,
      amount: (i) => i.amount,
      paid: (i) => i.amountPaid,
      status: (i) => i.status,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allInvoices, q, status, sort.key, sort.dir]);

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <FilterChips
            active={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "open", label: "Open", count: counts.open },
              { value: "overdue", label: "Overdue", count: counts.overdue },
              { value: "partial", label: "Partial", count: counts.partial },
              { value: "paid", label: "Paid", count: counts.paid },
            ]}
          />
          <SearchBox value={q} onChange={setQ} placeholder="Search invoice # or customer…" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <SortHeader label="Invoice" sortKey="number" active={sort.key} dir={sort.dir} onSort={sort.toggle} />
                <SortHeader label="Customer" sortKey="customer" active={sort.key} dir={sort.dir} onSort={sort.toggle} />
                <SortHeader label="Date" sortKey="date" active={sort.key} dir={sort.dir} onSort={sort.toggle} />
                <SortHeader label="Due" sortKey="due" active={sort.key} dir={sort.dir} onSort={sort.toggle} />
                <SortHeader label="Amount" sortKey="amount" active={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                <SortHeader label="Paid" sortKey="paid" active={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                <SortHeader label="Status" sortKey="status" active={sort.key} dir={sort.dir} onSort={sort.toggle} />
                {canManage && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{inv.number || inv.id}</td>
                  <td className="px-3 py-2">{customerName(inv.customerId)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(inv.invoiceDate)}</td>
                  <td className={cn("whitespace-nowrap px-3 py-2 text-xs", inv.status !== "paid" && inv.dueDate < today && "font-medium text-danger")}>
                    {fmtDate(inv.dueDate)}{inv.status !== "paid" && inv.dueDate < today && " ⚠"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(inv.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatINR(inv.amountPaid)}
                    {(inv.amountCredited ?? 0) > 0.005 && (
                      <span className="block text-[11px] text-muted-foreground/80">+ CN {formatINR(inv.amountCredited!)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={inv.status === "paid" ? "success" : inv.status === "partial" ? "warning" : "danger"}>{inv.status}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => downloadPdf(inv)} title="Download PDF"
                        className="mr-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">PDF</button>
                      {inv.status !== "paid" && inv.dueDate < today && (
                        <button onClick={() => actions.remindInvoice(inv.id)} title="Log a payment reminder"
                          className="mr-1.5 rounded-md border border-border px-2 py-1 text-xs text-warning hover:bg-muted">Remind</button>
                      )}
                      {inv.status !== "paid" && (() => {
                        const outstanding = Math.round((inv.amount - inv.amountPaid - (inv.amountCredited ?? 0)) * 100) / 100;
                        return (
                          <span className="inline-flex gap-1.5">
                            <button
                              onClick={() => {
                                const raw = window.prompt(`Record receipt for ${inv.number || inv.id} (outstanding ${formatINR(outstanding)})`, String(outstanding));
                                const amt = raw ? parseFloat(raw) : NaN;
                                if (amt > 0) actions.recordInvoiceReceipt(inv.id, amt);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                              <IndianRupee className="h-3 w-3" /> Receipt
                            </button>
                            <button
                              onClick={() => {
                                const raw = window.prompt(`Credit note against ${inv.number || inv.id} (outstanding ${formatINR(outstanding)})`, String(outstanding));
                                const amt = raw ? parseFloat(raw) : NaN;
                                if (!(amt > 0)) return;
                                const reason = window.prompt("Reason (optional)") ?? undefined;
                                const r = actions.addCreditNote(inv.id, amt, reason);
                                if (!r.ok && r.message) window.alert(r.message);
                              }}
                              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                              Credit
                            </button>
                          </span>
                        );
                      })()}
                    </td>
                  )}
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={canManage ? 8 : 7} className="px-4 py-10 text-center text-muted-foreground">{allInvoices.length === 0 ? "No invoices yet." : "No invoices match your search."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <EstimatesCard canManage={canManage} />
        <RecurringCard canManage={canManage} />
      </div>
    </Guard>
  );
}

/** Estimates (quotes): non-financial; convert to invoice when won. */
function EstimatesCard({ canManage }: { canManage: boolean }) {
  const { state, actions } = useV2();
  const [adding, setAdding] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [expiry, setExpiry] = useState("");
  const customerName = (id: string) => state.customers.find((c) => c.id === id)?.name ?? "—";
  const estimates = useMemo(() => [...(state.estimates ?? [])].reverse(), [state.estimates]);
  const input = "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  const valid = customerId && (parseFloat(amount) || 0) > 0;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="inline-flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" /> Estimates</span>
        {canManage && <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> New estimate</Button>}
      </div>
      {adding && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 p-3">
          <select className={cn(input, "min-w-[160px] flex-1")} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Customer…</option>
            {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className={cn(input, "w-28 text-right")} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input type="date" className={cn(input, "w-40")} title="Expiry (optional)" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <Button disabled={!valid} onClick={() => {
            actions.addEstimate({ customerId, amount: parseFloat(amount), date: new Date().toISOString().slice(0, 10), expiryDate: expiry || undefined });
            setAdding(false); setCustomerId(""); setAmount(""); setExpiry("");
          }}>Save</Button>
        </div>
      )}
      <div className="divide-y divide-border text-sm">
        {estimates.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="font-mono text-xs">{e.number}</span>
            <span className="truncate">{customerName(e.customerId)}</span>
            <span className="ml-auto tabular-nums font-medium">{formatINR(e.amount)}</span>
            <Badge tone={e.status === "invoiced" ? "success" : e.status === "accepted" ? "info" : e.status === "declined" ? "danger" : "default"}>{e.status}</Badge>
            {canManage && e.status === "open" && (
              <span className="flex gap-1">
                <button onClick={() => actions.setEstimateStatus(e.id, "accepted")} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">Accept</button>
                <button onClick={() => actions.setEstimateStatus(e.id, "declined")} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">Decline</button>
              </span>
            )}
            {canManage && (e.status === "open" || e.status === "accepted") && (
              <button onClick={() => { const r = actions.convertEstimateToInvoice(e.id); if (!r.ok && r.message) window.alert(r.message); }}
                className="rounded-md border border-border px-2 py-0.5 text-xs text-primary hover:bg-muted">→ Invoice</button>
            )}
          </div>
        ))}
        {estimates.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">No estimates yet.</p>}
      </div>
    </Card>
  );
}

/** Recurring invoices: monthly schedules materialized on page load. */
function RecurringCard({ canManage }: { canManage: boolean }) {
  const { state, actions } = useV2();
  const [adding, setAdding] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const customerName = (id: string) => state.customers.find((c) => c.id === id)?.name ?? "—";
  const recs = state.recurringInvoices ?? [];
  const input = "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  const valid = customerId && (parseFloat(amount) || 0) > 0 && (parseInt(day, 10) || 0) >= 1;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="inline-flex items-center gap-2 font-semibold"><Repeat className="h-4 w-4 text-primary" /> Recurring invoices</span>
        {canManage && <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> New schedule</Button>}
      </div>
      {adding && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 p-3">
          <select className={cn(input, "min-w-[160px] flex-1")} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Customer…</option>
            {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className={cn(input, "w-28 text-right")} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">day
            <input className={cn(input, "w-16 text-right")} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <Button disabled={!valid} onClick={() => {
            // due-today billing happens atomically inside addRecurringInvoice
            actions.addRecurringInvoice({ customerId, amount: parseFloat(amount), dayOfMonth: parseInt(day, 10) });
            setAdding(false); setCustomerId(""); setAmount(""); setDay("1");
          }}>Save</Button>
        </div>
      )}
      <div className="divide-y divide-border text-sm">
        {recs.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="truncate">{customerName(r.customerId)}</span>
            <span className="text-xs text-muted-foreground">monthly · day {r.dayOfMonth}</span>
            <span className="ml-auto tabular-nums font-medium">{formatINR(r.amount)}</span>
            <span className="text-xs text-muted-foreground">next {r.nextRunDate}</span>
            {canManage && (
              <button onClick={() => actions.toggleRecurringInvoice(r.id, !r.active)}
                className={cn("rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted", r.active ? "text-success" : "text-muted-foreground")}>
                {r.active ? "Active" : "Paused"}
              </button>
            )}
          </div>
        ))}
        {recs.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">No recurring schedules.</p>}
      </div>
    </Card>
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
