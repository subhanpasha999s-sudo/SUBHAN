/**
 * Financial reporting layer — Phase 0 (GL derivation) + Phase 1–3 (P&L,
 * Balance Sheet, Cash Flow). GL entries are DERIVED from V2State, never
 * stored — all historical data is automatically included.
 *
 * Standard: informal internal use, not GAAP/IFRS certified.
 */
import {
  COA,
  GlEntry,
  naturalBalance,
  trialBalance,
  TrialBalanceRow,
} from "@/book/lib/engine/accounting";
import {
  isAffiliateFeeEvent,
  openSettlements,
} from "@/book/lib/engine";
import type { ReconciledOrder } from "@/book/lib/engine";
import {
  reconcileAll,
  payoutSummary,
  PnlFilter,
  PayoutSummary,
  orderMonths,
} from "./derived";
import type { V2State } from "./types";

// ── Phase 0: GL derivation ────────────────────────────────────────────

/**
 * Build the full double-entry General Ledger from V2State.
 * One call = one complete ledger; cache externally if needed.
 */
export function buildGlEntries(
  state: V2State,
  reconciled: ReconciledOrder[]
): GlEntry[] {
  const entries: GlEntry[] = [];
  const cogsOf = (sku: string) =>
    state.skus.find((s) => s.skuCode === sku)?.currentCogs ?? 0;

  // ── 1. Order settlements (PaymentEvents) ─────────────────────────
  for (const r of reconciled) {
    for (const e of r.events) {
      const date = (e.paymentDate || e.eventDate || "").slice(0, 10);
      const amount = Math.abs(e.finalSettlement);
      if (amount < 0.005) continue;

      if (isAffiliateFeeEvent(e)) {
        // Affiliate / platform fee: DR Platform Fee, CR Cash
        entries.push({
          id: `fee:${e.transactionId}`,
          date,
          debitCode: COA.PLATFORM_FEE.code,
          creditCode: COA.CASH.code,
          amount,
          description: `Platform fee (${e.subOrderNo})`,
          sourceType: "order_settlement",
          sourceId: e.subOrderNo,
        });
        continue;
      }

      if (e.finalSettlement > 0) {
        // Positive settlement — income: DR Cash, CR Revenue account
        let creditCode: string = COA.SALES.code;
        if (r.currentClass === "EXCHANGE") creditCode = COA.EXCHANGE_REV.code;
        else if (r.currentClass === "CLAIM") creditCode = COA.CLAIM_REV.code;
        else if (r.currentClass === "LOST") creditCode = COA.LOST_COMP.code;
        entries.push({
          id: `sett:${e.transactionId}`,
          date,
          debitCode: COA.CASH.code,
          creditCode,
          amount: e.finalSettlement,
          description: `${r.currentClass} settlement ${e.subOrderNo}`,
          sourceType: "order_settlement",
          sourceId: e.subOrderNo,
        });
        // TDS/TCS are withheld FROM the gross and already excluded from
        // finalSettlement. DR the receivable account, CR the same revenue
        // account (not Cash) so Cash = net received, Revenue = gross earned.
        if (e.tds > 0.005) {
          entries.push({
            id: `tds:${e.transactionId}`,
            date,
            debitCode: COA.TDS_REC.code,
            creditCode,
            amount: e.tds,
            description: `TDS withheld ${e.subOrderNo}`,
            sourceType: "order_settlement",
            sourceId: e.subOrderNo,
          });
        }
        if (e.tcs > 0.005) {
          entries.push({
            id: `tcs:${e.transactionId}`,
            date,
            debitCode: COA.TCS_REC.code,
            creditCode,
            amount: e.tcs,
            description: `TCS withheld ${e.subOrderNo}`,
            sourceType: "order_settlement",
            sourceId: e.subOrderNo,
          });
        }
      } else {
        // Negative settlement — return/RTO/fee loss: DR Return Loss, CR Cash
        entries.push({
          id: `sett:${e.transactionId}`,
          date,
          debitCode: COA.RETURN_LOSS.code,
          creditCode: COA.CASH.code,
          amount,
          description: `${r.currentClass} loss ${e.subOrderNo}`,
          sourceType: "order_settlement",
          sourceId: e.subOrderNo,
        });
      }
    }

    // COGS recognition (per order, for income-generating classes)
    if (
      r.order &&
      r.currentClass !== "CANCELLED" &&
      r.currentClass !== "RTO" &&
      r.currentClass !== "RETURN" &&
      r.currentClass !== "PLATFORM_FEE" &&
      r.currentClass !== "UNKNOWN"
    ) {
      const cogs = cogsOf(r.order.sku) * r.order.quantity;
      if (cogs > 0.005) {
        const date = (r.order.orderDate || "").slice(0, 10);
        entries.push({
          id: `cogs:${r.subOrderNo}`,
          date,
          debitCode: COA.COGS.code,
          creditCode: COA.INVENTORY.code,
          amount: cogs,
          description: `COGS ${r.subOrderNo} (${r.order.sku} ×${r.order.quantity})`,
          sourceType: "cogs",
          sourceId: r.subOrderNo,
        });
      }
    }
  }

  // ── 2. Purchases ─────────────────────────────────────────────────
  // A bill always posts DR Inventory / CR AP. The paid portion posts a separate
  // DR AP / CR Cash payment — from discrete BillPayment records if present, else
  // an implicit payment for a bill entered as paid/partial. This keeps AP
  // accurate and supports partial payments (net economics are unchanged).
  for (const p of state.purchases) {
    const date = (p.invoiceDate || "").slice(0, 10);
    const amount = p.totalAmount;
    if (amount <= 0) continue;
    entries.push({
      id: `purchase:${p.id}`,
      date,
      debitCode: COA.INVENTORY.code,
      creditCode: COA.AP.code,
      amount,
      description: `Purchase ${p.supplierName}${p.invoiceNo ? ` — ${p.invoiceNo}` : ""} (${p.paymentStatus})`,
      sourceType: "purchase",
      sourceId: p.id,
    });
    // Vendor credits (Phase 4): DR AP / CR Inventory — reduce what's owed and
    // hand the credited goods value back out of stock.
    for (const vc of (state.vendorCredits ?? []).filter((v) => v.purchaseId === p.id && v.amount > 0.005)) {
      entries.push({
        id: `vendorcredit:${vc.id}`,
        date: (vc.date || date).slice(0, 10),
        debitCode: COA.AP.code,
        creditCode: COA.INVENTORY.code,
        amount: vc.amount,
        description: `Vendor credit ${vc.number} — ${p.supplierName}${vc.reason ? ` (${vc.reason})` : ""}`,
        sourceType: "bill",
        sourceId: p.id,
      });
    }
    const discrete = (state.billPayments ?? []).filter((bp) => bp.purchaseId === p.id && bp.amount > 0.005);
    if (discrete.length > 0) {
      for (const bp of discrete) {
        entries.push({
          id: `billpay:${bp.id}`,
          date: (bp.date || date).slice(0, 10),
          debitCode: COA.AP.code,
          creditCode: COA.CASH.code,
          amount: bp.amount,
          description: `Payment — ${p.supplierName}`,
          sourceType: "payment",
          sourceId: p.id,
        });
      }
    } else {
      const paid = p.paymentStatus === "paid" ? amount : (p.amountPaid ?? 0);
      if (paid > 0.005) {
        entries.push({
          id: `billpaid:${p.id}`,
          date,
          debitCode: COA.AP.code,
          creditCode: COA.CASH.code,
          amount: paid,
          description: `Payment — ${p.supplierName}`,
          sourceType: "payment",
          sourceId: p.id,
        });
      }
    }
  }

  // ── 3. Expenses ──────────────────────────────────────────────────
  for (const e of state.expenses) {
    const date = (e.expenseDate || "").slice(0, 10);
    const amount = e.amount;
    if (amount <= 0) continue;
    const debitCode = e.source === "ADS_AUTO" ? COA.ADS.code : COA.OPERATING.code;
    entries.push({
      id: `expense:${e.id}`,
      date,
      debitCode,
      creditCode: COA.CASH.code,
      amount,
      description: `${e.category || "Expense"}${e.description ? ` — ${e.description}` : ""}`,
      sourceType: "expense",
      sourceId: e.id,
    });
  }

  // ── 4. QC damage write-offs ───────────────────────────────────────
  for (const q of state.returnsQueue) {
    if (q.qcStatus !== "DONE" || q.qcResult !== "DAMAGED") continue;
    const cogs = cogsOf(q.skuCode);
    if (cogs <= 0) continue;
    const date = ((q.receivedDate ?? q.createdAt) || "").slice(0, 10);
    entries.push({
      id: `qcwriteoff:${q.id}`,
      date,
      debitCode: COA.QC_WRITEOFF.code,
      creditCode: COA.INVENTORY.code,
      amount: cogs,
      description: `QC damage write-off ${q.subOrderNo} (${q.skuCode})`,
      sourceType: "adjustment",
      sourceId: q.id,
    });
  }

  // ── 5. Confirmed bank transactions ───────────────────────────────
  for (const t of (state.bankTxns ?? [])) {
    if (t.status !== "CATEGORIZED" || !t.coaCode) continue;
    const date = (t.txnDate || "").slice(0, 10);
    if (!date) continue;
    if (t.debit > 0) {
      // Money out: DR category account, CR Cash
      entries.push({
        id: `bank:${t.id}`,
        date,
        debitCode: t.coaCode,
        creditCode: COA.CASH.code,
        amount: t.debit,
        description: `${t.category ?? "Bank debit"} — ${t.description}`,
        sourceType: "bank_import",
        sourceId: t.id,
      });
    } else if (t.credit > 0) {
      // Money in: DR Cash, CR category account
      entries.push({
        id: `bank:${t.id}`,
        date,
        debitCode: COA.CASH.code,
        creditCode: t.coaCode,
        amount: t.credit,
        description: `${t.category ?? "Bank credit"} — ${t.description}`,
        sourceType: "bank_import",
        sourceId: t.id,
      });
    }
  }

  return entries;
}

