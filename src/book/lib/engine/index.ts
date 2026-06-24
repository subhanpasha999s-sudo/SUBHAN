/**
 * Engine orchestrator: raw parsed rows → fully-computed MonthData.
 * Pure — UI and storage layers live elsewhere.
 */
import { classifyAll, mergeFiles } from "./classify";
import { computeAdsSummary } from "./ads";
import { computeAlerts } from "./alerts";
import { computeInventory, OpeningStockMap } from "./inventory";
import {
  computeAllOrderPnl,
  computeMonthlyPnl,
  computeSkuTable,
  DEFAULT_SETTINGS,
} from "./pnl";
import {
  AdsRow,
  CogsMap,
  MonthData,
  OrderRow,
  PaymentRow,
  PnlSettings,
} from "./types";

export interface ComputeInput {
  label: string;
  orderRows: OrderRow[];
  paymentRows: PaymentRow[];
  adsRows: AdsRow[];
  referralTotal: number;
  cogsMap: CogsMap;
  openingStock?: OpeningStockMap;
  settings?: PnlSettings;
}

export function computeMonth(input: ComputeInput): MonthData {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const merged = mergeFiles(input.orderRows, input.paymentRows);
  const classified = classifyAll(merged);
  const orders = computeAllOrderPnl(classified, input.cogsMap, settings);
  const pnl = computeMonthlyPnl(orders, input.adsRows, input.referralTotal);
  const skuTable = computeSkuTable(orders);
  const inventory = computeInventory(orders, input.openingStock ?? {});
  const ads = computeAdsSummary(orders, input.adsRows);
  const alerts = computeAlerts(orders, skuTable, pnl, ads);
  return {
    label: input.label,
    orders,
    pnl,
    skuTable,
    inventory,
    ads,
    alerts,
    adsRows: input.adsRows,
    referralTotal: input.referralTotal,
    uploadedAt: new Date().toISOString(),
  };
}

export * from "./types";
export * from "./classify";
export * from "./pnl";
export * from "./inventory";
export * from "./ads";
export * from "./alerts";
export * from "./format";
export * from "./parse";
export * from "./headerMatcher";
export * from "./num";
export * from "./reconcile";
export * from "./skuMap";
export * from "./stock";
export * from "./gst";
export * from "./expense";
export * from "./accounting";
export { detectDuplicates, detectDelimiter, autoDetectMapping, getCsvPreview, mapCsvToBankTxns, normalizeDate, parseOfxContent, parseQifContent, parseCamtContent } from "./bankParse";
export type { ParsedBankTxn, BankColumnMapping, CsvPreview, SkippedRow, BankFormat, TabularFormat, ParseReport as BankParseReport } from "./bankParse";
export * from "./bankCategorize";
export * from "./bankSamples";
