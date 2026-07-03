/**
 * General Ledger / Account Transactions (Phase 6) — pure drill-down over the
 * COMPLETE ledger. The stored ledger holds both the derived GL (orders,
 * purchases, expenses, bank) and document postings (invoices, receipts, credit
 * notes), so the GL view flattens both into per-account postings, then reports
 * opening/closing and a running balance in the account's natural sign.
 */
import { COA_LIST, type CoaAccount, type GlEntry } from "../engine/accounting";
import { round2, type JournalEntryInput } from "./journal";

/** One side of one entry hitting one account. */
export interface LedgerPosting {
  id: string;
  date: string;
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
  sourceType: string;
  sourceId: string;
}

/** A derived GlEntry (single debit + single credit account) → two postings. */
export function postingsFromGl(entries: GlEntry[]): LedgerPosting[] {
  const out: LedgerPosting[] = [];
  for (const e of entries) {
    const amt = round2(e.amount);
    out.push({ id: `${e.id}:d`, date: e.date, accountCode: e.debitCode, debit: amt, credit: 0, description: e.description, sourceType: e.sourceType, sourceId: e.sourceId });
    out.push({ id: `${e.id}:c`, date: e.date, accountCode: e.creditCode, debit: 0, credit: amt, description: e.description, sourceType: e.sourceType, sourceId: e.sourceId });
  }
  return out;
}

/** Document postings (n balanced lines) → one posting per line. */
export function postingsFromJournal(entries: JournalEntryInput[]): LedgerPosting[] {
  const out: LedgerPosting[] = [];
  for (const e of entries) {
    e.lines.forEach((l, i) => {
      out.push({
        id: `${e.externalId ?? e.sourceId ?? "je"}:${i}`,
        date: e.entryDate, accountCode: l.accountCode,
        debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0),
        description: e.memo ?? "", sourceType: e.sourceType, sourceId: e.sourceId ?? "",
      });
    });
  }
  return out;
}

function accountByCode(code: string): CoaAccount | undefined {
  return COA_LIST.find((a) => a.code === code);
}
function naturalDelta(account: CoaAccount, debit: number, credit: number): number {
  return account.creditNormal ? credit - debit : debit - credit;
}

export interface LedgerRow extends LedgerPosting { balance: number }

export interface AccountLedger {
  account: CoaAccount;
  opening: number;
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

export function accountLedger(
  postings: LedgerPosting[],
  accountCode: string,
  range: { from?: string; to?: string } = {},
): AccountLedger | null {
  const account = accountByCode(accountCode);
  if (!account) return null;
  const { from, to } = range;

  const touches = postings
    .filter((p) => p.accountCode === accountCode)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

  let opening = 0;
  for (const t of touches) {
    if (from && t.date < from) opening = round2(opening + naturalDelta(account, t.debit, t.credit));
  }

  let balance = opening, totalDebit = 0, totalCredit = 0;
  const rows: LedgerRow[] = [];
  for (const t of touches) {
    if (from && t.date < from) continue;
    if (to && t.date > to) continue;
    balance = round2(balance + naturalDelta(account, t.debit, t.credit));
    totalDebit = round2(totalDebit + t.debit);
    totalCredit = round2(totalCredit + t.credit);
    rows.push({ ...t, balance });
  }
  return { account, opening, rows, totalDebit, totalCredit, closing: balance };
}

export function activeAccountCodes(postings: LedgerPosting[]): Set<string> {
  const s = new Set<string>();
  for (const p of postings) s.add(p.accountCode);
  return s;
}

export interface AccountMovement {
  account: CoaAccount;
  a: number;
  b: number;
  delta: number;
}

export function compareAccountMovements(
  postings: LedgerPosting[],
  rangeA: { from?: string; to?: string },
  rangeB: { from?: string; to?: string },
): AccountMovement[] {
  const net = (r: { from?: string; to?: string }, account: CoaAccount) => {
    let v = 0;
    for (const p of postings) {
      if (p.accountCode !== account.code) continue;
      if (r.from && p.date < r.from) continue;
      if (r.to && p.date > r.to) continue;
      v = round2(v + naturalDelta(account, p.debit, p.credit));
    }
    return v;
  };
  return COA_LIST
    .map((account) => {
      const a = net(rangeA, account), b = net(rangeB, account);
      return { account, a, b, delta: round2(a - b) };
    })
    .filter((m) => Math.abs(m.a) > 0.005 || Math.abs(m.b) > 0.005);
}
