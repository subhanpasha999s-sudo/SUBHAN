"use client";
/**
 * Reconciliation health banner — reads the SINGLE canonical reconciliationState
 * (no inline recomputation). Labels every unmatched record by cause (awaiting
 * settlement vs unacknowledged payout), never as "lost/missing".
 */
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { useV2 } from "@/book/lib/v2/store";
import { reconciliationState, unmappedTray } from "@/book/lib/v2/derived";
import { Card } from "@/book/components/ui";

export default function HealthBanner() {
  const { state } = useV2();
  const { recon, unmapped } = useMemo(
    () => ({ recon: reconciliationState(state), unmapped: unmappedTray(state).length }),
    [state]
  );

  const items = [
    unmapped > 0 && { label: `${unmapped} unmapped SKU${unmapped > 1 ? "s" : ""}`, href: "/mapping" },
    recon.awaiting > 0 && { label: `${recon.awaiting.toLocaleString("en-IN")} awaiting settlement`, href: "/reconciliation" },
    recon.unacknowledged.count > 0 && { label: `${recon.unacknowledged.count.toLocaleString("en-IN")} unacknowledged payouts`, href: "/reconciliation" },
  ].filter(Boolean) as { label: string; href: string }[];

  if (items.length === 0) {
    return (
      <Card className="flex items-center gap-2 border-success/30 p-3 text-sm">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <span className="text-muted-foreground">Reconciliation is clean — every order matched and mapped.</span>
      </Card>
    );
  }

  return (
    <Card className="border-warning/40 bg-amber-50/60 p-3 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <span className="font-medium">Reconciliation:</span>
        {items.map((it, i) => (
          <Link key={i} href={it.href} className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted">
            {it.label} <ArrowRight className="h-3 w-3 text-primary" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
