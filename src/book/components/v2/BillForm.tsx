"use client";
/**
 * New Bill — Zoho-style purchase bill (V4 §6b). Vendor banner, bill meta,
 * reverse-charge, subject, an item table with SKU search / quick-add inline,
 * GST per line, totals box with discount, and Draft/Open/Cancel footer.
 * Saving creates PURCHASE_IN ledger rows + updates weighted-average COGS.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  GripVertical, ImageIcon, Plus, Receipt, Search, Trash2, X,
} from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Button } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

interface Line { id: string; skuCode: string; quantity: string; rate: string; gstRate: string }
const GST_RATES = [0, 5, 12, 18, 28];
const newLine = (): Line => ({ id: Math.random().toString(36).slice(2), skuCode: "", quantity: "1", rate: "", gstRate: "5" });

const TERMS = ["Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60"];

export default function BillForm({ onClose }: { onClose: () => void }) {
  const { state, actions } = useV2();
  const [vendorId, setVendorId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [terms, setTerms] = useState(TERMS[0]);
  const [reverseCharge, setReverseCharge] = useState(false);
  const [subject, setSubject] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [discountPct, setDiscountPct] = useState("0");
  const [skuQuery, setSkuQuery] = useState<Record<string, string>>({});

  const vendor = state.vendors.find((v) => v.id === vendorId);

  function patch(id: string, p: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  }

  const totals = useMemo(() => {
    const parsed = lines.map((l) => ({
      qty: parseFloat(l.quantity) || 0, rate: parseFloat(l.rate) || 0, gst: parseFloat(l.gstRate) || 0,
    }));
    const subTotal = parsed.reduce((s, l) => s + l.qty * l.rate, 0);
    const disc = subTotal * (parseFloat(discountPct) || 0) / 100;
    const taxable = subTotal - disc;
    const gst = parsed.reduce((s, l) => s + (l.qty * l.rate) * (l.gst / 100), 0) * (taxable / (subTotal || 1));
    const total = taxable + gst;
    return { subTotal, disc, gst, total };
  }, [lines, discountPct]);

  const valid = Boolean(vendorId && billNo.trim() && billDate &&
    lines.some((l) => l.skuCode && (parseFloat(l.quantity) || 0) > 0));

  function save(status: "pending" | "paid") {
    if (!valid) return;
    const items = lines
      .filter((l) => l.skuCode && (parseFloat(l.quantity) || 0) > 0)
      .map((l) => ({ skuCode: l.skuCode, quantity: parseInt(l.quantity, 10) || 0, unitCost: parseFloat(l.rate) || 0, gstRate: parseFloat(l.gstRate) || 0 }));
    actions.addPurchase({
      vendorId,
      supplierName: vendor?.name ?? "",
      invoiceNo: billNo.trim(),
      invoiceDate: billDate,
      totalAmount: Math.round(totals.total * 100) / 100,
      gstAmount: Math.round(totals.gst * 100) / 100,
      paymentStatus: status,
      notes: [orderNo && `Order ${orderNo}`, `Terms: ${terms}`, reverseCharge && "Reverse charge", subject].filter(Boolean).join(" · "),
      items,
    });
    onClose();
  }

  function quickCreate(lineId: string, code: string) {
    const c = code.trim();
    if (!c) return;
    if (!state.skus.some((s) => s.skuCode === c)) actions.quickCreateSku({ skuCode: c, productName: c });
    patch(lineId, { skuCode: c });
    setSkuQuery((q) => ({ ...q, [lineId]: "" }));
  }

  const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
        className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <Receipt className="h-5 w-5" />
          <h2 className="text-xl font-semibold">New Bill</h2>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Vendor banner */}
        <div className="bg-muted/50 px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm font-medium text-danger">
              Vendor Name<span>*</span>
              <span className="h-2 w-2 rounded-full bg-primary" />
            </label>
            <div className="flex min-w-[280px] flex-1 max-w-xl">
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}
                className="w-full rounded-l-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                <option value="">Select a Vendor</option>
                {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <span className="flex items-center rounded-r-md bg-primary px-3 text-primary-foreground"><Search className="h-4 w-4" /></span>
            </div>
            {state.vendors.length === 0 && <span className="text-xs text-muted-foreground">No vendors yet — add one in Purchase → Vendors.</span>}
          </div>
        </div>

        {/* Bill meta */}
        <div className="grid gap-x-10 gap-y-4 px-6 py-5 md:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label className="text-sm font-medium text-danger">Bill#*</label>
              <input className={input} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label className="text-sm">Order Number</label>
              <input className={input} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
            </div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label className="text-sm font-medium text-danger">Bill Date*</label>
              <input type="date" className={input} value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <label className="text-sm">Due Date</label>
              <input type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <label className="text-sm">Payment Terms</label>
              <select className={input} value={terms} onChange={(e) => setTerms(e.target.value)}>
                {TERMS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reverseCharge} onChange={(e) => setReverseCharge(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              This transaction is applicable for reverse charge
            </label>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Subject */}
        <div className="grid grid-cols-[120px_1fr] items-start gap-3 px-6 py-5 md:max-w-2xl">
          <label className="pt-2 text-sm">Subject</label>
          <textarea rows={2} className={input} placeholder="Enter a subject within 250 characters" maxLength={250}
            value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        {/* Item table */}
        <div className="px-6 pb-2">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center bg-muted/60 px-4 py-2.5">
              <span className="text-sm font-semibold">Item Table</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-8" />
                    <th className="px-3 py-2">Item Details</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2">Tax (GST)</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const amount = (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
                    const q = skuQuery[l.id] ?? "";
                    const matches = q ? state.skus.filter((s) => s.skuCode.toLowerCase().includes(q.toLowerCase()) || s.productName.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
                    return (
                      <tr key={l.id} className="border-b border-border last:border-0 align-top">
                        <td className="py-3 pl-2 text-muted-foreground"><GripVertical className="h-4 w-4" /></td>
                        <td className="px-3 py-3">
                          <div className="flex items-start gap-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>
                            <div className="relative flex-1">
                              {l.skuCode ? (
                                <button onClick={() => { patch(l.id, { skuCode: "" }); setSkuQuery((s) => ({ ...s, [l.id]: "" })); }}
                                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-left text-sm hover:bg-muted">
                                  {l.skuCode}
                                </button>
                              ) : (
                                <>
                                  <input className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                                    placeholder="Type or click to select an item." value={q}
                                    onChange={(e) => setSkuQuery((s) => ({ ...s, [l.id]: e.target.value }))} />
                                  {q && (
                                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
                                      {matches.map((s) => (
                                        <button key={s.skuCode} onClick={() => { patch(l.id, { skuCode: s.skuCode, rate: l.rate || String(s.currentCogs || ""), gstRate: String(s.gstRate) }); setSkuQuery((sq) => ({ ...sq, [l.id]: "" })); }}
                                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted">
                                          <span className="font-mono text-xs">{s.skuCode}</span>
                                          <span className="truncate text-xs text-muted-foreground">{s.productName}</span>
                                        </button>
                                      ))}
                                      <button onClick={() => quickCreate(l.id, q)} className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-sm text-primary hover:bg-muted">
                                        <Plus className="h-3.5 w-3.5" /> Create “{q}” as new product
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm" inputMode="decimal" value={l.quantity} onChange={(e) => patch(l.id, { quantity: e.target.value })} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <input className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm" inputMode="decimal" placeholder="0.00" value={l.rate} onChange={(e) => patch(l.id, { rate: e.target.value })} />
                        </td>
                        <td className="px-3 py-3">
                          <select className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={l.gstRate} onChange={(e) => patch(l.id, { gstRate: e.target.value })}>
                            {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatINR(amount)}</td>
                        <td className="py-3 pr-2 text-right">
                          {lines.length > 1 && <button onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-6">
            <Button variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])}>
              <Plus className="h-4 w-4 text-primary" /> Add New Row
            </Button>

            {/* Totals */}
            <div className="w-full max-w-sm rounded-xl bg-muted/60 p-4 text-sm">
              <div className="flex items-center justify-between py-1">
                <span className="font-semibold">Sub Total</span>
                <span className="tabular-nums font-semibold">{formatINR(totals.subTotal)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">Discount</span>
                <span className="flex items-center gap-1">
                  <input className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-sm" inputMode="decimal" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
                  <span className="rounded-md border border-border bg-background px-2 py-1 text-xs">%</span>
                  <span className="ml-2 w-20 text-right tabular-nums text-danger">−{formatINR(totals.disc)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">{formatINR(totals.gst)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatINR(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border px-6 py-4">
          <Button variant="secondary" onClick={() => save("pending")} disabled={!valid}>Save as Draft</Button>
          <Button onClick={() => save("pending")} disabled={!valid}>Save as Open</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <span className="ml-auto text-xs text-muted-foreground">Saving updates weighted-average COGS</span>
        </div>
      </motion.div>
    </div>
  );
}
