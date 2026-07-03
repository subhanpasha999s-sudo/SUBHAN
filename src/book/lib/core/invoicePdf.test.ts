import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildInvoicePdf } from "./invoicePdf";

describe("buildInvoicePdf", () => {
  const args = {
    org: { name: "Tulmin Test Traders", gstin: "29ABCDE1234F1Z5", state: "Karnataka" },
    invoice: {
      id: "inv-1", customerId: "c1", number: "INV-0042", amount: 1180,
      amountPaid: 300, amountCredited: 200, invoiceDate: "2026-07-01",
      dueDate: "2026-07-16", status: "partial" as const, notes: "Cotton kurtis (bulk)",
    },
    customer: { id: "c1", name: "Sharma Textiles", gstin: "07XYZDE1234F1Z5", createdAt: "2026-01-01" },
  };

  it("produces a parseable one-page PDF", async () => {
    const bytes = await buildInvoicePdf(args);
    expect(bytes.length).toBeGreaterThan(800);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const reparsed = await PDFDocument.load(bytes);
    expect(reparsed.getPageCount()).toBe(1);
  });

  it("copes with a minimal invoice (no customer, no payments)", async () => {
    const bytes = await buildInvoicePdf({
      org: { name: "", gstin: "", state: "" },
      invoice: { id: "x", customerId: "", number: "", amount: 99, amountPaid: 0, invoiceDate: "2026-07-01", dueDate: "2026-07-10", status: "open" },
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
