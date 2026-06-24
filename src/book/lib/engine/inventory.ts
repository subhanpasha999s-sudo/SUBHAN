/**
 * Inventory module (spec Part 6) — per-SKU movement ledger.
 *
 *   Opening Stock (optional user input)
 *   − sold (B + completed E) − lost (D) − claim-lost (G)
 *   = Estimated Closing Stock
 *   QC Pending: C + H + failed E (returned, inspect before restock)
 */
import { InventoryRow, OrderPnl } from "./types";

export type OpeningStockMap = Record<string, number>;

export function computeInventory(
  orders: OrderPnl[],
  openingStock: OpeningStockMap = {}
): InventoryRow[] {
  const map = new Map<string, InventoryRow>();
  for (const o of orders) {
    if (o.orderClass === "PLATFORM_FEE") continue;
    const sku = o.sku || "(no SKU)";
    let row = map.get(sku);
    if (!row) {
      row = {
        sku,
        productName: o.productName,
        openingStock: openingStock[sku] ?? null,
        unitsSold: 0,
        unitsLost: 0,
        unitsClaimLost: 0,
        qcPending: 0,
        closingStock: null,
      };
      map.set(sku, row);
    }
    if (!row.productName && o.productName) row.productName = o.productName;
    switch (o.orderClass) {
      case "DELIVERED":
        row.unitsSold += o.quantity;
        break;
      case "EXCHANGE":
        // completed exchange ⇒ inventoryDelta < 0 (replacement unit sold);
        // failed exchange ⇒ qcPendingUnits > 0
        row.unitsSold += -o.inventoryDelta;
        row.qcPending += o.qcPendingUnits;
        break;
      case "LOST":
        row.unitsLost += o.quantity;
        break;
      case "CLAIM":
        row.unitsClaimLost += o.quantity;
        break;
      case "RTO":
      case "RETURN":
        row.qcPending += o.qcPendingUnits;
        break;
    }
  }
  for (const row of map.values()) {
    if (row.openingStock !== null) {
      row.closingStock =
        row.openingStock - row.unitsSold - row.unitsLost - row.unitsClaimLost;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.sku.localeCompare(b.sku)
  );
}
