/**
 * Domain posting rules (Phases 3–6).
 *
 * Pure functions that turn a business document into a balanced JournalEntryInput
 * so it can post into the stored ledger via post_journal_entry. This is the
 * "everything posts to the ledger" spine: sales/AR (3), purchases/AP (4),
 * inventory (5), banking (6). Documents keep living in V2State; only their
 * accounting effect is posted here (strangler-fig). Every builder is idempotent
 * via a stable externalId and balances by construction.
 *
 * GST note: amounts are posted tax-inclusive to Sales/AP for now, matching the
 * existing e-commerce GL. Splitting output/input GST into 2100/1xxx is deferred
 * to Phase 7 (the GST engine).
 */
import { COA } from "../engine/accounting";
import { round2, type JournalEntryInput } from "./journal";

// ── Phase 3 — Sales & Receivables ─────────────────────────────────────
export interface InvoiceDoc { id: string; date: string; total: number; number?: string; customerName?: string }
export interface ReceiptDoc { id: string; date: string; amount: number; reference?: string }
export interface CreditNoteDoc { id: string; date: string; amount: number; reason?: string }

/** Invoice raised: DR Accounts Receivable, CR Sales Revenue. */
export function invoicePosting(inv: InvoiceDoc): JournalEntryInput {
  const amount = round2(inv.total);
  return {
    entryDate: inv.date, sourceType: "invoice", sourceId: inv.id,
    externalId: `invoice:${inv.id}`,
    memo: `Invoice ${inv.number ?? inv.id}${inv.customerName ? ` — ${inv.customerName}` : ""}`,
    lines: [
      { accountCode: COA.AR.code, debit: amount },
      { accountCode: COA.SALES.code, credit: amount },
    ],
  };
}

/** Payment received against invoices: DR Cash, CR Accounts Receivable. */
export function receiptPosting(r: ReceiptDoc): JournalEntryInput {
  const amount = round2(r.amount);
  return {
    entryDate: r.date, sourceType: "payment", sourceId: r.id,
    externalId: `receipt:${r.id}`,
    memo: `Receipt${r.reference ? ` ${r.reference}` : ""}`,
    lines: [
      { accountCode: COA.CASH.code, debit: amount },
      { accountCode: COA.AR.code, credit: amount },
    ],
  };
}

/** Credit note / sales refund: DR Sales Revenue, CR Accounts Receivable. */
export function creditNotePosting(cn: CreditNoteDoc): JournalEntryInput {
  const amount = round2(cn.amount);
  return {
    entryDate: cn.date, sourceType: "invoice", sourceId: cn.id,
    externalId: `creditnote:${cn.id}`,
    memo: `Credit note${cn.reason ? ` — ${cn.reason}` : ""}`,
    lines: [
      { accountCode: COA.SALES.code, debit: amount },
      { accountCode: COA.AR.code, credit: amount },
    ],
  };
}

// ── Phase 4 — Purchases & Payables ────────────────────────────────────
export interface BillDoc { id: string; date: string; total: number; toInventory?: boolean; supplierName?: string }
export interface BillPaymentDoc { id: string; date: string; amount: number; reference?: string }
export interface VendorCreditDoc { id: string; date: string; amount: number; toInventory?: boolean }

/** Bill received (unpaid): DR Inventory or Operating Expense, CR Accounts Payable. */
export function billPosting(b: BillDoc): JournalEntryInput {
  const amount = round2(b.total);
  const debit = b.toInventory === false ? COA.OPERATING.code : COA.INVENTORY.code;
  return {
    entryDate: b.date, sourceType: "bill", sourceId: b.id,
    externalId: `bill:${b.id}`,
    memo: `Bill${b.supplierName ? ` — ${b.supplierName}` : ""}`,
    lines: [
      { accountCode: debit, debit: amount },
      { accountCode: COA.AP.code, credit: amount },
    ],
  };
}

/** Payment made to a vendor: DR Accounts Payable, CR Cash. */
export function billPaymentPosting(p: BillPaymentDoc): JournalEntryInput {
  const amount = round2(p.amount);
  return {
    entryDate: p.date, sourceType: "payment", sourceId: p.id,
    externalId: `billpay:${p.id}`,
    memo: `Vendor payment${p.reference ? ` ${p.reference}` : ""}`,
    lines: [
      { accountCode: COA.AP.code, debit: amount },
      { accountCode: COA.CASH.code, credit: amount },
    ],
  };
}

