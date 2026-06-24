"use client";
/**
 * Payout Summary (V4 §5c) — the raw money movement from your payment files,
 * independent of whether each payout matched an order. Settlement net = Σ
 * Final Settlement Amount; net after ads subtracts marketplace ads too.
 */
import { useMemo } from "react";
import * as XLSX from "xlsx";
import { useV2 } from "@/book/lib/v2/store";
import { payoutOnlySummary } from "@/book/lib/v2/derived";
import { PnlNav, useDefaultPnlControls } from "@/book/components/v2/PnlNav";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Card, StatCard, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

export default function PayoutSummaryPage() {
  const def = useDefaultPnlControls();
  const { state } = useV2();
  const data = useMemo(() => payoutOnlySummary(state), [state]);
  const t = data.totals;

  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(data.months.map((m) => ({
      Month: m.month, "Payment rows": m.rows, Credits: m.credits,
      "Affiliate fees": m.affiliateFees, "Return deductions": m.returnDeductions,
      "Other fees": m.otherDeductions, "Settlement net": m.net,
      "Ads spend": m.ads, "Net after ads": m.netAfterAds, TCS: m.tcs, TDS: m.tds,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payout Summary");
    XLSX.writeFile(wb, "payout-summary.xlsx");
  }

  return (
    <Guard section="pnl">
      <PageHeader title="Payout & P/L" sub="Payout Summary — raw money from your payment files, across all months" />
      {/* this page ignores the date filter; it spans all payment files */}
      <PnlNav controls={def} onChange={() => {}} onExport={exportXlsx} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <StatCard label="Total credits in" value={formatINR(t.credits, true)} tone="success" sub={`${t.rows.toLocaleString("en-IN")} payment rows`} />
        <StatCard label="Settlement deductions" value={formatINR(t.affiliateFees + t.returnDeductions + t.otherDeductions, true)} tone="danger" sub={`Before ads`} />
        <StatCard label="Settlement net" value={formatINR(t.net, true)} tone={t.net >= 0 ? "success" : "danger"} sub="credits minus settlement deductions" />
        <StatCard label="Net after ads" value={formatINR(t.netAfterAds, true)} tone={t.netAfterAds >= 0 ? "success" : "danger"} sub={`Ads ${formatINR(t.ads, true)}`} />
        <StatCard label="Recoverable TCS+TDS" value={formatINR(t.tcs + t.tds, true)} sub={`TCS ${formatINR(t.tcs, true)} · TDS ${formatINR(t.tds, true)}`} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">Payment month</th>
              <th className="px-3 py-2.5 text-right">Rows</th>
              <th className="px-3 py-2.5 text-right">Credits</th>
              <th className="px-3 py-2.5 text-right">Affiliate fees</th>
              <th className="px-3 py-2.5 text-right">Return deductions</th>
              <th className="px-3 py-2.5 text-right">Other fees</th>
              <th className="px-3 py-2.5 text-right">Settlement net</th>
              <th className="px-3 py-2.5 text-right">Ads spend</th>
              <th className="px-3 py-2.5 text-right">Net after ads</th>
              <th className="px-3 py-2.5 text-right">TCS</th>
              <th className="px-3 py-2.5 text-right">TDS</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className="border-b border-border last:border-0 hover:bg-muted/60">
                <td className="px-3 py-2 font-medium">{m.month}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.rows.toLocaleString("en-IN")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">{formatINR(m.credits)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-danger">−{formatINR(m.affiliateFees)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-danger">−{formatINR(m.returnDeductions)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-danger">−{formatINR(m.otherDeductions)}</td>
                <td className={cn("px-3 py-2 text-right font-medium tabular-nums", m.net >= 0 ? "text-success" : "text-danger")}>{formatINR(m.net)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-danger">−{formatINR(m.ads)}</td>
                <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", m.netAfterAds >= 0 ? "text-success" : "text-danger")}>{formatINR(m.netAfterAds)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(m.tcs)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatINR(m.tds)}</td>
              </tr>
            ))}
            {data.months.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">No payment files imported yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted font-semibold">
              <td className="px-3 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{t.rows.toLocaleString("en-IN")}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-success">{formatINR(t.credits, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-danger">−{formatINR(t.affiliateFees, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-danger">−{formatINR(t.returnDeductions, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-danger">−{formatINR(t.otherDeductions, true)}</td>
              <td className={cn("px-3 py-2.5 text-right tabular-nums", t.net >= 0 ? "text-success" : "text-danger")}>{formatINR(t.net, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-danger">−{formatINR(t.ads, true)}</td>
              <td className={cn("px-3 py-2.5 text-right tabular-nums", t.netAfterAds >= 0 ? "text-success" : "text-danger")}>{formatINR(t.netAfterAds, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(t.tcs, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(t.tds, true)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        This page is driven purely by your payment files — it includes payouts for orders not in your order file (e.g. Feb/April). It does not depend on order matching.
      </p>
    </Guard>
  );
}
