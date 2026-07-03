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

  it("posts receipts as DR Cash / CR AR, idempotent per receipt", () => {
    const withReceipts: V2State = { ...s, receipts: [
      { id: "RC1", invoiceId: "INV1", amount: 400, date: "2026-06-10" },
    ] };
    const entries = collectDocumentPostings(withReceipts);
    const receipt = entries.find((e) => e.externalId === "receipt:RC1")!;
    expect(receipt).toBeTruthy();
    expect(receipt.lines.find((l) => (l.debit ?? 0) > 0)!.accountCode).toBe("1000"); // Cash
    expect(receipt.lines.find((l) => (l.credit ?? 0) > 0)!.accountCode).toBe("1100"); // AR
    expect(() => assertValidEntry(receipt)).not.toThrow();
  });

  it("AR aging uses outstanding (amount − paid)", () => {
    const rows = arAgingFromState(s, "2026-08-01");
    // INV1 outstanding 600, INV2 outstanding 500 => total 1100
    expect(agingTotal(rows)).toBe(1100);
  });

  it("credit notes post DR Sales / CR AR and reduce aging outstanding", () => {
    const withCn: V2State = {
      ...s,
      invoices: s.invoices.map((i) => (i.id === "INV1" ? { ...i, amountCredited: 100 } : i)),
      creditNotes: [{ id: "CN1", customerId: "C1", invoiceId: "INV1", number: "CN-0001", amount: 100, date: "2026-06-20", status: "applied" }],
    };
    const entries = collectDocumentPostings(withCn);
    const cn = entries.find((e) => e.externalId === "creditnote:CN1")!;
    expect(cn).toBeTruthy();
    expect(cn.lines.find((l) => (l.debit ?? 0) > 0)!.accountCode).toBe("4000");  // Sales
    expect(cn.lines.find((l) => (l.credit ?? 0) > 0)!.accountCode).toBe("1100"); // AR
    expect(() => assertValidEntry(cn)).not.toThrow();
    // INV1 outstanding drops 600 -> 500; total 1100 -> 1000
    expect(agingTotal(arAgingFromState(withCn, "2026-08-01"))).toBe(1000);
  });

  it("AP aging excludes paid bills", () => {
    const rows = apAgingFromState(s, "2026-08-01");
    // P1 3000 outstanding, P2 paid => 3000
    expect(agingTotal(rows)).toBe(3000);
  });
});
