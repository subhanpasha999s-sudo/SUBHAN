"use client";
/** Payments Made (Zoho-style) — every payment applied to a vendor bill. */
import { useMemo } from "react";
import Link from "next/link";
import { IndianRupee } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Card } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

export default function PaymentsMadePage() {
  const { state } = useV2();
  const billOf = (id: string) => state.purchases.find((p) => p.id === id);

  const rows = useMemo(() =>
    [...(state.billPayments ?? [])]
      .map((p) => { const bill = billOf(p.purchaseId); return { p, bill, vendor: bill?.supplierName ?? "—" }; })
      .sort((a, b) => b.p.date.localeCompare(a.p.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.billPayments, state.purchases]);
  const total = useMemo(() => rows.reduce((s, x) => s + x.p.amount, 0), [rows]);

  return (
    <Guard section="payments_out">
      <PageHeader title="Payments Made" sub="Payments applied to vendor bills" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p><p className="mt-2 text-2xl font-semibold tabular-nums text-danger">{formatINR(total, true)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Payments</p><p className="mt-2 text-2xl font-semibold tabular-nums">{rows.length}</p></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">All payments made</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Bill</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, bill, vendor }) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(p.date)}</td>
                  <td className="px-3 py-2">{vendor}</td>
                  <td className="px-3 py-2">
                    <Link href="/book/purchases" className="font-mono text-xs text-primary hover:underline">{bill?.invoiceNo || p.purchaseId}</Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.reference || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatINR(p.amount)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground"><IndianRupee className="mx-auto mb-2 h-6 w-6" />No payments made yet. Record payments from a bill.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Guard>
  );
}