// ── Cached GL derivation ──────────────────────────────────────────────

const glCache = new WeakMap<V2State, GlEntry[]>();

export function glEntries(state: V2State, now = new Date()): GlEntry[] {
  const cached = glCache.get(state);
  if (cached) return cached;
  const result = buildGlEntries(state, reconcileAll(state, now));
  glCache.set(state, result);
  return result;
}

export function trialBalanceReport(
  state: V2State,
  asOf?: string,
  now = new Date()
): TrialBalanceRow[] {
  return trialBalance(glEntries(state, now), asOf);
}

// ── Phase 1: P&L Report ───────────────────────────────────────────────

export interface PnlReport {
  from: string;
  to: string;
  view: "accrual" | "cash";
  orgName: string;

  income: {
    sales: number;
    exchangeIncome: number;
    claimsComp: number;
    lostComp: number;
    totalRevenue: number;
  };

  expenses: {
    cogs: number;
    returnLosses: number;
    platformFees: number;
    advertising: number;
    qcWriteoffs: number;
    operatingExpenses: number;
    totalExpenses: number;
  };

  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
  netMarginPct: number;

  recoverable: { tds: number; tcs: number };

  /** Source data for the full audit trail. */
  _summary: PayoutSummary;
}

export function pnlReport(
  state: V2State,
  filter: PnlFilter,
  now = new Date()
): PnlReport {
  const s = payoutSummary(state, filter, now);

  const totalRevenue = s.income.total;
  const grossProfit = totalRevenue - s.expenses.cogs;
  const totalExpenses =
    s.expenses.returnLosses +
    s.expenses.platformDeductions +
    s.expenses.ads +
    s.expenses.qcWriteOff +
    s.expenses.businessExpenses;

  return {
    from: filter.fromMonth ?? "",
    to: filter.toMonth ?? "",
    view: filter.view,
    orgName: state.org.name || "My Business",

    income: {
      sales: s.income.delivered,
      exchangeIncome: s.income.exchange,
      claimsComp: s.income.claim,
      lostComp: s.income.lostComp,
      totalRevenue,
    },

    expenses: {
      cogs: s.expenses.cogs,
      returnLosses: s.expenses.returnLosses,
      platformFees: s.expenses.platformDeductions,
      advertising: s.expenses.ads,
      qcWriteoffs: s.expenses.qcWriteOff,
      operatingExpenses: s.expenses.businessExpenses,
      totalExpenses,
    },

    grossProfit,
    operatingProfit: s.netProfit,
    netProfit: s.netProfit,
    netMarginPct: s.netMarginPct,
    recoverable: s.recoverable,
    _summary: s,
  };
}

