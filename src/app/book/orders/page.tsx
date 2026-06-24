"use client";
/**
 * Orders workspace (V3 §3) — settlement-status segments (Paid / Unpaid /
 * Partial / Disputed) + order-class chips, pending-₹ hero, days-outstanding.
 * Reads the existing reconciliation engine; this is presentation.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { orderRowViews, settlementGroups, financialBuckets, orderStatusCounts, SettlementStatus } from "@/book/lib/v2/derived";
import { OrderFlowFunnel } from "@/book/components/v2/OrderFlow";
import { OrdersOverview } from "@/book/components/v2/OrdersOverview";
import { ClassBadge, Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Card, cn } from "@/book/components/ui";
import { OrderClass, formatINR } from "@/book/lib/engine";

const PAGE = 50;

const STATUS_LABEL: Record<SettlementStatus | "ALL", string> = {
  ALL: "All",
  PAID: "Paid",
  UNPAID: "Unpaid",
  DISPUTED: "Disputed",
};
const STATUS_TONE: Record<SettlementStatus, "warning" | "success" | "danger"> = {
  UNPAID: "warning", PAID: "success", DISPUTED: "danger",
};
const STATUS_TEXT: Record<SettlementStatus, string> = {
  UNPAID: "text-warning", PAID: "text-success", DISPUTED: "text-danger",
};
const CLASSES: OrderClass[] = ["DELIVERED", "RTO", "RETURN", "CANCELLED", "LOST", "EXCHANGE", "CLAIM"];

export default function OrdersPage() {
  const { state } = useV2();
  const params = useSearchParams();
  const views = useMemo(() => orderRowViews(state), [state]);
  const groups = useMemo(() => settlementGroups(views), [views]);
  // class counts come from the shared selector — never recomputed inline
  const classCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of financialBuckets(state)) m.set(b.key, b.count);
    return m;
  }, [state]);
  const totalOrders = useMemo(() => orderStatusCounts(state).total, [state]);

  const [status, setStatus] = useState<SettlementStatus | "ALL">("ALL");
  const [cls, setCls] = useState<OrderClass | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  // deep-link from funnel/buckets: /orders?class=DELIVERED
  useEffect(() => {
    const c = params.get("class");
    if (c && CLASSES.includes(c as OrderClass)) setCls(c as OrderClass);
  }, [params]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return views
      .filter((v) => v.currentClass !== "PLATFORM_FEE")
      .filter((v) =>
        (status === "ALL" || v.settlementStatus === status) &&
        (cls === "ALL" || v.currentClass === cls) &&
        (!needle || v.subOrderNo.toLowerCase().includes(needle) ||
          v.listingSku.toLowerCase().includes(needle) ||
          (v.inventorySku ?? "").toLowerCase().includes(needle))
      )
      .sort((a, b) => b.daysOutstanding - a.daysOutstanding);
  }, [views, status, cls, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const reset = () => setPage(0);

  return (
    <Guard section="orders">
      <PageHeader title="Orders" sub={`${totalOrders.toLocaleString("en-IN")} orders across all months`} />

      {/* KPI strip + class donut + monthly trend */}
      <div className="mb-6"><OrdersOverview /></div>

      {/* Order-flow funnel — accounts for every order, stage by stage */}
      <div className="mb-5"><OrderFlowFunnel /></div>

      {/* Settlement-status segments */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button onClick={() => { setStatus("ALL"); reset(); }}
          className={cn("rounded-2xl border p-3 text-left transition-colors", status === "ALL" ? "border-primary bg-muted" : "border-border bg-card hover:bg-muted")}>
          <p className="text-xs text-muted-foreground">All</p>
          <p className="text-lg font-semibold tabular-nums">{views.filter((v) => v.settlementStatus).length}</p>
        </button>
        {groups.map((g) => (
          <button key={g.status} onClick={() => { setStatus(g.status); reset(); }}
            className={cn("rounded-2xl border p-3 text-left transition-colors", status === g.status ? "border-primary bg-muted" : "border-border bg-card hover:bg-muted")}>
            <p className="text-xs text-muted-foreground">{STATUS_LABEL[g.status]}</p>
            <p className={cn("text-lg font-semibold tabular-nums", STATUS_TEXT[g.status])}>{g.count}</p>
            <p className="text-[11px] text-muted-foreground">{formatINR(g.total, true)}</p>
          </button>
        ))}
      </div>

      {/* Class chips + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Sub Order No or SKU…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm" />
        </div>
        <button onClick={() => { setCls("ALL"); reset(); }}
          className={cn("rounded-full border px-3 py-1 text-sm", cls === "ALL" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
          All classes
        </button>
        {CLASSES.map((c) => {
          const n = classCounts.get(c) ?? 0;
          if (n === 0) return null;
          return (
            <button key={c} onClick={() => { setCls(c); reset(); }}
              className={cn("rounded-full border px-3 py-1 text-sm", cls === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
              {c} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile: stacked cards (every column preserved, no horizontal scroll) */}
      <div className="space-y-2 md:hidden">
        {rows.map((v, i) => (
          <Card key={v.subOrderNo} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/book/orders/${encodeURIComponent(v.subOrderNo)}`} className="font-mono text-xs text-primary hover:underline break-all">{v.subOrderNo}</Link>
                <p className="mt-0.5 text-[11px] text-muted-foreground">#{String(page * PAGE + i + 1).padStart(4, "0")} · {fmtDate(v.orderDate)}</p>
              </div>
              <ClassBadge cls={v.currentClass} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="truncate" title={v.productName}>{v.inventorySku ?? <span className="text-warning">unmapped</span>}</span>
              {v.settlementStatus
                ? <Badge tone={STATUS_TONE[v.settlementStatus]}>{STATUS_LABEL[v.settlementStatus]}</Badge>
                : <span className="text-muted-foreground">—</span>}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className={cn("text-xs tabular-nums", v.daysOutstanding > 30 && v.settlementStatus !== "PAID" ? "font-medium text-danger" : "text-muted-foreground")}>
                {v.daysOutstanding}d outstanding
              </span>
              <span className={cn("font-semibold tabular-nums", v.cumulativeSettlement < 0 && "text-danger")}>{formatINR(v.cumulativeSettlement)}</span>
            </div>
          </Card>
        ))}
        {rows.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No orders match these filters.</Card>
        )}
      </div>

      {/* Desktop: full table */}
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">#</th>
              <th className="px-3 py-2.5">Sub Order No</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Inventory SKU</th>
              <th className="px-3 py-2.5">Class</th>
              <th className="px-3 py-2.5">Settlement</th>
              <th className="px-3 py-2.5 text-right">Days out</th>
              <th className="px-3 py-2.5 text-right">Net payout</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => (
              <tr key={v.subOrderNo} className="border-b border-border last:border-0 hover:bg-muted/60">
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">#{String(page * PAGE + i + 1).padStart(4, "0")}</td>
                <td className="px-3 py-2">
                  <Link href={`/book/orders/${encodeURIComponent(v.subOrderNo)}`} className="font-mono text-xs text-primary hover:underline">{v.subOrderNo}</Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(v.orderDate)}</td>
                <td className="max-w-[180px] truncate px-3 py-2" title={v.productName}>
                  {v.inventorySku ?? <span className="text-warning">unmapped</span>}
                </td>
                <td className="px-3 py-2"><ClassBadge cls={v.currentClass} /></td>
                <td className="px-3 py-2">
                  {v.settlementStatus ? <Badge tone={STATUS_TONE[v.settlementStatus]}>{STATUS_LABEL[v.settlementStatus]}</Badge> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums", v.daysOutstanding > 30 && v.settlementStatus !== "PAID" && "text-danger font-medium")}>{v.daysOutstanding}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", v.cumulativeSettlement < 0 && "text-danger")}>{formatINR(v.cumulativeSettlement)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No orders match these filters.</td></tr>
            )}
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
    </Guard>
  );
}
