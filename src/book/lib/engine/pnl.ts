/**
 * P&L computation (spec Part 5) — per-order and monthly aggregate.
 */
import {
  AdsRow,
  ClassifiedOrder,
  CogsMap,
  MonthlyPnl,
  OrderClass,
  OrderPnl,
  PnlSettings,
  SkuPnlRow,
} from "./types";

export const DEFAULT_SETTINGS: PnlSettings = { expenseCogsOnReturns: false };

/** Apply COGS + revenue rules per class to one classified order. */
export function computeOrderPnl(
  c: ClassifiedOrder,
  cogsMap: CogsMap,
  settings: PnlSettings = DEFAULT_SETTINGS
): OrderPnl {
  const unitCost = cogsMap[c.sku] ?? 0;
  let cogsUnits = c.cogsUnits;
  // "Expense COGS on returns" toggle — conservative accounting treats the
  // returned unit as expensed even though it comes back.
  if (settings.expenseCogsOnReturns && c.orderClass === "RETURN") {
    cogsUnits = c.quantity;
  }
  const cogs = cogsUnits * unitCost;
  // Cancelled orders have revenue forced to 0 at classification time.
  const revenue = c.orderClass === "CANCELLED" ? 0 : c.settlement;
  return { ...c, unitCost, cogs, revenue, grossProfit: revenue - cogs };
}

export function computeAllOrderPnl(
  classified: ClassifiedOrder[],
  cogsMap: CogsMap,
  settings: PnlSettings = DEFAULT_SETTINGS
): OrderPnl[] {
  return classified.map((c) => computeOrderPnl(c, cogsMap, settings));
}

export function totalAdsSpend(adsRows: AdsRow[]): number {
  // Total Ads Cost values are NEGATIVE deductions ⇒ spend = |sum|
  return Math.abs(adsRows.reduce((s, r) => s + r.totalAdsCost, 0));
}

export function computeMonthlyPnl(
  orders: OrderPnl[],
  adsRows: AdsRow[],
  referralPayments = 0
): MonthlyPnl {
  const by = (cls: OrderClass) => orders.filter((o) => o.orderClass === cls);
  const sum = (xs: OrderPnl[], f: (o: OrderPnl) => number) =>
    xs.reduce((s, o) => s + f(o), 0);

  const deliveredPayout = sum(by("DELIVERED"), (o) => o.revenue);
  const exchangePayout = sum(by("EXCHANGE"), (o) => o.revenue);
  const claimIncome = sum(by("CLAIM"), (o) => o.revenue);
  const lostCompensation = sum(by("LOST"), (o) => o.revenue);

  const totalCogs = sum(orders, (o) => o.cogs);
  // Return-leg losses: negative settlements from RTO (C) and Return (H)
  // become a positive expense line.
  const returnLegLosses = sum(
    orders.filter(
      (o) =>
        (o.orderClass === "RTO" || o.orderClass === "RETURN") && o.revenue < 0
    ),
    (o) => -o.revenue
  );
  const platformDeductions = Math.abs(sum(by("PLATFORM_FEE"), (o) => o.revenue));
  const adsCost = totalAdsSpend(adsRows);

  // Positive return/RTO settlements (rare partial credits) count as income
  // so totals always reconcile with actual cash.
  const returnLegGains = sum(
    orders.filter(
      (o) =>
        (o.orderClass === "RTO" || o.orderClass === "RETURN") && o.revenue > 0
    ),
    (o) => o.revenue
  );

  const totalIncome =
    deliveredPayout +
    exchangePayout +
    claimIncome +
    lostCompensation +
    referralPayments +
    returnLegGains;
  const totalExpenses =
    totalCogs + returnLegLosses + platformDeductions + adsCost;
  const netProfit = totalIncome - totalExpenses;

  const orderCounts = orders.reduce(
    (acc, o) => {
      acc[o.orderClass] = (acc[o.orderClass] ?? 0) + 1;
      return acc;
    },
    {} as Record<OrderClass, number>
  );

  return {
    income: {
      deliveredPayout,
      exchangePayout,
      claimIncome,
      lostCompensation,
      referralPayments,
      total: totalIncome,
    },
    expenses: {
      totalCogs,
      returnLegLosses,
      platformDeductions,
      adsCost,
      total: totalExpenses,
    },
    netProfit,
    netMarginPct: totalIncome !== 0 ? (netProfit / totalIncome) * 100 : 0,
    recoverable: {
      tcs: sum(orders, (o) => o.tcs),
      tds: sum(orders, (o) => o.tds),
    },
    orderCounts,
  };
}

/** SKU-level P&L table (one row per SKU). */
export function computeSkuTable(orders: OrderPnl[]): SkuPnlRow[] {
  const map = new Map<string, SkuPnlRow>();
  for (const o of orders) {
    if (o.orderClass === "PLATFORM_FEE") continue; // not an order
    const sku = o.sku || "(no SKU)";
    let row = map.get(sku);
    if (!row) {
      row = {
        sku,
        productName: o.productName,
        totalOrders: 0,
        delivered: 0,
        rto: 0,
        returns: 0,
        cancelled: 0,
        lost: 0,
        exchanges: 0,
        claims: 0,
        netUnitsSold: 0,
        netPayout: 0,
        cogs: 0,
        grossProfit: 0,
        marginPct: 0,
        returnRatePct: 0,
      };
      map.set(sku, row);
    }
    if (!row.productName && o.productName) row.productName = o.productName;
    row.totalOrders++;
    switch (o.orderClass) {
      case "DELIVERED": row.delivered++; break;
      case "RTO": row.rto++; break;
      case "RETURN": row.returns++; break;
      case "CANCELLED": row.cancelled++; break;
      case "LOST": row.lost++; break;
      case "EXCHANGE": row.exchanges++; break;
      case "CLAIM": row.claims++; break;
    }
    row.netUnitsSold += -o.inventoryDelta;
    row.netPayout += o.revenue;
    row.cogs += o.cogs;
    row.grossProfit += o.grossProfit;
  }
  const rows = Array.from(map.values()).map((r) => {
    const denominator = r.totalOrders - r.cancelled;
    return {
      ...r,
      marginPct: r.netPayout !== 0 ? (r.grossProfit / r.netPayout) * 100 : 0,
      returnRatePct:
        denominator > 0 ? ((r.rto + r.returns) / denominator) * 100 : 0,
    };
  });
  return rows.sort((a, b) => b.grossProfit - a.grossProfit);
}
