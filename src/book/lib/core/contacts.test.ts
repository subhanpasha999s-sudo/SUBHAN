import { describe, it, expect } from "vitest";
import {
  csvEscape, customersToCsv, recordsToContactRows, dedupeByName,
  mergeCustomerRecords, formatAdjustmentReason,
} from "./contacts";
import type { Customer, Invoice } from "../v2/types";

const cust = (id: string, name: string, extra: Partial<Customer> = {}): Customer =>
  ({ id, name, createdAt: "2026-07-01", ...extra });

describe("CSV escaping & export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvEscape('Acme, Ltd')).toBe('"Acme, Ltd"');
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvEscape("plain")).toBe("plain");
  });

  it("exports customers with header and escaped fields", () => {
    const csv = customersToCsv([cust("1", "Sharma, Traders", { gstin: "29ABCDE1234F1Z5" })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("name,gstin,state,phone,email,address,notes");
    expect(lines[1]).toContain('"Sharma, Traders"');
    expect(lines[1]).toContain("29ABCDE1234F1Z5");
  });
});

describe("import mapping + dedupe", () => {
  it("maps fuzzy headers and drops nameless rows", () => {
    const rows = recordsToContactRows([
      { "Customer Name": "Acme", "GST No.": "GST1", "Phone Number": "99999" },
      { "Customer Name": "", "GST No.": "GSTX" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Acme", gstin: "GST1", phone: "99999" });
  });

  it("dedupes case/space-insensitively against existing AND within the file", () => {
    const { fresh, skippedDuplicates } = dedupeByName(
      [{ name: "Sharma Textiles" }],
      [{ name: "  sharma   textiles " }, { name: "New Co" }, { name: "NEW CO" }],
    );
    expect(fresh.map((f) => f.name)).toEqual(["New Co"]);
    expect(skippedDuplicates).toBe(2);
  });
});

describe("mergeCustomerRecords", () => {
  const customers = [
    cust("A", "Acme", { gstin: "KEEP-GST" }),
    cust("B", "Acme Retail", { phone: "12345", gstin: "DUP-GST" }),
  ];
  const invoices: Invoice[] = [
    { id: "I1", customerId: "B", number: "INV-1", amount: 100, amountPaid: 0, invoiceDate: "2026-06-01", dueDate: "2026-06-15", status: "open" },
    { id: "I2", customerId: "A", number: "INV-2", amount: 200, amountPaid: 0, invoiceDate: "2026-06-02", dueDate: "2026-06-16", status: "open" },
  ];

  it("reassigns invoices, fills empty fields only, removes the duplicate", () => {
    const r = mergeCustomerRecords(customers, invoices, "A", "B");
    expect(r.ok).toBe(true);
    expect(r.customers).toHaveLength(1);
    const kept = r.customers[0];
    expect(kept.gstin).toBe("KEEP-GST"); // not overwritten
    expect(kept.phone).toBe("12345");    // filled from duplicate
    expect(r.invoices.every((i) => i.customerId === "A")).toBe(true);
  });

  it("rejects self-merge and unknown ids", () => {
    expect(mergeCustomerRecords(customers, invoices, "A", "A").ok).toBe(false);
    expect(mergeCustomerRecords(customers, invoices, "A", "ZZZ").ok).toBe(false);
  });
});

describe("adjustment reasons", () => {
  it("formats CODE and CODE — note", () => {
    expect(formatAdjustmentReason("DAMAGED")).toBe("DAMAGED");
    expect(formatAdjustmentReason("OTHER", "box crushed")).toBe("OTHER — box crushed");
  });
});
