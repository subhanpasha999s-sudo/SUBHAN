/**
 * Core double-entry primitives (Phase 1).
 *
 * Pure, DB-independent logic shared by:
 *   - the Postgres balanced-entry trigger (migration 018) — same invariant
 *   - the server-side postJournal() service (persists to journal_entries/_lines)
 *   - the porter that turns derived GlEntry[] into stored journal entries
 *
 * The one rule everything upholds: **every entry balances** (Σ debit = Σ credit),
 * and each line moves exactly one side.
 */
import type { GlEntry } from "../engine/accounting";

/** Mirrors the Postgres `gl_source_type` enum in migration 018. */
export type JournalSourceType =
  | "order_settlement" | "purchase" | "expense" | "cogs" | "adjustment"
  | "bank_import" | "invoice" | "bill" | "payment" | "manual" | "opening_balance";

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  memo?: string;
}

export interface JournalEntryInput {
  entryDate: string;            // YYYY-MM-DD
  memo?: string;
  sourceType: JournalSourceType;
  sourceId?: string;
  /** Stable idempotency key — re-posting the same externalId is a no-op upsert. */
  externalId?: string;
  lines: JournalLineInput[];
}

/** Amounts are money to 2 dp; anything under half a paisa is rounding noise. */
export const MONEY_EPSILON = 0.005;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineTotals(lines: JournalLineInput[]): { debit: number; credit: number } {
  let debit = 0, credit = 0;
  for (const l of lines) { debit += l.debit ?? 0; credit += l.credit ?? 0; }
  return { debit: round2(debit), credit: round2(credit) };
}

export function isBalanced(lines: JournalLineInput[], epsilon = MONEY_EPSILON): boolean {
  const { debit, credit } = lineTotals(lines);
  return Math.abs(debit - credit) < epsilon;
}

export class UnbalancedEntryError extends Error {}
export class InvalidLineError extends Error {}

/**
 * Validate an entry the way the DB will. Throws on any violation so callers
 * never persist a malformed entry. Returns the normalized (rounded) lines.
 */
export function assertValidEntry(entry: JournalEntryInput): JournalLineInput[] {
  if (!entry.lines || entry.lines.length < 2) {
    throw new InvalidLineError("a journal entry needs at least two lines");
  }
  const normalized = entry.lines.map((l) => {
    const debit = round2(l.debit ?? 0);
    const credit = round2(l.credit ?? 0);
    if (debit < 0 || credit < 0) {
      throw new InvalidLineError(`negative amount on ${l.accountCode}`);
    }
    // exactly one side non-zero (matches the DB CHECK (debit=0) <> (credit=0))
    if ((debit === 0) === (credit === 0)) {
      throw new InvalidLineError(`line ${l.accountCode} must have exactly one of debit/credit`);
    }
    if (!l.accountCode) throw new InvalidLineError("line missing accountCode");
    return { ...l, debit, credit };
  });
  if (!isBalanced(normalized)) {
    const { debit, credit } = lineTotals(normalized);
    throw new UnbalancedEntryError(`entry unbalanced: debit ${debit} <> credit ${credit}`);
  }
  return normalized;
}

/**
 * Build the reversing entry for a posted entry: swap debit and credit on every
 * line. The reversal is itself balanced by construction.
 */
export function reverseEntry(
  entry: JournalEntryInput,
  opts: { entryDate?: string; memo?: string } = {},
): JournalEntryInput {
  return {
    entryDate: opts.entryDate ?? entry.entryDate,
    memo: opts.memo ?? `Reversal — ${entry.memo ?? entry.sourceId ?? entry.sourceType}`,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    externalId: entry.externalId ? `reverse:${entry.externalId}` : undefined,
    lines: entry.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.credit ?? 0,
      credit: l.debit ?? 0,
      memo: l.memo,
    })),
  };
}

/**
 * Bridge for the strangler-fig port: a derived GlEntry (single debit/credit
 * account + positive amount) becomes a balanced two-line journal entry. The
 * GlEntry.id is reused as the idempotency key so re-porting is a safe upsert.
 */
export function glEntryToJournal(gl: GlEntry): JournalEntryInput {
  const amount = round2(Math.abs(gl.amount));
  return {
    entryDate: gl.date,
    memo: gl.description,
    sourceType: gl.sourceType as JournalSourceType,
    sourceId: gl.sourceId,
    externalId: `gl:${gl.id}`,
    lines: [
      { accountCode: gl.debitCode, debit: amount },
      { accountCode: gl.creditCode, credit: amount },
    ],
  };
}

/**
 * Global integrity invariant: across ALL entries, total debits equal total
 * credits (the whole ledger nets to zero). Used as a CI guardrail.
 */
export function ledgerNetsToZero(entries: JournalEntryInput[], epsilon = MONEY_EPSILON): boolean {
  let debit = 0, credit = 0;
  for (const e of entries) {
    const t = lineTotals(e.lines);
    debit += t.debit; credit += t.credit;
  }
  return Math.abs(round2(debit) - round2(credit)) < epsilon;
}
