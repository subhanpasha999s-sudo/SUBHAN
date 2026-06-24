"use client";
/** Order detail — the vertical event timeline with running settlement. */
import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Flag } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { reconcileAll, resolvedInventorySku, settlementStatusOf } from "@/book/lib/v2/derived";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { ClassBadge, Guard, LifecycleBadge, PageHeader, fmtDate } from "@/book/components/v2/common";
import { buildTimeline, formatINR } from "@/book/lib/engine";
import { canDo } from "@/book/lib/v2/rbac";

const SETTLE_LABEL = { PAID: "Paid", UNPAID: "Unpaid", PARTIAL: "Partially settled", DISPUTED: "Disputed" } as const;
const SETTLE_TONE = { PAID: "success", UNPAID: "warning", PARTIAL: "info", DISPUTED: "danger" } as const;

export default function OrderDetailPage() {
  const params = useParams<{ subOrderNo: string }>();
  const subOrderNo = decodeURIComponent(params.subOrderNo);
  const { state, me, actions } = useV2();

  const rec = useMemo(
    () => reconcileAll(state).find((r) => r.subOrderNo === subOrderNo) ?? null,
    [state, subOrderNo]
  );
  const timeline = useMemo(
    () => (rec ? buildTimeline(rec.order, rec.events) : []),
    [rec]
  );

  if (!rec) {
    return (
      <Guard section="orders">
        <PageHeader title="Order not found" sub={subOrderNo} />
        <Link href="/book/orders" className="text-sm text-primary">← Back to orders</Link>
      </Guard>
    );
  }

  const disputed = state.disputed.includes(subOrderNo);
  const invSku = rec.order ? resolvedInventorySku(state, rec.order.sku) : null;
  const settleStatus = settlementStatusOf(rec);
  const linkedReturn = state.returnsQueue.find((r) => r.subOrderNo === subOrderNo) ?? null;
  const linkedClaim = state.claims.find((c) => c.subOrderNo === subOrderNo) ?? null;

  return (
    <Guard section="orders">
      <Link href="/book/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Orders
      </Link>
      <PageHeader
        title={rec.order?.productName || "Payment-only record"}
        sub={subOrderNo}
        right={
          canDo(me.role, "mark_disputed") ? (
            <Button variant={disputed ? "danger" : "secondary"} onClick={() => actions.markDisputed(subOrderNo, !disputed)}>
              <Flag className="h-4 w-4" /> {disputed ? "Clear dispute" : "Mark disputed"}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <ClassBadge cls={rec.currentClass} />
        <LifecycleBadge status={rec.lifecycleStatus} />
        {settleStatus && <Badge tone={SETTLE_TONE[settleStatus]}>{SETTLE_LABEL[settleStatus]}</Badge>}
        {rec.order && (
          <span className="text-sm text-muted-foreground">
            {rec.order.sku}
            {invSku && invSku !== rec.order.sku && <> → <span className="font-medium text-foreground">{invSku}</span></>}
            {" "}· qty {rec.order.quantity} · {rec.order.customerState} · ordered {fmtDate(rec.order.orderDate)}
          </span>
        )}
      </div>

      {/* Linked records: resolved SKU, return/QC, claim */}
      {(invSku || linkedReturn || linkedClaim) && (
        <div className="mb-6 flex flex-wrap gap-2 text-sm">
          {invSku ? (
            <Card className="px-3 py-2"><span className="text-muted-foreground">Inventory SKU:</span> <span className="font-medium">{invSku}</span></Card>
          ) : rec.order ? (
            <Card className="border-warning/50 px-3 py-2 text-warning">Listing SKU not mapped — excluded from inventory</Card>
          ) : null}
          {linkedReturn && (
            <Card className="px-3 py-2">
              <span className="text-muted-foreground">Return:</span>{" "}
              {linkedReturn.returnType.replace("_", " ").toLowerCase()} · QC {linkedReturn.qcStatus === "DONE" ? (linkedReturn.qcResult ?? "done") : "pending"}
            </Card>
          )}
          {linkedClaim && (
            <Card className="px-3 py-2">
              <span className="text-muted-foreground">Claim:</span> {linkedClaim.status} · {formatINR(linkedClaim.amountClaimed)}
            </Card>
          )}
        </div>
      )}

      <Card className="max-w-2xl p-6">
        <h3 className="mb-5 font-semibold">Timeline</h3>
        <ol className="relative ml-3 space-y-5 border-l-2 border-border pl-6">
          {timeline.map((t, i) => (
            <li key={i} className="relative">
              <span
                className={cn(
                  "absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-card",
                  t.amount === null ? "bg-muted-foreground" : t.amount >= 0 ? "bg-success" : "bg-danger"
                )}
              />
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{fmtDate(t.date)}</span>
                <span className="font-medium">{t.label}</span>
                {t.amount !== null && (
                  <span className={cn("ml-auto tabular-nums font-medium", t.amount >= 0 ? "text-success" : "text-danger")}>
                    {t.amount >= 0 ? "+" : "−"}{formatINR(Math.abs(t.amount))}
                  </span>
                )}
              </div>
              {t.sourceFile && (
                <p className="mt-0.5 text-xs text-muted-foreground">from {t.sourceFile}</p>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-6 flex items-center justify-between border-t-2 border-border pt-4">
          <span className="font-semibold">Cumulative settlement</span>
          <span className={cn("text-lg font-bold tabular-nums", rec.cumulativeSettlement >= 0 ? "text-success" : "text-danger")}>
            {formatINR(rec.cumulativeSettlement)}
          </span>
        </div>
        {(rec.totalTcs > 0 || rec.totalTds > 0) && (
          <p className="mt-2 text-xs text-muted-foreground">
            TCS {formatINR(rec.totalTcs)} · TDS {formatINR(rec.totalTds)} (recoverable at filing)
          </p>
        )}
      </Card>
    </Guard>
  );
}
