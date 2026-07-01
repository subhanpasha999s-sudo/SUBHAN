/**
 * Bridge V2State documents → ledger postings + aging (Phases 3–4).
 *
 * The derived GL (buildGlEntries) already posts e-commerce settlements,
 * purchases (AP), expenses and bank imports. What it does NOT yet post is
 * sales-side AR (invoices). collectDocumentPostings fills that gap so the
 * stored ledger is complete; AR/AP aging read straight from state.
 */
import type { V2State } from "../v2/types";
import { invoicePosting } from "./postings";
import { aging, type AgingRow } from "./aging";
import type { JournalEntryInput } from "./journal";

/** Postings for documents not covered by the derived GL (currently: invoices). */
export function collectDocumentPostings(state: V2State): JournalEntryInput[] {
  const out: JournalEntryInput[] = [];
  for (const inv of state.invoices) {
    if (inv.amount > 0.005) {
      out.push(invoicePosting({ id: inv.id, date: inv.invoiceDate, total: inv.amount, number: inv.number }));
    }
  }
  return out;
}

/** Receivables aging — outstanding = invoice amount − amount paid. */
export function arAgingFromState(state: V2State, asOf: string): AgingRow[] {
  return aging(
    state.invoices.map((i) => ({ dueDate: i.dueDate || i.invoiceDate, outstanding: i.amount - (i.amountPaid ?? 0) })),
    asOf,
  );
}

/** Payables aging — outstanding = bill total − amount paid (paid bills excluded). */
export function apAgingFromState(state: V2State, asOf: string): AgingRow[] {
  return aging(
    state.purchases.map((p) => ({
      dueDate: p.dueDate || p.invoiceDate,
      outstanding: p.paymentStatus === "paid" ? 0 : p.totalAmount - (p.amountPaid ?? 0),
    })),
    asOf,
  );
}
