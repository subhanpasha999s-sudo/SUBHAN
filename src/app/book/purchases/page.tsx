"use client";
/** Purchases — stock IN with weighted-average COGS updates + supplier list. */
import { useMemo, useState } from "react";
import { Plus, ClipboardList, Trash2 } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { canDo } from "@/book/lib/v2/rbac";
import { formatINR, formatNum } from "@/book/lib/engine";
import { flags } from "@/book/lib/flags";
import { receivedBillTotals } from "@/book/lib/core/purchaseDocs";
import type { PurchaseOrderItem } from "@/book/lib/v2/types";
import BillForm from "@/book/components/v2/BillForm";

export default function PurchasesPage() {
  const { state, me, actions } = useV2();
  const [adding, setAdding] = useState(false);
  const canPay = canDo(me.role, "record_payment");
  const apOutstanding = useMemo(
    () => state.purchases.reduce((s, p) => s + (p.paymentStatus === "paid" ? 0 : p.totalAmount - (p.amountPaid ?? 0) - (p.amountCredited ?? 0)), 0),
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

      {flags.purchasing && <PurchaseOrdersCard canAdd={canAdd} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-semibold">Purchase history</span>
            <span className="text-xs text-muted-foreground">AP outstanding <span className="font-semibold tabular-nums text-foreground">{formatINR(apOutstanding, true)}</span></span>
          </div>
          <div className="divide-y divide-border text-sm">
            {[...state.purchases].reverse().map((p) => {
              const paid = p.amountPaid ?? (p.paymentStatus === "paid" ? p.totalAmount : 0);
              const credited = p.amountCredited ?? 0;
              const outstanding = Math.max(0, Math.round((p.totalAmount - paid - credited) * 100) / 100);
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
                  {canAdd && outstanding > 0.005 && (
                    <button
                      onClick={() => {
                        const raw = window.prompt(`Vendor credit from ${p.supplierName} (outstanding ${formatINR(outstanding)})`);
                        const amt = raw ? parseFloat(raw) : NaN;
                        if (!(amt > 0)) return;
                        const reason = window.prompt("Reason (optional)") ?? undefined;
                        const r = actions.addVendorCredit(p.id, amt, reason);
                        if (!r.ok && r.message) window.alert(r.message);
                      }}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                      Credit
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.invoiceNo && `${p.invoiceNo} · `}{fmtDate(p.invoiceDate)}
                  {paid > 0.005 && ` · paid ${formatINR(paid)}`}
                  {credited > 0.005 && ` · credited ${formatINR(credited)}`}
                  {(paid > 0.005 || credited > 0.005) && outstanding > 0.005 && ` · due ${formatINR(outstanding)}`} ·{" "}
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

/** Purchase orders (Phase 4): commitment docs — Receive converts to a bill. */
function PurchaseOrdersCard({ canAdd }: { canAdd: boolean }) {
  const { state, actions } = useV2();
  const [adding, setAdding] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [expected, setExpected] = useState("");
  const [landed, setLanded] = useState("");
  const [basis, setBasis] = useState<"value" | "quantity">("value");
  const [items, setItems] = useState<PurchaseOrderItem[]>([{ skuCode: "", quantity: 1, unitCost: 0, gstRate: 5 }]);
  const input = "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

  const pos = useMemo(() => [...(state.purchaseOrders ?? [])].reverse(), [state.purchaseOrders]);
  const realItems = items.filter((i) => i.skuCode.trim() && i.quantity > 0);
  const totals = receivedBillTotals(realItems, parseFloat(landed) || 0);
  const valid = supplier.trim() && realItems.length > 0;

  const patch = (idx: number, p: Partial<PurchaseOrderItem>) =>
    setItems((ls) => ls.map((l, i) => (i === idx ? { ...l, ...p } : l)));

  function save() {
    if (!valid) return;
    actions.addPurchaseOrder({
      supplierName: supplier.trim(),
      items: realItems.map((i) => ({ ...i, skuCode: i.skuCode.trim() })),
      expectedDate: expected || undefined,
      landedCost: parseFloat(landed) > 0 ? parseFloat(landed) : undefined,
      landedCostBasis: basis,
    });
    setAdding(false); setSupplier(""); setExpected(""); setLanded("");
    setItems([{ skuCode: "", quantity: 1, unitCost: 0, gstRate: 5 }]);
  }

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="inline-flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4 text-primary" /> Purchase orders</span>
        {canAdd && <Button variant="secondary" onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> New PO</Button>}
      </div>

      {adding && (
        <div className="space-y-3 border-b border-border bg-muted/40 p-4">
          <div className="flex flex-wrap gap-2">
            <input className={cn(input, "min-w-[200px] flex-1")} placeholder="Supplier name *" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">expected
              <input type="date" className={cn(input, "w-40")} value={expected} onChange={(e) => setExpected(e.target.value)} />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">landed cost ₹
              <input className={cn(input, "w-24 text-right")} inputMode="decimal" placeholder="0" value={landed} onChange={(e) => setLanded(e.target.value)} />
            </label>
            <select className={cn(input, "w-32")} value={basis} onChange={(e) => setBasis(e.target.value as "value" | "quantity")}>
              <option value="value">by value</option>
              <option value="quantity">by quantity</option>
            </select>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <input className={cn(input, "min-w-[160px] flex-1 font-mono")} placeholder="SKU code *" value={it.skuCode} onChange={(e) => patch(idx, { skuCode: e.target.value })} />
              <input className={cn(input, "w-20 text-right")} inputMode="numeric" placeholder="qty" value={it.quantity || ""} onChange={(e) => patch(idx, { quantity: parseInt(e.target.value, 10) || 0 })} />
              <input className={cn(input, "w-28 text-right")} inputMode="decimal" placeholder="unit cost" value={it.unitCost || ""} onChange={(e) => patch(idx, { unitCost: parseFloat(e.target.value) || 0 })} />
              <select className={cn(input, "w-24")} value={it.gstRate} onChange={(e) => patch(idx, { gstRate: parseFloat(e.target.value) })}>
                {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
              {items.length > 1 && (
                <button onClick={() => setItems((ls) => ls.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setItems((ls) => [...ls, { skuCode: "", quantity: 1, unitCost: 0, gstRate: 5 }])}>
              <Plus className="h-4 w-4 text-primary" /> Add line
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              goods {formatINR(totals.goods)} · GST {formatINR(totals.gst)} · <span className="font-semibold text-foreground">total {formatINR(totals.total)}</span>
            </span>
            <Button onClick={save} disabled={!valid}>Save PO</Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border text-sm">
        {pos.map((po) => {
          const t = receivedBillTotals(po.items, po.landedCost ?? 0);
          return (
            <div key={po.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="font-mono text-xs">{po.number}</span>
              <span className="truncate font-medium">{po.supplierName}</span>
              <span className="text-xs text-muted-foreground">
                {po.items.map((i) => `${i.skuCode}×${formatNum(i.quantity)}`).join(", ")}
                {po.expectedDate ? ` · expected ${fmtDate(po.expectedDate)}` : ""}
                {(po.landedCost ?? 0) > 0 ? ` · landed ₹${po.landedCost}` : ""}
              </span>
              <span className="ml-auto tabular-nums font-medium">{formatINR(t.total)}</span>
              <Badge tone={po.status === "received" ? "success" : po.status === "cancelled" ? "danger" : "default"}>{po.status}</Badge>
              {canAdd && po.status === "open" && (
                <span className="flex gap-1">
                  <button onClick={() => { const r = actions.receivePurchaseOrder(po.id); if (!r.ok && r.message) window.alert(r.message); }}
                    className="rounded-md border border-border px-2 py-0.5 text-xs text-primary hover:bg-muted">Receive → bill</button>
                  <button onClick={() => actions.cancelPurchaseOrder(po.id)}
                    className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">Cancel</button>
                </span>
              )}
            </div>
          );
        })}
        {pos.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">No purchase orders yet.</p>}
      </div>
    </Card>
  );
}
