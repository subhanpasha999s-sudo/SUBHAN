"use client";
/**
 * Returns & QC — the Returns Manager's home. QC queue with pass/fail/mismatch
 * actions, aging highlights, claim tracker. No financial data shown to the
 * returns_manager role beyond claim amounts they raise.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, CircleX, FileQuestion, Search, Wrench, X } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { returnsBreakdown, ReturnBucket } from "@/book/lib/v2/derived";
import { Guard, EmptyState, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Card, StatCard, cn } from "@/book/components/ui";
import { canSee, canDo } from "@/book/lib/v2/rbac";
import { formatINR } from "@/book/lib/engine";

const RETURN_TYPE_LABEL = {
  RTO: "RTO",
  CUSTOMER_RETURN: "Customer return",
  EXCHANGE_RETURN: "Exchange return",
} as const;

const BUCKET_LABEL: Record<ReturnBucket, string> = {
  DELIVERED: "Delivered", CUSTOMER_RETURN: "Customer return", RTO: "RTO",
  CANCELLED: "Cancelled", EXCHANGE: "Exchange",
};
const BUCKET_TONE: Record<ReturnBucket, "success" | "danger" | "warning" | "default" | "info"> = {
  DELIVERED: "success", CUSTOMER_RETURN: "danger", RTO: "warning", CANCELLED: "default", EXCHANGE: "info",
};

export default function ReturnsPage() {
  const { state, me, actions } = useV2();
  const [tab, setTab] = useState<"breakdown" | "queue" | "done" | "claims">("breakdown");
  const [justPassed, setJustPassed] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Returns Manager must not see ₹ impact (financial data).
  const showMoney = canSee(me.role, "pnl");
  const breakdown = useMemo(() => returnsBreakdown(state), [state]);

  // search across Sub Order No + SKU (queue / processed / claims)
  const q = query.trim().toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) =>
    !q || fields.some((f) => (f ?? "").toLowerCase().includes(q));

  const pending = useMemo(
    () => state.returnsQueue.filter((r) => r.qcStatus === "PENDING")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [state.returnsQueue]
  );
  const done = useMemo(
    () => state.returnsQueue.filter((r) => r.qcStatus === "DONE").slice(-50).reverse(),
    [state.returnsQueue]
  );

  const pendingShown = pending.filter((r) => matches(r.subOrderNo, r.skuCode));
  const doneShown = done.filter((r) => matches(r.subOrderNo, r.skuCode));
  const claimsShown = state.claims.filter((c) => matches(c.subOrderNo, c.skuCode, c.ticketRef));

  const daysWaiting = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  const mayQc = canDo(me.role, "qc_decision");

  function decide(id: string, result: "SELLABLE" | "DAMAGED" | "DAMAGED_REPAIRABLE" | "MISMATCH") {
    actions.qcDecision(id, result);
    if (result === "SELLABLE") {
      setJustPassed(id);
      setTimeout(() => setJustPassed(null), 900);
    }
  }

  return (
    <Guard section="returns">
      <PageHeader
        title="Returns & QC"
        sub={`${pending.length} units awaiting inspection`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {([["breakdown", "Breakdown"], ["queue", `QC queue (${pending.length})`], ["done", "Processed"], ["claims", `Claims (${state.claims.length})`]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              tab === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "breakdown" && (
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Sub Order No or SKU…"
              aria-label="Search returns"
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "breakdown" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Return rate" value={`${breakdown.returnRatePct.toFixed(1)}%`}
              sub="returns ÷ (delivered + returns)"
              tone={breakdown.returnRatePct > 20 ? "danger" : breakdown.returnRatePct > 10 ? "warning" : "success"} />
            <StatCard label="Delivered (baseline)" value={breakdown.deliveredCount.toLocaleString("en-IN")} />
            <StatCard label="Returns + RTO" value={breakdown.returnCount.toLocaleString("en-IN")} tone="warning" />
            {showMoney && <StatCard label="₹ lost to returns" value={formatINR(breakdown.totalRupeesLost, true)} tone="danger" />}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {breakdown.buckets.map((b) => (
              <Card key={b.bucket} className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge tone={BUCKET_TONE[b.bucket]}>{BUCKET_LABEL[b.bucket]}</Badge>
                  <span className="ml-auto text-2xl font-bold tabular-nums">{b.count}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Units</p><p className="font-medium tabular-nums">{b.units}</p></div>
                  {showMoney && b.bucket !== "DELIVERED" && b.bucket !== "CANCELLED" && (
                    <div><p className="text-xs text-muted-foreground">₹ lost</p><p className="font-medium tabular-nums text-danger">{formatINR(b.rupeesLost, true)}</p></div>
                  )}
                </div>
                {b.topSkus.length > 0 && (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Top SKUs</p>
                    {b.topSkus.slice(0, 3).map((s) => (
                      <div key={s.sku} className="flex justify-between text-xs"><span className="truncate">{s.sku}</span><span className="tabular-nums text-muted-foreground">{s.count}</span></div>
                    ))}
                  </div>
                )}
                {b.topStates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {b.topStates.slice(0, 3).map((s) => <Badge key={s.state}>{s.state} · {s.count}</Badge>)}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "queue" && (
        pendingShown.length === 0 ? (
          query
            ? <EmptyState emoji="🔍" title="No matching units" sub={`No pending QC items match “${query}”.`} />
            : <EmptyState emoji="🎉" title="No returns pending — enjoy the silence" sub="New RTO and customer returns will land here for inspection." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pendingShown.map((r) => {
              const days = daysWaiting(r.createdAt);
              return (
                <motion.div key={r.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className={cn("p-4", days > 7 && "border-warning/60")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.skuCode}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{r.subOrderNo}</p>
                      </div>
                      <Badge tone={r.returnType === "RTO" ? "warning" : r.returnType === "CUSTOMER_RETURN" ? "danger" : "info"}>
                        {RETURN_TYPE_LABEL[r.returnType]}
                      </Badge>
                    </div>
                    <p className={cn("mt-2 text-xs", days > 7 ? "font-medium text-warning" : "text-muted-foreground")}>
                      waiting {days} day{days === 1 ? "" : "s"}{days > 7 && " — aging!"}
                    </p>
                    {mayQc && (
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => decide(r.id, "SELLABLE")}
                          title="Restock — back into sellable stock"
                          className="flex items-center justify-center gap-1 rounded-xl bg-green-100 py-1.5 text-xs font-medium text-green-800 transition-transform active:scale-95 dark:bg-green-950 dark:text-green-300"
                        >
                          <motion.span animate={justPassed === r.id ? { scale: [1, 1.6, 1] } : {}}>
                            <BadgeCheck className="h-4 w-4" />
                          </motion.span>
                          Pass
                        </button>
                        <button
                          onClick={() => decide(r.id, "DAMAGED")}
                          title="Write-off / loss at COGS"
                          className="flex items-center justify-center gap-1 rounded-xl bg-red-100 py-1.5 text-xs font-medium text-red-800 transition-transform active:scale-95 dark:bg-red-950 dark:text-red-300"
                        >
                          <CircleX className="h-4 w-4" /> Fail
                        </button>
                        <button
                          onClick={() => decide(r.id, "DAMAGED_REPAIRABLE")}
                          title="Repairable — held out of sellable stock"
                          className="flex items-center justify-center gap-1 rounded-xl bg-orange-100 py-1.5 text-xs font-medium text-orange-800 transition-transform active:scale-95 dark:bg-orange-950 dark:text-orange-300"
                        >
                          <Wrench className="h-4 w-4" /> Damage
                        </button>
                        <button
                          onClick={() => decide(r.id, "MISMATCH")}
                          title="Apply for a Meesho claim"
                          className="flex items-center justify-center gap-1 rounded-xl bg-amber-100 py-1.5 text-xs font-medium text-amber-800 transition-transform active:scale-95 dark:bg-amber-950 dark:text-amber-300"
                        >
                          <FileQuestion className="h-4 w-4" /> Claim
                        </button>
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )
      )}

      {tab === "done" && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">Sub Order No</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Result</th>
                <th className="px-3 py-2.5">Restocked</th>
                <th className="px-3 py-2.5">When</th>
              </tr>
            </thead>
            <tbody>
              {doneShown.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{r.skuCode}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.subOrderNo}</td>
                  <td className="px-3 py-2 text-xs">{RETURN_TYPE_LABEL[r.returnType]}</td>
                  <td className="px-3 py-2">
                    <Badge tone={r.qcResult === "SELLABLE" ? "success" : r.qcResult === "DAMAGED" ? "danger" : "warning"}>
                      {r.qcResult}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{r.restocked ? "✓" : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(r.receivedDate)}</td>
                </tr>
              ))}
              {doneShown.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{query ? `No processed items match “${query}”.` : "Nothing processed yet."}</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "claims" && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">Raised</th>
                <th className="px-3 py-2.5">Sub Order No</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">Ticket</th>
                <th className="px-3 py-2.5 text-right">Claimed</th>
                <th className="px-3 py-2.5 text-right">Received</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {claimsShown.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-xs">{fmtDate(c.raisedDate)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.subOrderNo}</td>
                  <td className="px-3 py-2">{c.skuCode}</td>
                  <td className="px-3 py-2 text-xs">{c.ticketRef || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(c.amountClaimed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(c.amountReceived)}</td>
                  <td className="px-3 py-2">
                    {canDo(me.role, "raise_claim") ? (
                      <select
                        value={c.status}
                        onChange={(e) => actions.updateClaim(c.id, { status: e.target.value as typeof c.status })}
                        className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                      >
                        {["RAISED", "APPROVED", "REJECTED", "PAID"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <Badge>{c.status}</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {claimsShown.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{query ? `No claims match “${query}”.` : "No claims raised. Mismatched QC items create one automatically."}</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </Guard>
  );
}
