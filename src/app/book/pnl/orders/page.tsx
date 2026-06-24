"use client";
/** Payout & P/L — Order-wise (spec §5.1). One row per Sub Order No. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { orderPnlRows } from "@/book/lib/v2/derived";
import { exportOrderPnl } from "@/book/lib/v2/exportPnl";
import { PnlNav, useDefaultPnlControls } from "@/book/components/v2/PnlNav";
import { ClassBadge, Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Card, cn, marginTone } from "@/book/components/ui";
import { OrderClass, formatINR, formatPct } from "@/book/lib/engine";

const PAGE = 60;
const marginText = { success: "text-success", default: "", warning: "text-warning", danger: "text-danger" } as const;
const SETTLE_TONE = { PAID: "success", UNPAID: "warning", PARTIAL: "info", DISPUTED: "danger" } as const;

export default function OrderPnlPage() {
  const def = useDefaultPnlControls();
  const [controls, setControls] = useState(def);
  const { state } = useV2();
  const rows = useMemo(() => orderPnlRows(state, controls), [state, controls]);

  const [q, setQ] = useState("");
  const [cls, setCls] = useState<OrderClass | "ALL">("ALL");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (cls === "ALL" || r.currentClass === cls) &&
        (!needle || r.subOrderNo.toLowerCase().includes(needle) || (r.inventorySku ?? "").toLowerCase().includes(needle)))
      .sort((a, b) => (b.orderDate).localeCompare(a.orderDate));
  }, [rows, q, cls]);

  const totals = useMemo(() => filtered.reduce((t, r) => ({
    netPayout: t.netPayout + r.netPayout,
    netAfterDeductions: t.netAfterDeductions + r.netAfterDeductions,
    deductions: t.deductions + r.deductions,
    cogs: t.cogs + r.cogs, grossProfit: t.grossProfit + r.grossProfitAfterDeductions,
  }), { netPayout: 0, netAfterDeductions: 0, deductions: 0, cogs: 0, grossProfit: 0 }), [filtered]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const classes: OrderClass[] = ["DELIVERED", "RTO", "RETURN", "LOST", "EXCHANGE", "CLAIM"];

  return (
    <Guard section="pnl">
      <PageHeader title="Payout & P/L" sub="Order-wise — net payout and profit per Sub Order No" />
      <PnlNav controls={controls} onChange={(c) => { setControls(c); setPage(0); }} onExport={() => exportOrderPnl(filtered, `${controls.fromMonth}_${controls.toMonth}`)} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Sub Order No or SKU…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm" />
        </div>
        <button onClick={() => { setCls("ALL"); setPage(0); }} className={cn("rounded-full border px-3 py-1 text-sm", cls === "ALL" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>All</button>
        {classes.map((c) => (
          <button key={c} onClick={() => { setCls(c); setPage(0); }} className={cn("rounded-full border px-3 py-1 text-sm", cls === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>{c}</button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length.toLocaleString("en-IN")} orders</span>
      </div>

      {/* Mobile: per-order cards — every metric preserved */}
      <div className="space-y-2 md:hidden">
        {pageRows.map((r, i) => {
          const tone = marginTone(r.marginPct);
          return (
            <Card key={r.subOrderNo} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/book/orders/${encodeURIComponent(r.subOrderNo)}`} className="break-all font-mono text-xs text-primary hover:underline">{r.subOrderNo}</Link>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">#{String(page * PAGE + i + 1).padStart(4, "0")} · {fmtDate(r.orderDate)} · {r.inventorySku ?? <span className="text-warning">unmapped</span>}</p>
                </div>
                <ClassBadge cls={r.currentClass} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Net payout</span><span className={cn("tabular-nums", r.netAfterDeductions < 0 && "text-danger")}>{formatINR(r.netAfterDeductions)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">COGS</span><span className="tabular-nums">{r.cogs ? formatINR(r.cogs) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Gross profit</span><span className={cn("font-medium tabular-nums", marginText[tone])}>{formatINR(r.grossProfitAfterDeductions)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Margin</span><span className={cn("tabular-nums", marginText[tone])}>{r.netAfterDeductions > 0 ? formatPct(r.marginPct) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Affiliate fee</span><span className="tabular-nums text-muted-foreground">{formatINR(r.deductions)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{r.settlementStatus ? <Badge tone={SETTLE_TONE[r.settlementStatus]}>{r.settlementStatus.toLowerCase()}</Badge> : "—"}</span></div>
              </div>
            </Card>
          );
        })}
        <Card className="flex items-center justify-between p-3 text-sm font-semibold">
          <span>Totals ({filtered.length})</span>
          <span className={cn("tabular-nums", totals.grossProfit >= 0 ? "text-success" : "text-danger")}>{formatINR(totals.grossProfit, true)} GP</span>
        </Card>
      </div>

      {/* Desktop: table */}
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Sub Order No</th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Class</th>
              <th className="px-3 py-2.5 text-right">Affiliate fee</th>
              <th className="px-3 py-2.5 text-right">Net payout</th>
              <th className="px-3 py-2.5 text-right">COGS</th>
              <th className="px-3 py-2.5 text-right">Gross profit</th>
              <th className="px-3 py-2.5 text-right">Margin</th>
              <th className="px-3 py-2.5">Settlement</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => {
              const tone = marginTone(r.marginPct);
              return (
                <tr key={r.subOrderNo} className="border-b border-border last:border-0 hover:bg-muted/60">
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">#{String(page * PAGE + i + 1).padStart(4, "0")}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(r.orderDate)}</td>
                  <td className="px-3 py-2"><Link href={`/book/orders/${encodeURIComponent(r.subOrderNo)}`} className="font-mono text-xs text-primary hover:underline">{r.subOrderNo}</Link></td>
                  <td className="max-w-[150px] truncate px-3 py-2" title={r.productName}>{r.inventorySku ?? <span className="text-warning">unmapped</span>}</td>
                  <td className="px-3 py-2"><ClassBadge cls={r.currentClass} /></td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title="affiliate/platform fee deduction on this order">{formatINR(r.deductions)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", r.netAfterDeductions < 0 && "text-danger")}>{formatINR(r.netAfterDeductions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.cogs ? formatINR(r.cogs) : "—"}</td>
                  <td className={cn("px-3 py-2 text-right font-medium tabular-nums", marginText[tone])}>{formatINR(r.grossProfitAfterDeductions)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", marginText[tone])}>{r.netAfterDeductions > 0 ? formatPct(r.marginPct) : "—"}</td>
                  <td className="px-3 py-2">{r.settlementStatus ? <Badge tone={SETTLE_TONE[r.settlementStatus]}>{r.settlementStatus.toLowerCase()}</Badge> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted font-semibold">
              <td className="px-3 py-2.5" colSpan={5}>Totals ({filtered.length})</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(totals.deductions, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(totals.netAfterDeductions, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(totals.cogs, true)}</td>
              <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.grossProfit >= 0 ? "text-success" : "text-danger")}>{formatINR(totals.grossProfit, true)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </Card>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button className="rounded-lg border border-border px-3 py-1 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="text-muted-foreground">Page {page + 1} / {pages}</span>
          <button className="rounded-lg border border-border px-3 py-1 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </Guard>
  );
}
