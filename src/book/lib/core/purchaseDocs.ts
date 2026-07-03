/**
 * Purchase-document helpers (Phase 4) — landed-cost allocation.
 *
 * Freight/duty on a purchase is allocated onto item unit costs BEFORE the bill
 * is created, so the existing weighted-average COGS path absorbs it with no
 * changes. Allocation is by line value (default) or quantity; paise rounding
 * remainder goes to the last line so the total allocated always equals the
 * landed cost exactly.
 */
import { round2 } from "./journal";
import type { PurchaseOrderItem } from "../v2/types";

export interface AllocatedItem extends PurchaseOrderItem {
  /** Landed cost allocated to the whole line (not per unit). */
  allocated: number;
  /** unitCost grossed up by allocated/quantity (2dp). */
  landedUnitCost: number;
}

export function allocateLandedCost(
  items: PurchaseOrderItem[],
  landedCost: number,
  basis: "value" | "quantity" = "value",
): AllocatedItem[] {
  const cost = round2(Math.max(0, landedCost));
  const weights = items.map((i) =>
    basis === "quantity" ? i.quantity : i.quantity * i.unitCost,
  );
  let totalWeight = weights.reduce((s, w) => s + w, 0);
  // degenerate weights (all-zero value lines etc.) → fall back to quantity,
  // then to equal split, so cost is never silently dropped
  let effWeights = weights;
  if (totalWeight <= 0) {
    effWeights = items.map((i) => i.quantity);
    totalWeight = effWeights.reduce((s, w) => s + w, 0);
  }
  if (totalWeight <= 0) {
    effWeights = items.map(() => 1);
    totalWeight = items.length;
  }

  let allocatedSoFar = 0;
  return items.map((item, idx) => {
    const last = idx === items.length - 1;
    const allocated = last
      ? round2(cost - allocatedSoFar) // remainder absorbs rounding drift
      : round2((cost * effWeights[idx]) / totalWeight);
    allocatedSoFar = round2(allocatedSoFar + allocated);
    const landedUnitCost = item.quantity > 0
      ? round2(item.unitCost + allocated / item.quantity)
      : item.unitCost;
    return { ...item, allocated, landedUnitCost };
  });
}

/** Bill totals for a received PO: GST on goods value; landed cost added net. */
export function receivedBillTotals(
  items: PurchaseOrderItem[],
  landedCost: number,
): { goods: number; gst: number; total: number } {
  const goods = round2(items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
  const gst = round2(items.reduce((s, i) => s + i.quantity * i.unitCost * (i.gstRate / 100), 0));
  return { goods, gst, total: round2(goods + gst + round2(Math.max(0, landedCost))) };
}