/** Vendor credit note: DR Accounts Payable, CR Inventory/Expense. */
export function vendorCreditPosting(vc: VendorCreditDoc): JournalEntryInput {
  const amount = round2(vc.amount);
  const credit = vc.toInventory === false ? COA.OPERATING.code : COA.INVENTORY.code;
  return {
    entryDate: vc.date, sourceType: "bill", sourceId: vc.id,
    externalId: `vendorcredit:${vc.id}`,
    memo: "Vendor credit",
    lines: [
      { accountCode: COA.AP.code, debit: amount },
      { accountCode: credit, credit: amount },
    ],
  };
}

// ── Phase 5 — Inventory ───────────────────────────────────────────────
export interface StockAdjustmentDoc { id: string; date: string; value: number; direction: "increase" | "decrease"; reason?: string }

/**
 * Stock adjustment by value. Increase: DR Inventory, CR Operating (found stock /
 * correction). Decrease/write-off: DR QC Write-off, CR Inventory.
 */
export function stockAdjustmentPosting(a: StockAdjustmentDoc): JournalEntryInput {
  const amount = round2(Math.abs(a.value));
  const lines = a.direction === "increase"
    ? [{ accountCode: COA.INVENTORY.code, debit: amount }, { accountCode: COA.OPERATING.code, credit: amount }]
    : [{ accountCode: COA.QC_WRITEOFF.code, debit: amount }, { accountCode: COA.INVENTORY.code, credit: amount }];
  return {
    entryDate: a.date, sourceType: "adjustment", sourceId: a.id,
    externalId: `stockadj:${a.id}`,
    memo: `Stock ${a.direction}${a.reason ? ` — ${a.reason}` : ""}`,
    lines,
  };
}

// ── Phase 1 (upgrade spec) — Opening balances ─────────────────────────
export interface OpeningBalanceLine {
  accountCode: string;
  amount: number;
  side: "debit" | "credit";
}

export class EmptyOpeningBalanceError extends Error {}

/**
 * Opening-balances wizard entry: one balanced journal entry dated at the start
 * of books. The user enters each account's balance on its natural side; the
 * difference is plugged to Owner Equity (3100) so the entry always balances —
 * the standard opening-equity treatment. Idempotent via a fixed externalId
 * (re-running the wizard is a no-op; corrections go through reversal).
 */
export function openingBalanceEntry(
  lines: OpeningBalanceLine[],
  entryDate: string,
  equityCode: string = COA.OWNER_EQUITY.code,
): JournalEntryInput {
  const real = lines
    .map((l) => ({ ...l, amount: round2(l.amount) }))
    .filter((l) => l.amount > 0 && l.accountCode && l.accountCode !== equityCode);
  if (real.length === 0) throw new EmptyOpeningBalanceError("enter at least one opening balance");

  const debit = round2(real.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0));
  const credit = round2(real.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0));
  const plug = round2(debit - credit); // >0 ⇒ equity credit balances it; <0 ⇒ equity debit

  const entryLines = real.map((l) => ({
    accountCode: l.accountCode,
    debit: l.side === "debit" ? l.amount : 0,
    credit: l.side === "credit" ? l.amount : 0,
  }));
  if (Math.abs(plug) >= 0.005) {
    entryLines.push({
      accountCode: equityCode,
      debit: plug < 0 ? -plug : 0,
      credit: plug > 0 ? plug : 0,
    });
  }
  return {
    entryDate,
    memo: "Opening balances",
    sourceType: "opening_balance",
    externalId: "opening-balance",
    lines: entryLines,
  };
}

// ── Phase 6 — Banking ─────────────────────────────────────────────────
export interface BankTxnDoc {
  id: string; date: string; debit: number; credit: number;
  /** the non-cash COA account this categorises to */
  coaCode: string; description?: string;
}

/**
 * A categorised bank line. Money IN (credit column): DR Cash, CR category.
 * Money OUT (debit column): DR category, CR Cash. (Cash here = the bank account.)
 */
export function bankTxnPosting(t: BankTxnDoc): JournalEntryInput {
  const inflow = round2(t.credit);
  const outflow = round2(t.debit);
  const amount = inflow > 0 ? inflow : outflow;
  const lines = inflow > 0
    ? [{ accountCode: COA.CASH.code, debit: amount }, { accountCode: t.coaCode, credit: amount }]
    : [{ accountCode: t.coaCode, debit: amount }, { accountCode: COA.CASH.code, credit: amount }];
  return {
    entryDate: t.date, sourceType: "bank_import", sourceId: t.id,
    externalId: `bank:${t.id}`,
    memo: t.description ?? "Bank transaction",
    lines,
  };
}
