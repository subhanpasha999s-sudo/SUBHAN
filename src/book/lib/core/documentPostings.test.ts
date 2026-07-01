import { describe, it, expect } from "vitest";
import { buildEmptyState } from "@/book/lib/v2/emptyState";
import type { V2State } from "@/book/lib/v2/types";
import { collectDocumentPostings, arAgingFromState, apAgingFromState } from "./documentPostings";
import { assertValidEntry } from "./journal";
import { agingTotal } from "./aging";

function state(): V2State {
  const s = buildEmptyState();
  s.invoices = [
    { id: "INV1", customerId: "C1", number: "INV-1", amount: 1000, amountPaid: 400, invoiceDate: "2026-06-01", dueDate: "2026-06-15", status: "partial" },
    { id: "INV2", customerId: "C1", number: "INV-2", amount: 500, amountPaid: 0, invoiceDate: "2026-07-01", dueDate: "2026-07-31", status: "open" },
  ];
  s.purchases = [
    { id: "P1", supplierName: "Acme", invoiceNo: "B1", invoiceDate: "2026-05-01", dueDate: "2026-05-31", totalAmount: 3000, gstAmount: 0, paymentStatus: "pending", notes: "", items: [] },
    { id: "P2", supplierName: "Beta", invoiceNo: "B2", invoiceDate: "2026-06-01", dueDate: "2026-06-30", totalAmount: 800, gstAmount: 0, paymentStatus: "paid", notes: "", items: [] },
  ];
  return s;
}

describe("documentPostings", () => {
  const s = state();

  it("posts one balanced AR entry per invoice", () => {
    const entries = collectDocumentPostings(s);
    expect(entries).toHaveLength(2);
    for (const e of entries) expect(() => assertValidEntry(e)).not.toThrow();
    expect(entries[0].externalId).toBe("invoice:INV1");
    expect(entries[0].lines.find((l) => (l.debit ?? 0) > 0)!.accountCode).toBe("1100"); // AR
  });

  it("AR aging uses outstanding (amount − paid)", () => {
    const rows = arAgingFromState(s, "2026-08-01");
    // INV1 outstanding 600, INV2 outstanding 500 => total 1100
    expect(agingTotal(rows)).toBe(1100);
  });

  it("AP aging excludes paid bills", () => {
    const rows = apAgingFromState(s, "2026-08-01");
    // P1 3000 outstanding, P2 paid => 3000
    expect(agingTotal(rows)).toBe(3000);
  });
});