// ── Phase 2: Balance Sheet ────────────────────────────────────────────

export interface BalanceSheetReport {
  asOf: string;
  orgName: string;

  assets: {
    cash: number;
    accountsReceivable: number;
    inventory: number;
    tdsReceivable: number;
    tcsReceivable: number;
    totalCurrentAssets: number;
    totalAssets: number;
  };

  liabilities: {
    accountsPayable: number;
    totalCurrentLiabilities: number;
    totalLiabilities: number;
  };

  equity: {
    retainedEarnings: number;
    totalEquity: number;
  };

  totalLiabilitiesAndEquity: number;
  balanced: boolean;
  imbalance: number;
  imbalanceNote: string;
}

export function balanceSheet(
  state: V2State,
  asOf: string,
  now = new Date()
): BalanceSheetReport {
  const entries = glEntries(state, now);
  const reconciled = reconcileAll(state, now);

  // Cash: net cash from all GL entries (settlements received − purchases paid − expenses paid)
  const cash = Math.max(0, naturalBalance(entries, COA.CASH, asOf));

  // AR: outstanding receivables from unmatched orders (money Meesho owes us)
  const openSett = openSettlements(reconciled, now);
  const accountsReceivable = Math.max(0, openSett.totalPending);

  // Inventory: GL INVENTORY account (purchases DR − COGS/write-offs CR).
  // More accurate than stockIntel when state.ledger (movement ledger) is sparse.
  const inventory = Math.max(0, naturalBalance(entries, COA.INVENTORY, asOf));

  // Tax receivables from GL
  const tdsReceivable = Math.max(0, naturalBalance(entries, COA.TDS_REC, asOf));
  const tcsReceivable = Math.max(0, naturalBalance(entries, COA.TCS_REC, asOf));

  const totalCurrentAssets = cash + accountsReceivable + inventory + tdsReceivable + tcsReceivable;
  const totalAssets = totalCurrentAssets;

  // AP: pending/partial purchase invoices
  const accountsPayable = Math.max(
    0,
    naturalBalance(entries, COA.AP, asOf)
  );
  const totalLiabilities = accountsPayable;

  // Retained Earnings: cumulative net profit (full history, no date filter)
  // Use the all-time payoutSummary with no month filter
  const months = orderMonths(state);
  const allTime: PnlFilter = {
    fromMonth: months[0],
    toMonth: months[months.length - 1],
    view: "accrual",
  };
  const retainedEarnings =
    months.length > 0 ? payoutSummary(state, allTime, now).netProfit : 0;
  const totalEquity = retainedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  const imbalance = Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100;
  const balanced = Math.abs(imbalance) < 1; // within ₹1 rounding tolerance

  return {
    asOf,
    orgName: state.org.name || "My Business",
    assets: {
      cash,
      accountsReceivable,
      inventory,
      tdsReceivable,
      tcsReceivable,
      totalCurrentAssets,
      totalAssets,
    },
    liabilities: {
      accountsPayable,
      totalCurrentLiabilities: totalLiabilities,
      totalLiabilities,
    },
    equity: {
      retainedEarnings,
      totalEquity,
    },
    totalLiabilitiesAndEquity,
    balanced,
    imbalance,
    imbalanceNote: balanced
      ? ""
      : "Imbalance typically reflects opening stock or owner equity not yet captured. Add opening inventory purchases to reconcile.",
  };
}

