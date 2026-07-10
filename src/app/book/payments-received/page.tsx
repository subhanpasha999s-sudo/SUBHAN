"use client";
/** Payments Received (Zoho-style) — every receipt applied to an invoice. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { IndianRupee } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Card } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { SearchBox, matchesQuery } from "@/book/components/v2/ListControls";

export default function PaymentsReceivedPage() {
  const { state } = useV2();
  const [q, setQ] = useState("");
  const invoiceOf = (id: string) => state.invoices.find((i) => i.id === id);
  const customerName = (cid: string) => state.customers.find((c) => c.id === cid)?.name ?? "—";

  const allRows = useMemo(() =>
    [...(state.receipts ?? [])]
      .map((r) => { const inv = invoiceOf(r.invoiceId); return { r, inv, customer: inv ? customerName(inv.customerId) : "—" }; })
      .sort((a, b) => b.r.date.localeCompare(a.r.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.receipts, state.invoices, state.customers]);
  const rows = useMemo(() => allRows.filter((x) => matchesQuery(q, x.customer, x.inv?.number, x.r.reference)), [allRows, q]);
  const total = useMemo(() => allRows.reduce((s, x) => s + x.r.amount, 0), [allRows]);

  return (
    <Guard section="payments_in">
      <PageHeader title="Payments Received" sub="Receipts applied to customer invoices" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Received</p><p className="mt-2 text-2xl font-semibold tabular-nums text-success">{formatINR(total, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Payments</p><p className="mt-2 text-2xl font-semibold tabular-nums">{rows.length}</p></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <span className="font-semibold">All payments received</span>
          <SearchBox value={q} onChange={setQ} placeholder="Search customer, invoice…" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, inv, customer }) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2">{customer}</td>
                  <td className="px-3 py-2">
                    <Link href="/book/invoices" className="font-mono text-xs text-primary hover:underline">{inv?.number || r.invoiceId}</Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.reference || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(r.amount)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground"><IndianRupee className="mx-auto mb-2 h-6 w-6" />No payments received yet. Record receipts from an invoice.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Guard>
  );
}
