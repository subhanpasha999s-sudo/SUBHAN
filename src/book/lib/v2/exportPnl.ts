/** Excel/CSV export for the Payout & P/L pages (SheetJS). */
import * as XLSX from "xlsx";
import { OrderPnlRow, ProductPnlRow, PayoutSummary } from "./derived";

export function exportOrderPnl(rows: OrderPnlRow[], label: string) {
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
    "Order Date": r.orderDate, "Sub Order No": r.subOrderNo,
    "Inventory SKU": r.inventorySku ?? "(unmapped)", Product: r.productName,
    Class: r.currentClass, Qty: r.qty, "Selling Price": r.sellingPrice,
    "Affiliate Fee Deduction": r.deductions, "Payout Before Affiliate Fee": r.netPayout,
    "Net Payout": r.netAfterDeductions,
    COGS: r.cogs, "Gross Profit": r.grossProfitAfterDeductions, "Margin %": Number(r.marginPct.toFixed(2)),
    "Settlement": r.settlementStatus ?? "",
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Order-wise P&L");
  XLSX.writeFile(wb, `payout-orderwise-${label}.xlsx`);
}

export function exportProductPnl(rows: ProductPnlRow[], label: string) {
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
    SKU: r.inventorySku, Product: r.productName, Orders: r.orders,
    Delivered: r.delivered, Returns: r.returns, RTO: r.rto, Lost: r.lost, Claim: r.claim,
    "Net Units Sold": r.netUnitsSold, "Net Payout": r.netPayout,
    COGS: r.cogs, "Gross Profit": r.grossProfit, "Margin %": Number(r.marginPct.toFixed(2)),
    "Return Rate %": Number(r.returnRatePct.toFixed(2)),
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Product-wise P&L");
  XLSX.writeFile(wb, `payout-productwise-${label}.xlsx`);
}

export function exportSummary(s: PayoutSummary, label: string) {
  const aoa = [
    ["Payout Summary", label],
    [],
    ["INCOME"],
    ["Delivered payout", s.income.delivered],
    ["Exchange payout", s.income.exchange],
    ["Claim/compensation income", s.income.claim],
    ["Lost-order compensation", s.income.lostComp],
    ["Total income", s.income.total],
    [],
    ["EXPENSES"],
    ["COGS", s.expenses.cogs],
    ["Return-leg losses", s.expenses.returnLosses],
    ["Platform/affiliate deductions", s.expenses.platformDeductions],
    ["Ads", s.expenses.ads],
    ["Business expenses", s.expenses.businessExpenses],
    ["Total expenses", s.expenses.total],
    [],
    ["Order gross profit (reconciling subtotal)", s.orderGrossProfit],
    ["NET PROFIT", s.netProfit],
    ["Net margin %", Number(s.netMarginPct.toFixed(2))],
    [],
    ["UNMATCHED PAYOUT IMPACT"],
    ["Unmatched sub orders", s.unmatchedPayouts.subOrders],
    ["Rows held for matching", s.unmatchedPayouts.rows],
    ["Credits/compensation", s.unmatchedPayouts.credits],
    ["Affiliate/platform fees", -s.unmatchedPayouts.affiliateFees],
    ["Return/RTO deductions", -s.unmatchedPayouts.returnDeductions],
    ["Other deductions", -s.unmatchedPayouts.otherDeductions],
    ["Net unmatched impact", s.unmatchedPayouts.net],
    [],
    ["RECOVERABLE"],
    ["TCS", s.recoverable.tcs],
    ["TDS", s.recoverable.tds],
    [],
    ["RECEIVABLE FROM MEESHO"],
    ["Unpaid orders", s.receivables.unpaidOrders],
    ["Unpaid amount", s.receivables.unpaidAmount],
    ["Pending claims", s.receivables.pendingClaims],
    ["Pending claim amount", s.receivables.pendingClaimAmount],
    ["Total receivable", s.receivables.total],
    [],
    ["RECONCILIATION"],
    ["Matched orders", s.reconciliation.matched],
    ["Unmatched payment rows", s.reconciliation.unmatched],
    ["Unmapped SKUs", s.reconciliation.unmapped],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Summary");
  XLSX.writeFile(wb, `payout-summary-${label}.xlsx`);
}