// ── Phase 3: Cash Flow Statement (Indirect Method) ────────────────────

export interface CashFlowReport {
  from: string;
  to: string;
  orgName: string;

  operating: {
    netProfit: number;
    addQcWriteoffs: number;
    arChange: number;     // negative = more cash tied up in receivables
    apChange: number;     // positive = suppliers financing us more
    total: number;
    note: string;
  };

  investing: {
    purchasePayments: number; // cash paid for inventory (negative = outflow)
    total: number;
  };

  financing: {
    total: number;
  };

  netCashChange: number;
}

export function cashFlowStatement(
  state: V2State,
  filter: PnlFilter,
  now = new Date()
): CashFlowReport {
  const s = payoutSummary(state, filter, now);
  const reconciled = reconcileAll(state, now);

  const netProfit = s.netProfit;
  const addQcWriteoffs = s.expenses.qcWriteOff; // non-cash: add back

  // AR change: current outstanding receivables (money earned but not yet received).
  // Treating period-start AR as 0 — see note in the report.
  const openSett = openSettlements(reconciled, now);
  const arChange = -(openSett.totalPending); // increase in AR = less cash

  // AP change: current pending purchase invoices.
  // Treating period-start AP as 0 — see note.
  const apChange = state.purchases
    .filter(
      (p) =>
        (p.paymentStatus === "pending" || p.paymentStatus === "partial") &&
        (p.invoiceDate || "").slice(0, 7) >= (filter.fromMonth ?? "") &&
        (p.invoiceDate || "").slice(0, 7) <= (filter.toMonth ?? "9999-99")
    )
    .reduce((sum, p) => sum + p.totalAmount, 0);

  const operatingTotal = netProfit + addQcWriteoffs + arChange + apChange;

  // Investing: cash paid for inventory purchases in period
  const purchasePayments = -state.purchases
    .filter(
      (p) =>
        p.paymentStatus === "paid" &&
        (p.invoiceDate || "").slice(0, 7) >= (filter.fromMonth ?? "") &&
        (p.invoiceDate || "").slice(0, 7) <= (filter.toMonth ?? "9999-99")
    )
    .reduce((sum, p) => sum + p.totalAmount, 0);

  return {
    from: filter.fromMonth ?? "",
    to: filter.toMonth ?? "",
    orgName: state.org.name || "My Business",
    operating: {
      netProfit,
      addQcWriteoffs,
      arChange,
      apChange,
      total: operatingTotal,
      note:
        "AR/AP changes treat period-start balances as zero. For precise working capital analysis, compare Balance Sheets at the start and end of the period.",
    },
    investing: {
      purchasePayments,
      total: purchasePayments,
    },
    financing: {
      total: 0,
    },
    netCashChange: operatingTotal + purchasePayments,
  };
}

// ── Convenience: months as options for the date range picker ──────────

export function reportMonthOptions(state: V2State): { value: string; label: string }[] {
  const months = orderMonths(state);
  return months.map((m) => {
    const [y, mo] = m.split("-");
    const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
    });
    return { value: m, label };
  });
}

export type { TrialBalanceRow };
