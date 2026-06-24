/**
 * EXPENSE ENGINE (spec Part 6): ads auto-expense, bank-import helpers
 * (duplicate detection + smart category suggestions), true net profit.
 */
import { AdsRow } from "./types";
import { totalAdsSpend } from "./pnl";

export interface ExpenseRecord {
  expenseDate: string; // ISO date
  category: string;
  description: string;
  amount: number;
  gstAmount: number;
  paymentMode: string;
  source: "MANUAL" | "BANK_IMPORT" | "ADS_AUTO";
  /** Idempotency for ADS_AUTO: one per org+month. */
  sourceKey: string | null;
  bankRef?: string | null;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Purchases", "Packaging", "Courier", "Salaries", "Rent", "Software",
  "Ads (non-marketplace)", "Transport", "Utilities", "Misc",
];

/**
 * Ads Cost sheet → one ADS_AUTO expense per month. Re-uploads are keyed on
 * month + source, so they update-in-place rather than double-count.
 */
export function adsAutoExpense(
  adsRows: AdsRow[],
  monthBucket: string
): ExpenseRecord | null {
  const spend = totalAdsSpend(adsRows);
  if (spend <= 0) return null;
  // marketplace ads GST: Total Ads Cost is GST-inclusive at 18%
  const taxable = spend / 1.18;
  return {
    expenseDate: `${monthBucket}-28`,
    category: "Marketplace Ads",
    description: `Meesho ads spend ${monthBucket} (auto from payment file)`,
    amount: Math.round(spend * 100) / 100,
    gstAmount: Math.round((spend - taxable) * 100) / 100,
    paymentMode: "marketplace deduction",
    source: "ADS_AUTO",
    sourceKey: `ads:${monthBucket}`,
  };
}

// ── Bank import helpers ─────────────────────────────────────────────

export interface BankTxn {
  txnDate: string;
  description: string;
  debit: number;
  credit: number;
}

export interface ColumnMapping {
  date: number;
  description: number;
  debit: number;
  credit: number; // may equal debit column for signed single-amount formats
}

/** Apply a saved per-bank column mapping to raw statement rows. */
export function mapBankRows(
  rows: unknown[][],
  mapping: ColumnMapping,
  hasHeader = true
): BankTxn[] {
  const out: BankTxn[] = [];
  const num = (v: unknown) => {
    const n = parseFloat(String(v ?? "").replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => String(c ?? "").trim() === "")) continue;
    const date = String(r[mapping.date] ?? "").trim();
    if (!date) continue;
    let debit = num(r[mapping.debit]);
    let credit = num(r[mapping.credit]);
    if (mapping.debit === mapping.credit) {
      // single signed column: negative = debit
      const amt = debit;
      debit = amt < 0 ? -amt : 0;
      credit = amt > 0 ? amt : 0;
    }
    out.push({
      txnDate: date,
      description: String(r[mapping.description] ?? "").trim(),
      debit: Math.abs(debit),
      credit: Math.abs(credit),
    });
  }
  return out;
}

/** Duplicate detection: same date + amount + description. */
export function findDuplicateTxns(
  existing: BankTxn[],
  incoming: BankTxn[]
): { fresh: BankTxn[]; duplicates: BankTxn[] } {
  const key = (t: BankTxn) =>
    `${t.txnDate}|${t.debit.toFixed(2)}|${t.credit.toFixed(2)}|${t.description.toLowerCase().trim()}`;
  const seen = new Set(existing.map(key));
  const fresh: BankTxn[] = [];
  const duplicates: BankTxn[] = [];
  for (const t of incoming) {
    if (seen.has(key(t))) duplicates.push(t);
    else { seen.add(key(t)); fresh.push(t); }
  }
  return { fresh, duplicates };
}

/** Same normalization used for learning patterns and matching descriptions. */
function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0-9]/g, "")
    .replace(/[^a-z@\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Smart suggestions: learned description-fragment → category hints.
 * Longest matching pattern wins (most specific).
 */
export function suggestCategory(
  description: string,
  hints: { pattern: string; category: string }[]
): string | null {
  const d = normalizeDescription(description);
  let best: { pattern: string; category: string } | null = null;
  for (const h of hints) {
    if (d.includes(normalizeDescription(h.pattern))) {
      if (!best || h.pattern.length > best.pattern.length) best = h;
    }
  }
  return best?.category ?? null;
}

/** Learn a hint from a user categorization (normalized fragment). */
export function hintFromCategorization(
  description: string,
  category: string
): { pattern: string; category: string } {
  // strip txn ids / numbers so the pattern generalizes
  const pattern = normalizeDescription(description).slice(0, 40);
  return { pattern: pattern || description.toLowerCase().slice(0, 40), category };
}

// ── True net profit (spec Part 6 bottom line) ───────────────────────

export function trueNetProfit(
  marketplaceNetProfit: number,
  expenses: ExpenseRecord[],
  opts: { excludeAdsAuto?: boolean } = {}
): { businessExpenses: number; trueNet: number } {
  // ADS_AUTO is already inside marketplace P&L (Total Ads Cost line) —
  // exclude it here by default to avoid double counting.
  const exclude = opts.excludeAdsAuto ?? true;
  const businessExpenses = expenses
    .filter((e) => !(exclude && e.source === "ADS_AUTO"))
    .reduce((s, e) => s + e.amount, 0);
  return {
    businessExpenses: Math.round(businessExpenses * 100) / 100,
    trueNet: Math.round((marketplaceNetProfit - businessExpenses) * 100) / 100,
  };
}
