/**
 * Anomaly & alerts engine (spec Part 8).
 */
import {
  AdsSummary,
  Alert,
  MonthlyPnl,
  OrderPnl,
  SkuPnlRow,
} from "./types";
import { formatINR } from "./format";

export function computeAlerts(
  orders: OrderPnl[],
  skuTable: SkuPnlRow[],
  pnl: MonthlyPnl,
  ads: AdsSummary
): Alert[] {
  const alerts: Alert[] = [];

  // ── 🔴 Critical ──────────────────────────────────────────────

  const paymentMissing = orders.filter((o) => o.paymentMissing);
  if (paymentMissing.length) {
    alerts.push({
      level: "critical",
      code: "PAYMENT_MISSING",
      message: `${paymentMissing.length} order(s) in the order file have no payment row — payment pending/missing.`,
      details: paymentMissing.map((o) => o.subOrderNo),
    });
  }

  const orderMissing = orders.filter(
    (o) => o.orderMissing && o.orderClass !== "PLATFORM_FEE" && o.orderClass !== "CLAIM"
  );
  if (orderMissing.length) {
    alerts.push({
      level: "critical",
      code: "UNKNOWN_CHARGE",
      message: `${orderMissing.length} payment row(s) have no matching order — unknown charge.`,
      details: orderMissing.map((o) => o.subOrderNo),
    });
  }

  for (const s of skuTable) {
    if (s.returnRatePct > 20 && s.totalOrders - s.cancelled >= 3) {
      alerts.push({
        level: "critical",
        code: "HIGH_RETURN_SKU",
        message: `SKU ${s.sku}: return rate ${s.returnRatePct.toFixed(1)}% (above 20%).`,
      });
    }
    if (s.grossProfit < 0) {
      alerts.push({
        level: "critical",
        code: "NEGATIVE_MARGIN_SKU",
        message: `SKU ${s.sku} is losing money: ${formatINR(s.grossProfit)} gross profit.`,
      });
    }
  }

  const underCompLost = orders.filter(
    (o) => o.orderClass === "LOST" && o.revenue < o.cogs
  );
  if (underCompLost.length) {
    alerts.push({
      level: "critical",
      code: "UNDERCOMPENSATED_LOST",
      message: `${underCompLost.length} lost order(s) compensated below cost.`,
      details: underCompLost.map((o) => o.subOrderNo),
    });
  }

  const underCompClaims = orders.filter(
    (o) => o.orderClass === "CLAIM" && o.revenue < o.cogs
  );
  if (underCompClaims.length) {
    alerts.push({
      level: "critical",
      code: "CLAIM_BELOW_COST",
      message: `${underCompClaims.length} claim settlement(s) below product cost.`,
      details: underCompClaims.map((o) => o.subOrderNo),
    });
  }

  // ── 🟡 Warning ───────────────────────────────────────────────

  const exchanges = orders.filter((o) => o.orderClass === "EXCHANGE");
  if (exchanges.length) {
    alerts.push({
      level: "warning",
      code: "EXCHANGE_REVIEW",
      message: `${exchanges.length} doorstep exchange(s) need manual review.`,
      details: exchanges.map((o) => o.subOrderNo),
    });
  }

  for (const s of skuTable) {
    if (s.marginPct > 0 && s.marginPct < 10 && s.netPayout > 0) {
      alerts.push({
        level: "warning",
        code: "THIN_MARGIN_SKU",
        message: `SKU ${s.sku}: margin only ${s.marginPct.toFixed(1)}%.`,
      });
    }
  }

  const realOrders = orders.filter(
    (o) => o.orderClass !== "PLATFORM_FEE" && o.orderClass !== "CANCELLED"
  );
  const rtoCount = orders.filter((o) => o.orderClass === "RTO").length;
  if (realOrders.length > 0) {
    const rtoRate = (rtoCount / realOrders.length) * 100;
    if (rtoRate > 15) {
      alerts.push({
        level: "warning",
        code: "HIGH_RTO_RATE",
        message: `Overall RTO rate is ${rtoRate.toFixed(1)}% (above 15%).`,
      });
    }
  }

  if (ads.totalSpend > 0 && ads.roas < 2.0) {
    alerts.push({
      level: "warning",
      code: "LOW_ROAS",
      message: `ROAS is ${ads.roas.toFixed(2)}x — below the 2.0x benchmark.`,
    });
  }

  if (pnl.recoverable.tcs > 0 || pnl.recoverable.tds > 0) {
    alerts.push({
      level: "warning",
      code: "TCS_TDS_RECOVERABLE",
      message: `Recoverable at tax filing: TCS ${formatINR(pnl.recoverable.tcs)}, TDS ${formatINR(pnl.recoverable.tds)}.`,
    });
  }

  // ── 🟢 Positive ──────────────────────────────────────────────

  const profitable = skuTable.filter((s) => s.grossProfit > 0);
  if (profitable.length) {
    const topMargin = [...profitable].sort((a, b) => b.marginPct - a.marginPct)[0];
    const topProfit = [...profitable].sort((a, b) => b.grossProfit - a.grossProfit)[0];
    alerts.push({
      level: "positive",
      code: "TOP_MARGIN_SKU",
      message: `Best margin: ${topMargin.sku} at ${topMargin.marginPct.toFixed(1)}%.`,
    });
    alerts.push({
      level: "positive",
      code: "TOP_PROFIT_SKU",
      message: `Most profit: ${topProfit.sku} earned ${formatINR(topProfit.grossProfit)}.`,
    });
  }

  const totalReal = realOrders.length;
  if (totalReal > 0) {
    const organicShare =
      (realOrders.filter((o) => o.orderSource === "").length / totalReal) * 100;
    alerts.push({
      level: "positive",
      code: "ORGANIC_SHARE",
      message: `${organicShare.toFixed(0)}% of orders came organically (no ad spend).`,
    });
  }

  return alerts;
}
