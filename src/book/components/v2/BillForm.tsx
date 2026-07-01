"use client";
/**
 * New Bill — Zoho-style purchase bill (V4 §6b). Vendor banner, bill meta,
 * reverse-charge, subject, an item table with SKU search / quick-add inline,
 * GST per line, totals box with discount, and Draft/Open/Cancel footer.
 * Saving creates PURCHASE_IN ledger rows + updates weighted-average COGS.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  GripVertical, ImageIcon, Plus, Receipt, Trash2, X,
} from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Button } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

interface Line { id: string; skuCode: string; quantity: string; rate: string; gstRate: string }
const GST_RATES = [0, 5, 12, 18, 28];
const newLine = (): Line => ({ id: Math.random().toString(36).slice(2), skuCode: "", quantity: "1", rate: "", gstRate: "5" });

const TERMS = ["Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60"];

/** Shared field shell — label stacked above its control, consistent spacing. */
function Field({ label, required, className = "", children }: {
  label: string; required?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-foreground/90">
        {label}{required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

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
  // Supplier can be an existing vendor OR a name typed inline (auto-created on save).
  const [supplierName, setSupplierName] = useState("");
  const [newVendorMode, setNewVendorMode] = useState(state.vendors.length === 0);

  const [open, setOpen] = useState(true);

  // Anything the user has touched that would be lost on an accidental dismiss.
  const isDirty = Boolean(
    vendorId || supplierName.trim() || billNo.trim() || orderNo.trim() || billDate || subject.trim() ||
    reverseCharge || terms !== TERMS[0] || discountPct !== "0" ||
    lines.length > 1 || lines.some((l) => l.skuCode || l.rate || l.quantity !== "1"),
  );

  // Play the exit animation, then unmount. force=true skips the unsaved-changes guard.
  const close = useCallback((force = false) => {
    if (!force && isDirty && !window.confirm("Discard this bill? Your unsaved changes will be lost.")) return;
    setOpen(false);
    window.setTimeout(onClose, 180);
  }, [isDirty, onClose]);

  // Esc to close + lock background scroll while the modal is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [close]);

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

  // Lifetime weighted-average purchase rate per SKU, from all past bills.
  // Lets the user see what they've historically paid before keying a new rate.
  const lifetimeAvg = useMemo(() => {
    const agg: Record<string, { qty: number; cost: number; buys: number }> = {};
    for (const p of state.purchases) {
      for (const it of p.items) {
        const a = (agg[it.skuCode] ??= { qty: 0, cost: 0, buys: 0 });
        a.qty += it.quantity;
        a.cost += it.quantity * it.unitCost;
        a.buys += 1;
      }
    }
    const out: Record<string, { avg: number; qty: number; buys: number }> = {};
    for (const [code, a] of Object.entries(agg)) {
      out[code] = { avg: a.qty > 0 ? a.cost / a.qty : 0, qty: a.qty, buys: a.buys };
    }
    return out;
  }, [state.purchases]);

  const valid = Boolean(supplierName.trim() && billNo.trim() && billDate &&
    lines.some((l) => l.skuCode && (parseFloat(l.quantity) || 0) > 0));

  function save(status: "pending" | "paid") {
    if (!valid) return;
    // Persist a new vendor to the master when the name was typed inline.
    const name = supplierName.trim();
    if (!vendorId && name && !state.vendors.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      actions.addVendor({ name, gstin: "", address: "", contact: "" });
    }
    const items = lines
      .filter((l) => l.skuCode && (parseFloat(l.quantity) || 0) > 0)
      .map((l) => ({ skuCode: l.skuCode, quantity: parseInt(l.quantity, 10) || 0, unitCost: parseFloat(l.rate) || 0, gstRate: parseFloat(l.gstRate) || 0 }));
    actions.addPurchase({
      vendorId: vendorId || undefined,
      supplierName: name,
      invoiceNo: billNo.trim(),
      invoiceDate: billDate,
      dueDate: dueDate || undefined,
      totalAmount: Math.round(totals.total * 100) / 100,
      gstAmount: Math.round(totals.gst * 100) / 100,
      paymentStatus: status,
      notes: [orderNo && `Order ${orderNo}`, `Terms: ${terms}`, reverseCharge && "Reverse charge", subject].filter(Boolean).join(" · "),
      items,
    });
    close(true);
  }

  function quickCreate(lineId: string, code: string) {
    const c = code.trim();
    if (!c) return;
    if (!state.skus.some((s) => s.skuCode === c)) actions.quickCreateSku({ skuCode: c, productName: c });
    patch(lineId, { skuCode: c });
    setSkuQuery((q) => ({ ...q, [lineId]: "" }));
  }

  const input = "h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

  // Portal to <body> so the fixed overlay is sized to the viewport, not a
  // transformed ancestor (framer-motion page wrapper) that would clip it.
  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.18 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4 md:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.96 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden border-border bg-card shadow-2xl sm:h-[92vh] sm:w-[92vw] sm:max-w-[1400px] sm:rounded-2xl sm:border"
      >
        {/* Header (sticky) */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4 md:px-8">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Receipt className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">New Bill</h2>
            <p className="truncate text-xs text-muted-foreground">Record a purchase bill — updates weighted-average cost</p>
          </div>
          <button onClick={() => close()} aria-label="Close" className="ml-auto rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8 md:px-8">

            {/* Vendor */}
            <Field label="Vendor Name" required>
              {newVendorMode ? (
                <div className="flex max-w-2xl gap-2">
                  <input className={input} placeholder="Type vendor / supplier name"
                    value={supplierName} onChange={(e) => { setSupplierName(e.target.value); setVendorId(""); }} />
                  {state.vendors.length > 0 && (
                    <button type="button" onClick={() => { setNewVendorMode(false); setSupplierName(""); }}
                      className="h-11 shrink-0 whitespace-nowrap rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted">
                      Pick existing
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex max-w-2xl gap-2">
                  <select value={vendorId}
                    onChange={(e) => { const v = state.vendors.find((x) => x.id === e.target.value); setVendorId(e.target.value); setSupplierName(v?.name ?? ""); }}
                    className={input}>
                    <option value="">Select a Vendor</option>
                    {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <button type="button" onClick={() => { setNewVendorMode(true); setVendorId(""); setSupplierName(""); }}
                    className="flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted">
                    <Plus className="h-4 w-4 text-primary" /> New
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {newVendorMode ? "A new vendor will be added to your master on save." : "Choose a vendor, or add a new one."}
              </p>
            </Field>

            <div className="h-px bg-border" />

            {/* Bill details */}
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
              <Field label="Bill#" required>
                <input className={input} value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="e.g. INV-2026-001" />
              </Field>
              <Field label="Payment Terms">
                <select className={input} value={terms} onChange={(e) => setTerms(e.target.value)}>
                  {TERMS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Bill Date" required>
                <input type="date" className={input} value={billDate} onChange={(e) => setBillDate(e.target.value)} />
              </Field>
              <Field label="Due Date">
                <input type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              <Field label="Order Number">
                <input className={input} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
              </Field>
              <label className="flex items-center gap-2.5 text-sm text-foreground/90 md:pt-9">
                <input type="checkbox" checked={reverseCharge} onChange={(e) => setReverseCharge(e.target.checked)} className="h-4 w-4 rounded accent-[var(--primary)]" />
                This transaction is applicable for reverse charge
              </label>
            </div>

            <div className="h-px bg-border" />

            {/* Subject */}
            <Field label="Subject" className="max-w-3xl">
              <textarea rows={3} className="min-h-[96px] w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Enter a subject within 250 characters" maxLength={250}
                value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>

            {/* Items */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground/90">Items</h3>
              <div className="overflow-hidden rounded-xl border border-border">
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
                              {l.skuCode ? (() => {
                                const sku = state.skus.find((s) => s.skuCode === l.skuCode);
                                const hist = lifetimeAvg[l.skuCode];
                                const curQty = parseFloat(l.quantity) || 0;
                                const curRate = parseFloat(l.rate) || 0;
                                const projAvg = hist && curRate > 0 && curQty > 0
                                  ? (hist.avg * hist.qty + curRate * curQty) / (hist.qty + curQty)
                                  : null;
                                return (
                                  <div className="space-y-1">
                                    <button onClick={() => { patch(l.id, { skuCode: "" }); setSkuQuery((s) => ({ ...s, [l.id]: "" })); }}
                                      className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-left text-sm hover:bg-muted">
                                      <span className="font-mono text-xs">{l.skuCode}</span>
                                      {sku?.productName && sku.productName !== l.skuCode && (
                                        <span className="ml-2 truncate text-xs text-muted-foreground">{sku.productName}</span>
                                      )}
                                    </button>
                                    {hist ? (
                                      <p className="text-[11px] text-muted-foreground">
                                        Lifetime avg <span className="font-medium text-foreground tabular-nums">{formatINR(hist.avg)}</span>
                                        <span className="text-muted-foreground"> · {hist.buys} buy{hist.buys === 1 ? "" : "s"}</span>
                                        {projAvg !== null && Math.abs(projAvg - hist.avg) >= 0.01 && (
                                          <span className={projAvg > hist.avg ? "text-danger" : "text-success"}>
                                            {" → with this bill "}<span className="font-medium tabular-nums">{formatINR(projAvg)}</span>
                                          </span>
                                        )}
                                      </p>
                                    ) : (sku && sku.currentCogs > 0) ? (
                                      <p className="text-[11px] text-muted-foreground">
                                        Avg cost <span className="font-medium text-foreground tabular-nums">{formatINR(sku.currentCogs)}</span>
                                        <span className="text-muted-foreground"> · first purchase</span>
                                      </p>
                                    ) : null}
                                  </div>
                                );
                              })() : (
                                <>
                                  <input className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                                    placeholder="Type or click to select an item." value={q}
                                    onChange={(e) => setSkuQuery((s) => ({ ...s, [l.id]: e.target.value }))} />
                                  {q && (
                                    <div className="mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
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
        </div>
        </div>

        {/* Footer (sticky) */}
        <div className="shrink-0 border-t border-border bg-card px-6 py-4 md:px-8">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => save("pending")} disabled={!valid}>Save as Draft</Button>
            <Button onClick={() => save("pending")} disabled={!valid}>Save as Open</Button>
            <Button variant="ghost" onClick={() => close()}>Cancel</Button>
            <span className="ml-auto text-xs text-muted-foreground">Saving updates weighted-average COGS</span>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
