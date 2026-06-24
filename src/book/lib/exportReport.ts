/**
 * Excel export (spec Part 9.8) — multi-sheet workbook via SheetJS:
 * Summary, SKU P&L, Orders, Inventory, Alerts.
 */
import * as XLSX from "xlsx";
import { MonthData, ORDER_CLASS_LABELS } from "./engine";

export function exportReport(month: MonthData): void {
  const wb = XLSX.utils.book_new();

  const p = month.pnl;
  const summary = [
    ["Tulmin Book — Monthly P&L Report", month.label],
    [],
    ["INCOME"],
    ["Delivered sales payout", p.income.deliveredPayout],
    ["Exchange payouts", p.income.exchangePayout],
    ["Claim/Compensation income", p.income.claimIncome],
    ["Lost-order compensation", p.income.lostCompensation],
    ["Referral payments", p.income.referralPayments],
    ["TOTAL INCOME", p.income.total],
    [],
    ["EXPENSES"],
    ["Total COGS", p.expenses.totalCogs],
    ["Return-leg losses", p.expenses.returnLegLosses],
    ["Platform deductions", p.expenses.platformDeductions],
    ["Total Ads Cost", p.expenses.adsCost],
    ["TOTAL EXPENSES", p.expenses.total],
    [],
    ["NET PROFIT", p.netProfit],
    ["NET MARGIN %", Number(p.netMarginPct.toFixed(2))],
    [],
    ["RECOVERABLE (not expensed)"],
    ["TCS", p.recoverable.tcs],
    ["TDS", p.recoverable.tds],
    [],
    ["ADS"],
    ["Total Ads Spend", month.ads.totalSpend],
    ["Ad-order revenue", month.ads.adOrderRevenue],
    ["ROAS", Number(month.ads.roas.toFixed(2))],
    ["Ads Net", month.ads.adsNet],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  const skuSheet = XLSX.utils.json_to_sheet(
    month.skuTable.map((s) => ({
      SKU: s.sku,
      "Product Name": s.productName,
      "Total Orders": s.totalOrders,
      Delivered: s.delivered,
      RTO: s.rto,
      Returns: s.returns,
      Cancelled: s.cancelled,
      Lost: s.lost,
      Exchanges: s.exchanges,
      Claims: s.claims,
      "Net Units Sold": s.netUnitsSold,
      "Net Payout": s.netPayout,
      COGS: s.cogs,
      "Gross Profit": s.grossProfit,
      "Margin %": Number(s.marginPct.toFixed(2)),
      "Return Rate %": Number(s.returnRatePct.toFixed(2)),
    }))
  );
  XLSX.utils.book_append_sheet(wb, skuSheet, "SKU P&L");

  const ordersSheet = XLSX.utils.json_to_sheet(
    month.orders.map((order) => ({
      "Sub Order No": order.subOrderNo,
      Class: ORDER_CLASS_LABELS[order.orderClass],
      SKU: order.sku,
      "Product Name": order.productName,
      Qty: order.quantity,
      State: order.customerState,
      "Order Date": order.orderDate,
      "Order Source": order.orderSource,
      Settlement: order.settlement,
      COGS: order.cogs,
      "Gross Profit": order.grossProfit,
      "Payment Missing": order.paymentMissing ? "YES" : "",
      "Needs Review": order.needsReview ? "YES" : "",
    }))
  );
  XLSX.utils.book_append_sheet(wb, ordersSheet, "Orders");

  const invSheet = XLSX.utils.json_to_sheet(
    month.inventory.map((r) => ({
      SKU: r.sku,
      "Product Name": r.productName,
      "Opening Stock": r.openingStock ?? "",
      "Units Sold": r.unitsSold,
      "Units Lost": r.unitsLost,
      "Claim Lost": r.unitsClaimLost,
      "QC Pending": r.qcPending,
      "Est. Closing Stock": r.closingStock ?? "",
    }))
  );
  XLSX.utils.book_append_sheet(wb, invSheet, "Inventory");

  const alertsSheet = XLSX.utils.json_to_sheet(
    month.alerts.map((a) => ({
      Level: a.level.toUpperCase(),
      Code: a.code,
      Message: a.message,
      Details: a.details?.join(", ") ?? "",
    }))
  );
  XLSX.utils.book_append_sheet(wb, alertsSheet, "Alerts");

  XLSX.writeFile(wb, `meeshoprofit-report-${month.label}.xlsx`);
}
