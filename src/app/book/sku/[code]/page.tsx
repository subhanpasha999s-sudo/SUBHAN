"use client";
/**
 * Unified per-SKU drill-down (V3 §6) — sales, returns, current stock,
 * COGS history, P&L, and mapping, all in one panel.
 */
import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { orderPnlRows, defaultPnlControls } from "@/book/lib/v2/derived";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Card, StatCard, cn } from "@/book/components/ui";
import { currentStock, formatINR, formatPct } from "@/book/lib/engine";

export default function SkuDrillPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code);
  const { state } = useV2();

  const sku = state.skus.find((s) => s.skuCode === code);
  const stock = useMemo(() => currentStock(state.ledger).get(code) ?? 0, [state.ledger, code]);
  const rows = useMemo(
    () => orderPnlRows(state, defaultPnlControls(state)).filter((r) => r.inventorySku === code),
    [state, code]
  );
  const mappings = state.skuMap.filter(
    (m) => m.inventorySku === code || m.components?.some((c) => c.inventorySku === code)
  );
  const cogsHistory = state.cogsHistory.filter((h) => h.skuCode === code);

  const agg = rows.reduce(
    (t, r) => ({
      orders: t.orders + 1,
      netPayout: t.netPayout + r.netPayout,
      cogs: t.cogs + r.cogs,
      gp: t.gp + r.grossProfit,
      returns: t.returns + (r.currentClass === "RETURN" || r.currentClass === "RTO" ? 1 : 0),
    }),
    { orders: 0, netPayout: 0, cogs: 0, gp: 0, returns: 0 }
  );

  return (
    <Guard section="pnl">
      <Link href="/book/inventory" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Inventory
      </Link>
      <PageHeader title={code} sub={sku?.productName ?? "Unknown SKU"} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Current stock" value={String(stock)} tone={stock <= (sku?.reorderLevel ?? 0) && (sku?.reorderLevel ?? 0) > 0 ? "warning" : "default"} />
        <StatCard label="Orders" value={String(agg.orders)} />
        <StatCard label="Net payout" value={formatINR(agg.netPayout, true)} />
        <StatCard label="Gross profit" value={formatINR(agg.gp, true)} tone={agg.gp >= 0 ? "success" : "danger"} />
        <StatCard label="Return rate" value={formatPct(agg.orders ? (agg.returns / agg.orders) * 100 : 0)} tone={agg.returns / Math.max(1, agg.orders) > 0.2 ? "danger" : "default"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Mapping</h3>
          {mappings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No listing SKUs mapped here.</p>
          ) : (
            <div className="space-y-1.5 text-sm">
              {mappings.map((m) => (
                <div key={m.listingSku} className="flex items-center gap-2">
                  <span className="font-mono text-xs">{m.listingSku}</span>
                  {m.components && <Badge tone="info">bundle</Badge>}
                </div>
              ))}
            </div>
          )}
          <Link href="/book/mapping" className="mt-3 inline-block text-sm text-primary">Manage mappings →</Link>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-semibold">COGS history</h3>
          {cogsHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Current COGS {formatINR(sku?.currentCogs ?? 0)} · no changes yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {cogsHistory.slice().reverse().map((h, i) => (
                <div key={i}>
                  <div className="flex justify-between"><span className="tabular-nums">{formatINR(h.oldCogs)} → <strong>{formatINR(h.newCogs)}</strong></span></div>
                  <p className="text-xs text-muted-foreground">{h.reason === "PURCHASE_AVG" ? "weighted avg" : "manual"} · {fmtDate(h.at)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-semibold">Recent ledger</h3>
          <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {state.ledger.filter((l) => l.skuCode === code).slice(-10).reverse().map((l, i) => (
              <div key={i} className="flex justify-between">
                <span>{l.eventType}</span>
                <span className={cn("tabular-nums", l.quantityDelta > 0 ? "text-success" : l.quantityDelta < 0 ? "text-danger" : "text-muted-foreground")}>
                  {l.quantityDelta > 0 ? `+${l.quantityDelta}` : l.quantityDelta}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto">
        <div className="border-b border-border px-4 py-3 font-semibold">Orders ({rows.length})</div>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Sub Order No</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Class</th>
              <th className="px-3 py-2 text-right">Net payout</th><th className="px-3 py-2 text-right">Profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r) => (
              <tr key={r.subOrderNo} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5"><Link href={`/book/orders/${encodeURIComponent(r.subOrderNo)}`} className="font-mono text-xs text-primary hover:underline">{r.subOrderNo}</Link></td>
                <td className="px-3 py-1.5 text-xs">{fmtDate(r.orderDate)}</td>
                <td className="px-3 py-1.5">{r.currentClass}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(r.netPayout)}</td>
                <td className={cn("px-3 py-1.5 text-right tabular-nums", r.grossProfit < 0 && "text-danger")}>{formatINR(r.grossProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Guard>
  );
}
