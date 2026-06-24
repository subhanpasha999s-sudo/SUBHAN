"use client";
/** Payout & P/L — Product-wise (spec §5.2). One row per inventory SKU. */
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { orderPnlRows, productPnlRows } from "@/book/lib/v2/derived";
import { exportProductPnl } from "@/book/lib/v2/exportPnl";
import { PnlNav, useDefaultPnlControls } from "@/book/components/v2/PnlNav";
import { ClassBadge, Guard, PageHeader } from "@/book/components/v2/common";
import { Card, cn, marginTone } from "@/book/components/ui";
import { formatINR, formatPct } from "@/book/lib/engine";

const marginText = { success: "text-success", default: "", warning: "text-warning", danger: "text-danger" } as const;

export default function ProductPnlPage() {
  const def = useDefaultPnlControls();
  const [controls, setControls] = useState(def);
  const { state } = useV2();
  const rows = useMemo(() => productPnlRows(state, controls), [state, controls]);
  const orderRows = useMemo(() => orderPnlRows(state, controls), [state, controls]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    netPayout: t.netPayout + r.netPayout,
    cogs: t.cogs + r.cogs, grossProfit: t.grossProfit + r.grossProfit,
  }), { netPayout: 0, cogs: 0, grossProfit: 0 }), [rows]);

  return (
    <Guard section="pnl">
      <PageHeader title="Payout & P/L" sub="Product-wise — net payout and profit per inventory SKU" />
      <PnlNav controls={controls} onChange={setControls} onExport={() => exportProductPnl(rows, `${controls.fromMonth}_${controls.toMonth}`)} />

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-8" />
              <th className="px-3 py-2.5">SKU / Product</th>
              <th className="px-3 py-2.5 text-right">Orders</th>
              <th className="px-3 py-2.5 text-right">Units</th>
              <th className="px-3 py-2.5 text-right">Net payout</th>
              <th className="px-3 py-2.5 text-right">COGS</th>
              <th className="px-3 py-2.5 text-right">Gross profit</th>
              <th className="px-3 py-2.5 text-right">Margin</th>
              <th className="px-3 py-2.5 text-right">Return %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone = marginTone(r.marginPct);
              const open = expanded === r.inventorySku;
              const skuOrders = open ? orderRows.filter((o) => (o.inventorySku ?? `(unmapped) ${o.listingSku}`) === r.inventorySku) : [];
              return (
                <>
                  <tr key={r.inventorySku} className="cursor-pointer border-b border-border hover:bg-muted/60" onClick={() => setExpanded(open ? null : r.inventorySku)}>
                    <td className="pl-3"><ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} /></td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <p className="truncate font-medium">{r.inventorySku}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.productName} · {r.delivered}D / {r.returns}R / {r.rto}RTO / {r.lost}L / {r.claim}C</p>
                    </td>
                    <td className="px-3 text-right tabular-nums">{r.orders}</td>
                    <td className="px-3 text-right tabular-nums">{r.netUnitsSold}</td>
                    <td className="px-3 text-right tabular-nums">{formatINR(r.netPayout, true)}</td>
                    <td className="px-3 text-right tabular-nums">{formatINR(r.cogs, true)}</td>
                    <td className={cn("px-3 text-right font-medium tabular-nums", marginText[tone])}>{formatINR(r.grossProfit, true)}</td>
                    <td className={cn("px-3 text-right font-medium tabular-nums", marginText[tone])}>{r.netPayout > 0 ? formatPct(r.marginPct) : "—"}</td>
                    <td className={cn("px-3 text-right tabular-nums", r.returnRatePct > 20 && "text-danger font-medium")}>{formatPct(r.returnRatePct)}</td>
                  </tr>
                  {open && (
                    <tr className="border-b border-border bg-muted/40">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-card">
                          <table className="w-full text-xs">
                            <thead><tr className="border-b border-border text-left text-muted-foreground">
                              <th className="px-3 py-2">Sub Order No</th><th className="px-3 py-2">Class</th>
                              <th className="px-3 py-2 text-right">Net payout</th><th className="px-3 py-2 text-right">Profit</th>
                            </tr></thead>
                            <tbody>
                              {skuOrders.map((o) => (
                                <tr key={o.subOrderNo} className="border-b border-border last:border-0">
                                  <td className="px-3 py-1.5 font-mono">{o.subOrderNo}</td>
                                  <td className="px-3 py-1.5"><ClassBadge cls={o.currentClass} /></td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(o.netPayout)}</td>
                                  <td className={cn("px-3 py-1.5 text-right tabular-nums", o.grossProfit < 0 && "text-danger")}>{formatINR(o.grossProfit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted font-semibold">
              <td colSpan={4} className="px-3 py-2.5">Totals ({rows.length} SKUs)</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(totals.netPayout, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(totals.cogs, true)}</td>
              <td className={cn("px-3 py-2.5 text-right tabular-nums", totals.grossProfit >= 0 ? "text-success" : "text-danger")}>{formatINR(totals.grossProfit, true)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </Card>
    </Guard>
  );
}
