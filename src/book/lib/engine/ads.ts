/**
 * Ads reconciliation (spec Part 7).
 * Ad-attributed orders = order rows where `Order source` is non-blank.
 */
import { AdsRow, AdsSummary, OrderPnl } from "./types";
import { totalAdsSpend } from "./pnl";

export function computeAdsSummary(
  orders: OrderPnl[],
  adsRows: AdsRow[]
): AdsSummary {
  const totalSpend = totalAdsSpend(adsRows);
  const real = orders.filter(
    (o) => o.orderClass !== "PLATFORM_FEE" && o.orderClass !== "CANCELLED"
  );
  const adOrders = real.filter((o) => o.orderSource !== "");
  const organic = real.filter((o) => o.orderSource === "");

  const adOrderRevenue = adOrders.reduce((s, o) => s + o.revenue, 0);
  const adOrderProfit = adOrders.reduce((s, o) => s + o.grossProfit, 0);

  return {
    totalSpend,
    adOrderCount: adOrders.length,
    adOrderRevenue,
    adOrderProfit,
    organicOrderCount: organic.length,
    organicRevenue: organic.reduce((s, o) => s + o.revenue, 0),
    roas: totalSpend > 0 ? adOrderRevenue / totalSpend : 0,
    adsNet: adOrderProfit - totalSpend,
  };
}
