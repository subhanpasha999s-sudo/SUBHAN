"use client";
/** Purchases — stock IN with weighted-average COGS updates + supplier list. */
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card } from "@/book/components/ui";
import { canDo } from "@/book/lib/v2/rbac";
import { formatINR, formatNum } from "@/book/lib/engine";
import BillForm from "@/book/components/v2/BillForm";

export default function PurchasesPage() {
  const { state, me, actions } = useV2();
  const [adding, setAdding] = useState(false);
  const canPay = canDo(me.role, "record_payment");
  const apOutstanding = useMemo(
    () => state.purchases.reduce((s, p) => s + (p.paymentStatus === "paid" ? 0 : p.totalAmount - (p.amountPaid ?? 0)), 0),
    [state.purchases],
  );

  const suppliers = useMemo(() => {
    const map = new Map<string, { total: number; count: number; pending: number }>();
    for (const p of state.purchases) {
      const s = map.get(p.supplierName) ?? { total: 0, count: 0, pending: 0 };
      s.total += p.totalAmount;
      s.count++;
      if (p.paymentStatus !== "paid") s.pending++;
      map.set(p.supplierName, s);
    }
    return Array.from(map.entries());
  }, [state.purchases]);

  const canAdd = canDo(me.role, "add_purchase");

  return (
    <Guard section="purchases">
      {adding && <BillForm onClose={() => setAdding(false)} />}
      <PageHeader
        title="Purchase Bill"
        sub="Stock IN — each bill updates weighted-average COGS"
        right={canAdd ? (
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New bill</Button>
        ) : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-semibold">Purchase history</span>
            <span className="text-xs text-muted-foreground">AP outstanding <span className="font-semibold tabular-nums text-foreground">{formatINR(apOutstanding, true)}</span></span>
          </div>
          <div className="divide-y divide-border text-sm">
            {[...state.purchases].reverse().map((p) => {
              const paid = p.amountPaid ?? (p.paymentStatus === "paid" ? p.totalAmount : 0);
              const outstanding = Math.max(0, Math.round((p.totalAmount - paid) * 100) / 100);
              return (
              <div key={p.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.supplierName}</span>
                  <Badge tone={p.paymentStatus === "paid" ? "success" : p.paymentStatus === "partial" ? "warning" : "danger"}>
                    {p.paymentStatus}
                  </Badge>
                  <span className="ml-auto tabular-nums font-medium">{formatINR(p.totalAmount, true)}</span>
                  {canPay && outstanding > 0.005 && (
                    <button
                      onClick={() => {
                        const raw = window.prompt(`Record payment to ${p.supplierName} (outstanding ${formatINR(outstanding)})`, String(outstanding));
                        const amt = raw ? parseFloat(raw) : NaN;
                        if (amt > 0) actions.recordBillPayment(p.id, amt);
                      }}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                      Pay
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.invoiceNo && `${p.invoiceNo} · `}{fmtDate(p.invoiceDate)}
                  {paid > 0.005 && ` · paid ${formatINR(paid)}${outstanding > 0.005 ? ` · due ${formatINR(outstanding)}` : ""}`} ·{" "}
                  {p.items.map((i) => `${i.skuCode}×${formatNum(i.quantity)}`).join(", ")}
                </p>
              </div>
              );
            })}
            {state.purchases.length === 0 && (
              <p className="px-4 py-8 text-center text-muted-foreground">No purchases yet.</p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 font-semibold">Suppliers</div>
            <div className="divide-y divide-border text-sm">
              {suppliers.map(([name, s]) => (
                <div key={name} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="truncate">{name}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">{formatINR(s.total, true)}</span>
                  {s.pending > 0 && <Badge tone="warning">{s.pending} unpaid</Badge>}
                </div>
              ))}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 font-semibold">COGS history</div>
            <div className="max-h-72 divide-y divide-border overflow-y-auto text-sm">
              {[...state.cogsHistory].reverse().slice(0, 20).map((h, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{h.skuCode}</span>
                    <span className="ml-auto tabular-nums text-xs">
                      {formatINR(h.oldCogs)} → <span className="font-medium">{formatINR(h.newCogs)}</span>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{h.reason === "PURCHASE_AVG" ? "weighted avg on purchase" : "manual override"} · {h.by} · {fmtDate(h.at)}</p>
                </div>
              ))}
              {state.cogsHistory.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No COGS changes yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </Guard>
  );
}
