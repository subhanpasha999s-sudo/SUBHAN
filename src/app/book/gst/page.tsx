"use client";
/**
 * GST working summary — output by slab, input credit, TCS/TDS, export.
 * Phase 7 adds the India GST pack: GSTR-1 B2C (place-of-supply × rate),
 * HSN summary, GSTR-3B working numbers, and the TCS/TDS credit ledger.
 */
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useV2 } from "@/book/lib/v2/store";
import { gstForMonth, monthsAvailable, orderMonths, reconcileAll } from "@/book/lib/v2/derived";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Button, Card, StatCard, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { flags } from "@/book/lib/flags";
import {
  gstr1B2C, hsnSummary, gstr3b, tcsTdsLedger, type Gstr1SaleRow,
} from "@/book/lib/core/gstPack";

export default function GstPage() {
  const { state } = useV2();
  const months = useMemo(() => monthsAvailable(state), [state]);
  const defaultMonth = useMemo(() => {
    const om = orderMonths(state);
    return om[om.length - 1] ?? months[months.length - 1] ?? "";
  }, [state, months]);
  const [month, setMonth] = useState(defaultMonth);
  const summary = useMemo(() => (month ? gstForMonth(state, month) : null), [state, month]);

  // GSTR-1 rows: same basis as the working summary — delivered/exchange
  // orders of the month (order-date), customer-paid GST-inclusive price,
  // rate + HSN from the item master, place of supply from the buyer's state.
  const gstr1Rows = useMemo<Gstr1SaleRow[]>(() => {
    if (!month || !flags.gstPack) return [];
    const skuOf = (code: string) => state.skus.find((s) => s.skuCode === code);
    return reconcileAll(state)
      .filter((r) => (r.order?.orderDate ?? "").slice(0, 7) === month)
      .filter((r) => r.currentClass === "DELIVERED" || r.currentClass === "EXCHANGE")
      .map((r) => {
        const sku = skuOf(r.order!.sku);
        return {
          buyerState: r.order!.customerState,
          grossInclusive: r.order!.discountedPrice * (r.order!.quantity || 1),
          ratePct: sku?.gstRate ?? 5,
          qty: r.order!.quantity || 1,
          hsn: sku?.hsnCode,
        };
      });
  }, [state, month]);

  const b2c = useMemo(() => gstr1B2C(gstr1Rows, state.org.state), [gstr1Rows, state.org.state]);
  const hsn = useMemo(() => hsnSummary(gstr1Rows), [gstr1Rows]);
  const g3b = useMemo(() => (summary ? gstr3b(b2c, summary.inputCredit, summary.tcs) : null), [b2c, summary]);
  const ledger = useMemo(() => tcsTdsLedger(state.events ?? []), [state.events]);

  function exportGstr() {
    if (!summary) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["GST Working Summary", month],
      ["Verify with your CA before filing — this is a working summary, not a filing document."],
      [],
      ["Rate slab %", "Taxable value", "GST amount"],
      ...summary.outputBySlab.map((s) => [s.rate, s.taxableValue, s.gstAmount]),
      [],
      ["Output GST", summary.outputGst],
      ["Input credit", summary.inputCredit],
      ["Net payable (working)", summary.netPayable],
      [],
      ["TCS (recoverable)", summary.tcs],
      ["TDS (recoverable)", summary.tds],
    ]), "GST Summary");
    if (flags.gstPack) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["GSTR-1 B2C (e-commerce) — place of supply × rate", month],
        ["POS code", "State", "Rate %", "Taxable value", "IGST", "CGST", "SGST", "Net docs"],
        ...b2c.map((r) => [r.stateCode, r.stateName, r.ratePct, r.taxableValue, r.igst, r.cgst, r.sgst, r.count]),
      ]), "GSTR-1 B2C");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["HSN summary (GSTR-1 table 12)", month],
        ["HSN", "Qty", "Taxable value", "GST"],
        ...hsn.map((h) => [h.hsn, h.qty, h.taxableValue, h.gstAmount]),
      ]), "HSN");
      if (g3b) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          ["GSTR-3B working summary", month],
          ["3.1(a) outward taxable", g3b.outwardTaxable],
          ["IGST", g3b.igst], ["CGST", g3b.cgst], ["SGST", g3b.sgst],
          ["ITC (4A)", g3b.itc],
          ["GST-TCS credit", g3b.tcsCredit],
          ["Net payable (working)", g3b.netPayable],
        ]), "GSTR-3B");
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["TCS / TDS credit ledger (all months)"],
        ["Month", "Marketplace", "GST-TCS", "TDS", "Cum. TCS", "Cum. TDS"],
        ...ledger.map((l) => [l.month, l.marketplace, l.tcs, l.tds, l.cumTcs, l.cumTds]),
      ]), "TCS-TDS Ledger");
    }
    XLSX.writeFile(wb, `gst-working-${month}.xlsx`);
  }

  if (!summary) {
    return <Guard section="gst"><PageHeader title="GST" sub="No data yet." /></Guard>;
  }

  return (
    <Guard section="gst">
      <PageHeader
        title="GST"
        right={
          <>
            <select className="rounded-xl border border-border bg-card px-3 py-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m}>{m}</option>)}
            </select>
            <Button variant="secondary" onClick={exportGstr}><Download className="h-4 w-4" /> GSTR export</Button>
          </>
        }
      />
      <Card className="mb-6 border-warning/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        ⚠️ Verify with your CA before filing — this is a working summary, not a filing document.
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Output GST (sales)" value={formatINR(summary.outputGst)} />
        <StatCard label="Input credit" value={formatINR(summary.inputCredit)} />
        <StatCard label="Net payable (working)" value={formatINR(Math.max(0, summary.netPayable))}
          tone={summary.netPayable > 0 ? "warning" : "success"} />
        <StatCard label="TCS + TDS recoverable" value={formatINR(summary.tcs + summary.tds)} tone="success"
          sub={`TCS ${formatINR(summary.tcs)} · TDS ${formatINR(summary.tds)}`} />
      </div>

      <Card className="max-w-xl overflow-hidden">
        <div className="border-b border-border px-4 py-3 font-semibold">Output GST by rate slab — {month}</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Slab</th>
              <th className="px-4 py-2 text-right">Taxable value</th>
              <th className="px-4 py-2 text-right">GST</th>
            </tr>
          </thead>
          <tbody>
            {summary.outputBySlab.map((s) => (
              <tr key={s.rate} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{s.rate}%</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatINR(s.taxableValue)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatINR(s.gstAmount)}</td>
              </tr>
            ))}
            {summary.outputBySlab.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No delivered sales this month.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {flags.gstPack && g3b && (
        <>
          {/* GSTR-3B working summary */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="3.1(a) Outward taxable" value={formatINR(g3b.outwardTaxable)} />
            <StatCard label="IGST / CGST / SGST" value={formatINR(g3b.igst + g3b.cgst + g3b.sgst)}
              sub={`I ${formatINR(g3b.igst)} · C ${formatINR(g3b.cgst)} · S ${formatINR(g3b.sgst)}`} />
            <StatCard label="ITC (4A)" value={formatINR(g3b.itc)} tone="success" />
            <StatCard label="3B net payable (working)" value={formatINR(g3b.netPayable)}
              tone={g3b.netPayable > 0 ? "warning" : "success"} sub={`GST-TCS credit ${formatINR(g3b.tcsCredit)}`} />
          </div>

          {/* GSTR-1 B2C place-of-supply table */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="border-b border-border px-4 py-3 font-semibold">GSTR-1 · B2C by place of supply — {month}</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">POS</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Taxable</th>
                      <th className="px-3 py-2 text-right">IGST</th>
                      <th className="px-3 py-2 text-right">CGST</th>
                      <th className="px-3 py-2 text-right">SGST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b2c.map((r) => (
                      <tr key={`${r.stateCode}-${r.ratePct}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-2"><span className="font-mono text-xs text-muted-foreground">{r.stateCode}</span> <span className="capitalize">{r.stateName}</span></td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.ratePct}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.taxableValue)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", r.igst === 0 && "text-muted-foreground/50")}>{formatINR(r.igst)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", r.cgst === 0 && "text-muted-foreground/50")}>{formatINR(r.cgst)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", r.sgst === 0 && "text-muted-foreground/50")}>{formatINR(r.sgst)}</td>
                      </tr>
                    ))}
                    {b2c.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No B2C sales this month.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* HSN summary */}
            <Card className="overflow-hidden">
              <div className="border-b border-border px-4 py-3 font-semibold">HSN summary (table 12) — {month}</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">HSN</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Taxable</th>
                      <th className="px-3 py-2 text-right">GST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hsn.map((h) => (
                      <tr key={h.hsn} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{h.hsn}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{h.qty}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(h.taxableValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(h.gstAmount)}</td>
                      </tr>
                    ))}
                    {hsn.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No B2C sales this month.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* TCS/TDS credit ledger */}
          <Card className="mt-6 max-w-2xl overflow-hidden">
            <div className="border-b border-border px-4 py-3 font-semibold">TCS / TDS credit ledger — Meesho</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2 text-right">GST-TCS</th>
                    <th className="px-3 py-2 text-right">TDS</th>
                    <th className="px-3 py-2 text-right">Cum. TCS</th>
                    <th className="px-3 py-2 text-right">Cum. TDS</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.month} className={cn("border-b border-border last:border-0", l.month === month && "bg-muted/50 font-medium")}>
                      <td className="px-3 py-2">{l.month}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.tcs)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.tds)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.cumTcs)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.cumTds)}</td>
                    </tr>
                  ))}
                  {ledger.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No marketplace withholdings recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </Guard>
  );
}
