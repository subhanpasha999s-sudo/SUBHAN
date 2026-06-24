"use client";
/**
 * V4 Order-Flow funnel + financially-correct status buckets.
 * Every order is accounted for stage by stage; from "Shipped" onward each
 * bucket shows count + net ₹ (green positive / red negative). Stages link to
 * the filtered order list.
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useV2 } from "@/book/lib/v2/store";
import { financialBuckets, orderFlowFunnel, returnsBreakdown } from "@/book/lib/v2/derived";
import { Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

export function OrderFlowFunnel() {
  const { state } = useV2();
  const stages = useMemo(() => orderFlowFunnel(state), [state]);
  const total = stages.find((s) => s.kind === "total")?.count || 1;

  return (
    <Card className="p-5">
      <h3 className="mb-1 font-semibold">Order flow</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Every order accounted for. Milestones taper down the funnel; each leak shows where orders dropped and its payout.
      </p>
      <div className="space-y-1">
        {stages.map((s, i) => {
          const isMilestone = s.kind === "total" || s.kind === "result";
          const conv = total ? (s.count / total) * 100 : 0; // share of all orders
          const href = ["RTO", "RETURN", "LOST", "EXCHANGE", "CLAIM", "CANCELLED", "DELIVERED"].includes(s.key)
            ? `/orders?class=${s.key}` : null;

          // compact value beside the count: ₹ payout, else conversion% (milestones)
          const valueText = s.net !== 0
            ? `${s.net > 0 ? "" : "−"}${formatINR(Math.abs(s.net), true)}`
            : isMilestone ? `${conv.toFixed(0)}%` : "";
          const valueTone = s.net > 0 ? "text-success" : s.net < 0 ? "text-danger" : "text-muted-foreground";

          const row = (
            <div
              title={s.note || undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                href && "hover:bg-muted/60",
                isMilestone && "bg-muted/30"
              )}
            >
              {/* label — fixed width, ALWAYS visible (never clipped by the bar) */}
              <div className={cn("flex w-36 shrink-0 items-center gap-1", !isMilestone && "pl-3")}>
                <span className={cn("shrink-0", isMilestone ? "text-muted-foreground" : "text-danger")}>
                  {isMilestone ? "=" : "−"}
                </span>
                <span className={cn("truncate", isMilestone ? "text-sm font-semibold" : "text-xs text-muted-foreground")}>
                  {s.label}
                </span>
              </div>

              {/* proportional bar — milestone (primary, tall) vs leak (red, thin) */}
              <div className="relative h-6 min-w-0 flex-1">
                <div className={cn("absolute inset-y-0 left-0 right-0 my-auto rounded-full bg-muted", isMilestone ? "h-5" : "h-2")} />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(conv, s.count > 0 ? 2 : 0)}%` }}
                  transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "absolute inset-y-0 left-0 my-auto rounded-full",
                    isMilestone ? "h-5 bg-primary/50" : "h-2 bg-danger/70"
                  )}
                />
              </div>

              {/* count + compact value */}
              <div className="flex w-24 shrink-0 items-baseline justify-end gap-1.5 tabular-nums">
                <span className={cn(isMilestone ? "text-base font-bold" : "text-sm font-semibold")}>
                  {s.count.toLocaleString("en-IN")}
                </span>
                {valueText && <span className={cn("text-xs", valueTone)}>{valueText}</span>}
              </div>
            </div>
          );

          return (
            <div key={s.key}>
              {href ? <Link href={href} className="block">{row}</Link> : row}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const TONE: Record<string, string> = {
  DELIVERED: "text-success", EXCHANGE: "text-[#0ea5e9]", CLAIM: "text-[#14b8a6]",
  LOST: "text-[#7c3aed]", RETURN: "text-danger", RTO: "text-warning", CANCELLED: "text-muted-foreground",
};

export function FinancialBuckets() {
  const { state } = useV2();
  const buckets = useMemo(() => financialBuckets(state), [state]);
  // Physical customer-return RECORDS (an exchange-then-return order is one
  // RETURN order but TWO units back — original + returned replacement). Shown
  // as a sub-note on the Returns tile so the order count still sums to total.
  const customerReturnRecords = useMemo(
    () => returnsBreakdown(state).buckets.find((b) => b.bucket === "CUSTOMER_RETURN")?.count ?? 0,
    [state]
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {buckets.map((b) => {
        const showRecords = b.key === "RETURN" && customerReturnRecords > b.count;
        return (
        <Link key={b.key} href={`/book/orders?class=${b.key}`}>
          <Card className="p-4 transition-colors hover:bg-muted/50">
            <p className="text-xs text-muted-foreground">{b.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", TONE[b.key])}>{b.count.toLocaleString("en-IN")}</p>
            {b.net !== 0 && (
              <p className={cn("text-xs font-medium tabular-nums", b.net >= 0 ? "text-success" : "text-danger")}>
                {b.net >= 0 ? "" : "−"}{formatINR(Math.abs(b.net), true)} net
              </p>
            )}
            {showRecords && (
              <p className="text-xs text-muted-foreground">{customerReturnRecords.toLocaleString("en-IN")} units to inspect · incl. exchange returns</p>
            )}
          </Card>
        </Link>
        );
      })}
    </div>
  );
}
