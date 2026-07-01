/**
 * Trial balance computed from the STORED-ledger shape (journal entries/lines),
 * producing the exact same TrialBalanceRow[] the current derived report emits.
 *
 * This is the parity bridge for Phase 1's exit criterion: the trial balance read
 * from posted journal entries must match `engine/accounting.ts trialBalance()`
 * fed the derived GlEntry[]. Because `glEntryToJournal` only splits one GlEntry
 * into a debit line + a credit line of equal amount, the two are equal by
 * construction — the parity test locks that in.
 */
import { COA_LIST, type CoaAccount, type TrialBalanceRow } from "../engine/accounting";
import { round2, type JournalEntryInput } from "./journal";

export function trialBalanceFromJournal(
  entries: JournalEntryInput[],
  asOf?: string,
  accounts: CoaAccount[] = COA_LIST,
): TrialBalanceRow[] {
  const byCode = new Map<string, { dr: number; cr: number }>();
  for (const e of entries) {
    if (asOf && e.entryDate > asOf) continue;
    for (const l of e.lines) {
      const a = byCode.get(l.accountCode) ?? { dr: 0, cr: 0 };
      a.dr += l.debit ?? 0;
      a.cr += l.credit ?? 0;
      byCode.set(l.accountCode, a);
    }
  }
  return accounts.map((account) => {
    const a = byCode.get(account.code) ?? { dr: 0, cr: 0 };
    const debit = round2(a.dr);
    const credit = round2(a.cr);
    return {
      account,
      debit,
      credit,
      balance: account.creditNormal ? round2(credit - debit) : round2(debit - credit),
    };
  });
}

/** A trial balance is valid only if total debits equal total credits. */
export function trialBalanceBalances(rows: TrialBalanceRow[], epsilon = 0.005): boolean {
  let dr = 0, cr = 0;
  for (const r of rows) { dr += r.debit; cr += r.credit; }
  return Math.abs(round2(dr) - round2(cr)) < epsilon;
}
