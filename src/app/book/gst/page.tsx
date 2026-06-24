"use client";
/** GST working summary — output by slab, input credit, TCS/TDS, export. */
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useV2 } from "@/book/lib/v2/store";
import { gstForMonth, monthsAvailable, orderMonths } from "@/book/lib/v2/derived";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Button, Card, StatCard } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

export default function GstPage() {
  const { state } = useV2();
  const months = useMemo(() => monthsAvailable(state), [state]);
  const defaultMonth = useMemo(() => {
    const om = orderMonths(state);
    return om[om.length - 1] ?? months[months.length - 1] ?? "";
  }, [state, months]);
  const [month, setMonth] = useState(defaultMonth);
  const summary = useMemo(() => (month ? gstForMonth(state, month) : null), [state, month]);

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
    </Guard>
  );
}
