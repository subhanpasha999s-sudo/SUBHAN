"use client";
/**
 * Settlement (V4 §4) — payment truth per order. No "expected" / "pending ₹"
 * (we have no outstanding-payment file to compute it). Statuses are Paid or
 * Unpaid only. Plus an "Unacknowledged payouts" list: raw payment rows that
 * matched no order, so the seller sees money not tied to a known order.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { orderRowViews, unmatchedPayouts } from "@/book/lib/v2/derived";
import { ClassBadge, Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Card, StatCard, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

const PAGE = 60;

export default function SettlementsPage() {
  const { state } = useV2();
  const views = useMemo(() => orderRowViews(state).filter((v) => v.currentClass !== "PLATFORM_FEE"), [state]);
  const unmatched = useMemo(() => unmatchedPayouts(state), [state]);

  const [tab, setTab] = useState<"orders" | "unmatched">("orders");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const cards = useMemo(() => {
    const paid = views.filter((v) => v.settlementStatus === "PAID");
    const unpaid = views.filter((v) => v.settlementStatus === "UNPAID");
    return {
      totalQty: views.reduce((s, v) => s + v.qty, 0),
      totalPaid: Math.round(paid.reduce((s, v) => s + v.cumulativeSettlement, 0) * 100) / 100,
      unpaidOrders: unpaid.length,
    };
  }, [views]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return views
      .filter((v) => !needle || v.subOrderNo.toLowerCase().includes(needle) || (v.inventorySku ?? "").toLowerCase().includes(needle))
      .sort((a, b) => (a.settlementStatus === "UNPAID" ? -1 : 1) - (b.settlementStatus === "UNPAID" ? -1 : 1));
  }, [views, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice(page * PAGE, (page + 1) * PAGE);

  return (
    <Guard section="settlements">
      <PageHeader title="Settlement" sub="Payment truth per order — what was actually paid" />

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total quantity" value={cards.totalQty.toLocaleString("en-IN")} />
        <StatCard label="Total paid" value={formatINR(cards.totalPaid, true)} tone="success" />
        <StatCard label="Unpaid orders" value={String(cards.unpaidOrders)} tone={cards.unpaidOrders > 0 ? "warning" : "success"} />
        <StatCard label="Unacknowledged payout" value={formatINR(unmatched.total, true)}
          sub={`${unmatched.rows.length} rows with no order`} tone={unmatched.total < 0 ? "danger" : "default"} />
      </div>

      <div className="mb-4 flex gap-2">
        {([["orders", `Order settlements (${views.length})`], ["unmatched", `Unacknowledged payouts (${unmatched.rows.length})`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("rounded-full border px-4 py-1.5 text-sm", tab === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Sub Order No or SKU…"
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm" />
          </div>
          {/* Mobile: cards (no horizontal scroll, every field preserved) */}
          <div className="space-y-2 md:hidden">
            {rows.map((r, i) => (
              <Card key={r.subOrderNo} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/book/orders/${encodeURIComponent(r.subOrderNo)}`} className="break-all font-mono text-xs text-primary hover:underline">{r.subOrderNo}</Link>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">#{String(page * PAGE + i + 1).padStart(4, "0")} · {fmtDate(r.orderDate)}</p>
                  </div>
                  <ClassBadge cls={r.currentClass} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="truncate">{r.inventorySku ?? <span className="text-warning">unmapped</span>}</span>
                    {r.settlementStatus === "PAID" ? <Badge tone="success">Paid</Badge>
                      : r.settlementStatus === "UNPAID" ? <Badge tone="warning">Unpaid</Badge>
                      : r.settlementStatus === "DISPUTED" ? <Badge tone="danger">Disputed</Badge>
                      : <span className="text-muted-foreground">—</span>}
                  </div>
                  <span className={cn("font-semibold tabular-nums", r.cumulativeSettlement < 0 && "text-danger")}>{formatINR(r.cumulativeSettlement)}</span>
                </div>
              </Card>
            ))}
            {rows.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">No settlements match.</Card>
            )}
          </div>

          {/* Desktop: table */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Sub Order No</th>
                  <th className="px-3 py-2.5">Ordered</th>
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Class</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Net payout</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.subOrderNo} className="border-b border-border last:border-0 hover:bg-muted/60">
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">#{String(page * PAGE + i + 1).padStart(4, "0")}</td>
                    <td className="px-3 py-2">
                      <Link href={`/book/orders/${encodeURIComponent(r.subOrderNo)}`} className="font-mono text-xs text-primary hover:underline">{r.subOrderNo}</Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(r.orderDate)}</td>
                    <td className="max-w-[160px] truncate px-3 py-2">{r.inventorySku ?? <span className="text-warning">unmapped</span>}</td>
                    <td className="px-3 py-2"><ClassBadge cls={r.currentClass} /></td>
                    <td className="px-3 py-2">
                      {r.settlementStatus === "PAID" ? <Badge tone="success">Paid</Badge>
                        : r.settlementStatus === "UNPAID" ? <Badge tone="warning">Unpaid</Badge>
                        : r.settlementStatus === "DISPUTED" ? <Badge tone="danger">Disputed</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.cumulativeSettlement < 0 && "text-danger")}>{formatINR(r.cumulativeSettlement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button className="rounded-lg border border-border px-3 py-1 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span className="text-muted-foreground">Page {page + 1} / {pages}</span>
              <button className="rounded-lg border border-border px-3 py-1 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {tab === "unmatched" && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
            Raw payout rows whose Sub Order No is not in your order file (e.g. Feb/April orders, or affiliate fees). Upload that month&apos;s order CSV to match them.
          </div>
          {/* Mobile: cards */}
          <div className="space-y-2 p-3 md:hidden">
            {unmatched.rows.slice(0, 300).map((r) => (
              <div key={r.subOrderNo} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="break-all font-mono text-xs">{r.subOrderNo}</span>
                  {r.affiliateFee ? <Badge tone="default">affiliate fee</Badge> : <Badge tone="info">settlement</Badge>}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{r.events} row{r.events === 1 ? "" : "s"}</span>
                  <span className={cn("font-semibold tabular-nums", r.net < 0 && "text-danger")}>{formatINR(r.net)}</span>
                </div>
              </div>
            ))}
            {unmatched.rows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Every payout is tied to a known order. 🎉</p>
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Sub Order No</th>
                  <th className="px-3 py-2.5 text-right">Rows</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5 text-right">Net ₹</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.rows.slice(0, 300).map((r, i) => (
                  <tr key={r.subOrderNo} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">#{String(i + 1).padStart(4, "0")}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.subOrderNo}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.events}</td>
                    <td className="px-3 py-2">{r.affiliateFee ? <Badge tone="default">affiliate fee</Badge> : <Badge tone="info">settlement</Badge>}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.net < 0 && "text-danger")}>{formatINR(r.net)}</td>
                  </tr>
                ))}
                {unmatched.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Every payout is tied to a known order. 🎉</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Guard>
  );
}
