/**
 * Bank matching engine (Phase 5) — pure suggestion logic.
 *
 * Two match kinds, both keeping the ledger single-sourced:
 *  - Document match: a bank line ↔ an open invoice (credit) or bill (debit).
 *    Applying it records a receipt/bill-payment (the GL source) and EXCLUDES
 *    the bank line from the GL, so cash is posted exactly once.
 *  - Payout match: a bank DEPOSIT ↔ a Meesho payout batch (grouped by the
 *    settlement file's Transaction ID). The settlement already posted DR Cash
 *    at reconciliation time, so applying it only reconciles the deposit
 *    (marks it accounted-for) — it never re-books income.
 */
import { round2 } from "./journal";
import type { PaymentEvent } from "../engine";
import type { Invoice, Purchase, StoredBankTxn } from "../v2/types";

// ── Meesho payout batches ─────────────────────────────────────────────

export interface PayoutBatch {
  batchId: string;      // Transaction ID (one per payout batch)
  net: number;          // sum of finalSettlement across the batch
  count: number;        // settlement lines in the batch
  monthBucket: string;  // latest month the batch appears in
}

/** Net payout per settlement batch (Transaction ID). Positive net = a deposit. */
export function payoutBatches(events: PaymentEvent[]): PayoutBatch[] {
  const by = new Map<string, PayoutBatch>();
  for (const e of events) {
    const id = (e.transactionId ?? "").trim();
    if (!id) continue;
    const b = by.get(id) ?? { batchId: id, net: 0, count: 0, monthBucket: e.monthBucket };
    b.net = round2(b.net + (e.finalSettlement || 0));
    b.count += 1;
    if (e.monthBucket > b.monthBucket) b.monthBucket = e.monthBucket;
    by.set(id, b);
  }
  return [...by.values()];
}

export interface PayoutSuggestion {
  txnId: string;
  batchId: string;
  deposit: number;
  batchNet: number;
  diff: number;     // deposit − batchNet (signed)
}

/** True when |deposit − net| is within tolerance (₹ floor OR fraction of net). */
export function amountsMatch(a: number, b: number, absTol = 1, relTol = 0.01): boolean {
  const diff = Math.abs(round2(a - b));
  return diff <= Math.max(absTol, Math.abs(b) * relTol);
}

/**
 * For each unmatched incoming bank credit, suggest the closest positive-net
 * payout batch within tolerance. Each batch is offered to at most one deposit
 * (greedy by best fit), so two deposits can't both claim one payout.
 */
export function suggestPayoutMatches(
  deposits: StoredBankTxn[],
  batches: PayoutBatch[],
): PayoutSuggestion[] {
  const pool = batches.filter((b) => b.net > 0.005).map((b) => ({ ...b }));
  const used = new Set<string>();
  const out: PayoutSuggestion[] = [];
  // best (smallest diff) pairings first
  const candidates: PayoutSuggestion[] = [];
  for (const t of deposits) {
    if (t.credit <= 0) continue;
    for (const b of pool) {
      if (!amountsMatch(t.credit, b.net)) continue;
      candidates.push({ txnId: t.id, batchId: b.batchId, deposit: t.credit, batchNet: b.net, diff: round2(t.credit - b.net) });
    }
  }
  candidates.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  const claimedTxns = new Set<string>();
  for (const c of candidates) {
    if (used.has(c.batchId) || claimedTxns.has(c.txnId)) continue;
    used.add(c.batchId);
    claimedTxns.add(c.txnId);
    out.push(c);
  }
  return out;
}

// ── Document matches (invoice / bill) ─────────────────────────────────

export interface DocSuggestion {
  txnId: string;
  kind: "invoice" | "bill";
  docId: string;
  docNumber: string;
  amount: number;      // the bank line amount
  outstanding: number; // doc outstanding
  exact: boolean;      // amount === outstanding
}

function invoiceOutstanding(i: Invoice): number {
  return round2(i.amount - (i.amountPaid ?? 0) - (i.amountCredited ?? 0));
}
function billOutstanding(p: Purchase): number {
  return round2(p.totalAmount - (p.amountPaid ?? 0) - (p.amountCredited ?? 0));
}

/**
 * Suggest document matches for unmatched bank lines: credits → open invoices,
 * debits → open bills, by amount (within tolerance), best-fit first.
 */
export function suggestDocMatches(
  txns: StoredBankTxn[],
  invoices: Invoice[],
  purchases: Purchase[],
): DocSuggestion[] {
  const out: DocSuggestion[] = [];
  const openInvoices = invoices.filter((i) => i.status !== "paid" && invoiceOutstanding(i) > 0.005);
  const openBills = purchases.filter((p) => p.paymentStatus !== "paid" && billOutstanding(p) > 0.005);

  for (const t of txns) {
    if (t.credit > 0) {
      const best = openInvoices
        .map((i) => ({ i, o: invoiceOutstanding(i) }))
        .filter((x) => amountsMatch(t.credit, x.o))
        .sort((a, b) => Math.abs(t.credit - a.o) - Math.abs(t.credit - b.o))[0];
      if (best) out.push({ txnId: t.id, kind: "invoice", docId: best.i.id, docNumber: best.i.number || best.i.id, amount: t.credit, outstanding: best.o, exact: Math.abs(t.credit - best.o) < 0.005 });
    } else if (t.debit > 0) {
      const best = openBills
        .map((p) => ({ p, o: billOutstanding(p) }))
        .filter((x) => amountsMatch(t.debit, x.o))
        .sort((a, b) => Math.abs(t.debit - a.o) - Math.abs(t.debit - b.o))[0];
      if (best) out.push({ txnId: t.id, kind: "bill", docId: best.p.id, docNumber: best.p.invoiceNo || best.p.id, amount: t.debit, outstanding: best.o, exact: Math.abs(t.debit - best.o) < 0.005 });
    }
  }
  return out;
}

// ── Closing-balance reconciliation ────────────────────────────────────

export interface BankBalanceSummary {
  statementBalance: number;  // opening + Σ(credits − debits) across imported lines
  clearedCount: number;
  unclearedCount: number;
}

/**
 * Statement running balance = opening balance + net of every imported line.
 * "Cleared" here = a line that has been categorized/matched/excluded (i.e.
 * dealt with), leaving unclearedCount as the reconciliation to-do count.
 */
export function bankBalanceSummary(txns: StoredBankTxn[], openingBalance = 0): BankBalanceSummary {
  let bal = round2(openingBalance);
  let cleared = 0;
  for (const t of txns) {
    bal = round2(bal + (t.credit || 0) - (t.debit || 0));
    if (t.status !== "PENDING") cleared += 1;
  }
  return { statementBalance: bal, clearedCount: cleared, unclearedCount: txns.length - cleared };
}
