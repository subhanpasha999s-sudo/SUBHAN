"use client";
/** Inventory — stock intel table, ledger drill-down, adjustments, labels. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Printer, Search, SlidersHorizontal } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, EmptyState, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { canDo } from "@/book/lib/v2/rbac";
import { formatINR, formatNum, stockIntelligence } from "@/book/lib/engine";
import ProductForm from "@/book/components/v2/ProductForm";
import { flags } from "@/book/lib/flags";
import { ADJUSTMENT_REASONS, formatAdjustmentReason, type AdjustmentReasonCode } from "@/book/lib/core/contacts";
import type { Sku } from "@/book/lib/v2/types";

export default function InventoryPage() {
  const { state, me, actions } = useV2();
  const search = useSearchParams();
  const [q, setQ] = useState(search.get("sku") ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjCode, setAdjCode] = useState<AdjustmentReasonCode | "">("");
  const [adjNote, setAdjNote] = useState("");
  const [editing, setEditing] = useState<Sku | "new" | null>(null);
  const canEdit = canDo(me.role, "edit_skus");

  const intel = useMemo(
    () =>
      stockIntelligence(
        state.skus.map((s) => ({ skuCode: s.skuCode, productName: s.productName, currentCogs: s.currentCogs, reorderLevel: s.reorderLevel })),
        state.ledger
      ),
    [state.skus, state.ledger]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return intel.rows
      .filter((r) => !needle || r.skuCode.toLowerCase().includes(needle) || r.productName.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.needsReorder) - Number(a.needsReorder) || a.skuCode.localeCompare(b.skuCode));
  }, [intel.rows, q]);

  // Reason-coded adjustments (Phase 2). The stored reason string stays
  // human-readable ("CODE — note") so old free-text entries coexist fine.
  const adjReasonFinal = flags.contactsPlus
    ? (adjCode && (adjCode !== "OTHER" || adjNote.trim()) ? formatAdjustmentReason(adjCode, adjNote) : "")
    : adjReason.trim();

  function submitAdjustment(skuCode: string) {
    const delta = parseInt(adjQty, 10);
    if (!Number.isFinite(delta) || delta === 0 || !adjReasonFinal) return;
    actions.stockAdjustment(skuCode, delta, adjReasonFinal);
    setAdjusting(null);
    setAdjQty("");
    setAdjReason("");
    setAdjCode("");
    setAdjNote("");
  }

  if (state.skus.length === 0) {
    return (
      <Guard section="inventory">
        {editing && <ProductForm edit={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
        <PageHeader title="Item" right={canEdit ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add product</Button> : undefined} />
        <EmptyState emoji="📦" title="No products yet" sub="Add a product, upload an order file, or create a purchase bill." />
      </Guard>
    );
  }

  return (
    <Guard section="inventory">
      {editing && <ProductForm edit={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <PageHeader
        title="Item"
        sub={`Stock valuation ${formatINR(intel.totalValuation, true)} · ${rows.filter((r) => r.needsReorder).length} below reorder level`}
        right={
          <div className="flex gap-2">
            {canDo(me.role, "print_labels") && (
              <Button
                variant="secondary"
                onClick={() => actions.printLabels(rows.filter((r) => r.stock > 0).slice(0, 5).map((r) => ({ skuCode: r.skuCode, count: r.stock })))}
              >
                <Printer className="h-4 w-4" /> Labels
              </Button>
            )}
            {canEdit && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add product</Button>}
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search SKU…"
          className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">SKU / Product</th>
              <th className="px-3 py-2.5 text-right">Stock</th>
              <th className="px-3 py-2.5 text-right">Reorder lvl</th>
              <th className="px-3 py-2.5 text-right">Avg daily sales</th>
              <th className="px-3 py-2.5 text-right">Days of stock</th>
              <th className="px-3 py-2.5 text-right">COGS</th>
              <th className="px-3 py-2.5 text-right">Valuation</th>
              <th className="px-3 py-2.5">Flags</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <>
                <tr key={r.skuCode} className="border-b border-border last:border-0 hover:bg-muted/60">
                  <td className="max-w-[240px] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link href={`/book/sku/${encodeURIComponent(r.skuCode)}`} className="truncate font-medium text-primary hover:underline">{r.skuCode}</Link>
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setExpanded(expanded === r.skuCode ? null : r.skuCode)}>ledger</button>
                    </div>
                    <p className="truncate text-xs text-muted-foreground" title={r.productName}>{r.productName}</p>
                  </td>
                  <td className={cn("px-3 text-right tabular-nums font-medium", r.stock < 0 && "text-danger")}>{formatNum(r.stock)}</td>
                  <td className="px-3 text-right tabular-nums text-muted-foreground">{r.reorderLevel || "—"}</td>
                  <td className="px-3 text-right tabular-nums">{r.avgDailySales.toFixed(1)}</td>
                  <td className="px-3 text-right tabular-nums">{r.daysOfStock ?? "—"}</td>
                  <td className="px-3 text-right tabular-nums">{formatINR(state.skus.find((s) => s.skuCode === r.skuCode)?.currentCogs ?? 0)}</td>
                  <td className="px-3 text-right tabular-nums">{formatINR(r.valuation, true)}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {r.needsReorder && <Badge tone="warning">reorder</Badge>}
                      {r.deadStock && <Badge tone="danger">dead stock</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex gap-1">
                      {canEdit && (
                        <button
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit product"
                          onClick={() => setEditing(state.skus.find((s) => s.skuCode === r.skuCode) ?? null)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDo(me.role, "stock_adjustment") && (
                        <button
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Stock adjustment"
                          onClick={() => setAdjusting(adjusting === r.skuCode ? null : r.skuCode)}
                        >
                          <SlidersHorizontal className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {adjusting === r.skuCode && (
                  <tr className="border-b border-border bg-muted/40">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">Manual adjustment:</span>
                        <input
                          value={adjQty}
                          onChange={(e) => setAdjQty(e.target.value)}
                          placeholder="+5 or -3"
                          className="w-24 rounded-xl border border-border bg-card px-3 py-1.5 text-sm tabular-nums"
                        />
                        {flags.contactsPlus ? (
                          <>
                            <select
                              value={adjCode}
                              onChange={(e) => setAdjCode(e.target.value as AdjustmentReasonCode | "")}
                              className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm"
                            >
                              <option value="">Reason…</option>
                              {ADJUSTMENT_REASONS.map((r2) => <option key={r2.code} value={r2.code}>{r2.label}</option>)}
                            </select>
                            <input
                              value={adjNote}
                              onChange={(e) => setAdjNote(e.target.value)}
                              placeholder={adjCode === "OTHER" ? "Note (mandatory)" : "Note (optional)"}
                              className="min-w-[180px] flex-1 rounded-xl border border-border bg-card px-3 py-1.5 text-sm"
                            />
                          </>
                        ) : (
                          <input
                            value={adjReason}
                            onChange={(e) => setAdjReason(e.target.value)}
                            placeholder="Reason (mandatory)"
                            className="min-w-[220px] flex-1 rounded-xl border border-border bg-card px-3 py-1.5 text-sm"
                          />
                        )}
                        <Button onClick={() => submitAdjustment(r.skuCode)} disabled={!adjReasonFinal || !parseInt(adjQty, 10)}>
                          Apply
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {expanded === r.skuCode && (
                  <tr className="border-b border-border bg-muted/40">
                    <td colSpan={9} className="px-4 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ledger (latest 12)</p>
                      <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-card">
                        <table className="w-full text-xs">
                          <tbody>
                            {state.ledger
                              .filter((l) => l.skuCode === r.skuCode)
                              .slice(-12)
                              .reverse()
                              .map((l, i) => (
                                <tr key={i} className="border-b border-border last:border-0">
                                  <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(l.createdAt)}</td>
                                  <td className="px-3 py-1.5 font-medium">{l.eventType}</td>
                                  <td className={cn("px-3 py-1.5 text-right tabular-nums", l.quantityDelta > 0 ? "text-success" : l.quantityDelta < 0 ? "text-danger" : "text-muted-foreground")}>
                                    {l.quantityDelta > 0 ? `+${l.quantityDelta}` : l.quantityDelta}
                                  </td>
                                  <td className="max-w-[220px] truncate px-3 py-1.5 text-muted-foreground">{l.notes || l.refId}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </Card>
    </Guard>
  );
}
