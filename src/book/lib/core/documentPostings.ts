/**
 * Bridge V2State documents → ledger postings + aging (Phases 3–4).
 *
 * The derived GL (buildGlEntries) already posts e-commerce settlements,
 * purchases (AP), expenses and bank imports. What it does NOT yet post is
 * sales-side AR (invoices). collectDocumentPostings fills that gap so the
 * stored ledger is complete; AR/AP aging read straight from state.
 */
import type { V2State } from "../v2/types";
import { creditNotePosting, invoicePosting, receiptPosting } from "./postings";
import { aging, type AgingRow } from "./aging";
import type { JournalEntryInput } from "./journal";

/**
 * Postings for documents not covered by the derived GL: invoices (AR),
 * receipts, and credit notes. Together with the derived-GL port this is the
 * complete back-fill — running the Ledger "Sync from activity" posts every
 * financial event in the org's history, idempotently.
 */
export function collectDocumentPostings(state: V2State): JournalEntryInput[] {
  const out: JournalEntryInput[] = [];
  for (const inv of state.invoices) {
    if (inv.amount > 0.005) {
      out.push(invoicePosting({ id: inv.id, date: inv.invoiceDate, total: inv.amount, number: inv.number }));
    }
  }
  for (const r of state.receipts ?? []) {
    if (r.amount > 0.005) {
      out.push(receiptPosting({ id: r.id, date: r.date, amount: r.amount, reference: r.reference }));
    }
  }
  for (const cn of state.creditNotes ?? []) {
    if (cn.amount > 0.005) {
      out.push(creditNotePosting({ id: cn.id, date: cn.date, amount: cn.amount, reason: cn.reason }));
    }
  }
  return out;
}

/** Receivables aging — outstanding = invoice amount − paid − credited. */
export function arAgingFromState(state: V2State, asOf: string): AgingRow[] {
  return aging(
    state.invoices.map((i) => ({
      dueDate: i.dueDate || i.invoiceDate,
      outstanding: i.amount - (i.amountPaid ?? 0) - (i.amountCredited ?? 0),
    })),
    asOf,
  );
}

/** Payables aging — outstanding = bill total − paid − vendor credits. */
export function apAgingFromState(state: V2State, asOf: string): AgingRow[] {
  return aging(
    state.purchases.map((p) => ({
      dueDate: p.dueDate || p.invoiceDate,
      outstanding: p.paymentStatus === "paid"
        ? 0
        : p.totalAmount - (p.amountPaid ?? 0) - (p.amountCredited ?? 0),
    })),
    asOf,
  );
}
