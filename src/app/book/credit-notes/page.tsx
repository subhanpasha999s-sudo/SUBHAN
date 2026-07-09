"use client";
/** Credit Notes (Zoho-style) — customer credits applied against invoices. */
import { useMemo } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Card } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

export default function CreditNotesPage() {
  const { state } = useV2();
  const invoiceOf = (id: string) => state.invoices.find((i) => i.id === id);
  const customerName = (cid: string) => state.customers.find((c) => c.id === cid)?.name ?? "—";

  const rows = useMemo(() =>
    [...(state.creditNotes ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [state.creditNotes]);
  const total = useMemo(() => rows.reduce((s, c) => s + c.amount, 0), [rows]);

  return (
    <Guard section="credit_notes">
      <PageHeader title="Credit Notes" sub="Customer credits — reduce receivables, applied against invoices" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Credited</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatINR(total, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Credit notes</p><p className="mt-2 text-2xl font-semibold tabular-nums">{rows.length}</p></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">All credit notes</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Credit note</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Against invoice</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const inv = invoiceOf(c.invoiceId);
                return (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs">{c.number}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(c.date)}</td>
                    <td className="px-3 py-2">{customerName(c.customerId)}</td>
                    <td className="px-3 py-2"><Link href="/book/invoices" className="font-mono text-xs text-primary hover:underline">{inv?.number || c.invoiceId}</Link></td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground">{c.reason || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(c.amount)}</td>
                    <td className="px-3 py-2"><Badge tone="success">{c.status}</Badge></td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground"><FileText className="mx-auto mb-2 h-6 w-6" />No credit notes yet. Create one from an invoice.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Guard>
  );
}
