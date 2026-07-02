import { describe, it, expect } from "vitest";
import {
  invoicePosting, receiptPosting, creditNotePosting,
  billPosting, billPaymentPosting, vendorCreditPosting,
  stockAdjustmentPosting, bankTxnPosting,
  openingBalanceEntry, EmptyOpeningBalanceError,
} from "./postings";
import { assertValidEntry, ledgerNetsToZero } from "./journal";
import { aging, agingTotal } from "./aging";

const dr = (e: ReturnType<typeof invoicePosting>) => e.lines.find((l) => (l.debit ?? 0) > 0)!.accountCode;
const cr = (e: ReturnType<typeof invoicePosting>) => e.lines.find((l) => (l.credit ?? 0) > 0)!.accountCode;

describe("posting rules — Phase 3 (sales/AR)", () => {
  it("invoice: DR AR / CR Sales, balanced, stable id", () => {
    const e = invoicePosting({ id: "I1", date: "2026-07-01", total: 1180, number: "INV-1" });
    expect(dr(e)).toBe("1100"); expect(cr(e)).toBe("4000");
    expect(e.externalId).toBe("invoice:I1");
    expect(() => assertValidEntry(e)).not.toThrow();
  });
  it("receipt: DR Cash / CR AR", () => {
    const e = receiptPosting({ id: "R1", date: "2026-07-05", amount: 1180 });
    expect(dr(e)).toBe("1000"); expect(cr(e)).toBe("1100");
    expect(() => assertValidEntry(e)).not.toThrow();
  });
  it("credit note reverses: DR Sales / CR AR", () => {
    const e = creditNotePosting({ id: "C1", date: "2026-07-06", amount: 200 });
    expect(dr(e)).toBe("4000"); expect(cr(e)).toBe("1100");
  });
  it("invoice then full receipt nets AR to zero", () => {
    const inv = invoicePosting({ id: "I2", date: "2026-07-01", total: 500 });
    const rec = receiptPosting({ id: "R2", date: "2026-07-10", amount: 500 });
    expect(ledgerNetsToZero([inv, rec])).toBe(true);
  });
});

describe("posting rules — Phase 4 (purchases/AP)", () => {
  it("bill to inventory: DR Inventory / CR AP", () => {
    const e = billPosting({ id: "B1", date: "2026-07-01", total: 3000 });
    expect(dr(e)).toBe("1200"); expect(cr(e)).toBe("2000");
    expect(() => assertValidEntry(e)).not.toThrow();
  });
  it("expense bill: DR Operating / CR AP", () => {
    const e = billPosting({ id: "B2", date: "2026-07-01", total: 500, toInventory: false });
    expect(dr(e)).toBe("6300"); expect(cr(e)).toBe("2000");
  });
  it("vendor payment: DR AP / CR Cash", () => {
    const e = billPaymentPosting({ id: "PP1", date: "2026-07-15", amount: 3000 });
    expect(dr(e)).toBe("2000"); expect(cr(e)).toBe("1000");
  });
  it("vendor credit: DR AP / CR Inventory", () => {
    const e = vendorCreditPosting({ id: "VC1", date: "2026-07-06", amount: 300 });
    expect(dr(e)).toBe("2000"); expect(cr(e)).toBe("1200");
  });
  it("bill + full payment nets AP to zero", () => {
    expect(ledgerNetsToZero([
      billPosting({ id: "B3", date: "2026-07-01", total: 1000 }),
      billPaymentPosting({ id: "PP3", date: "2026-07-20", amount: 1000 }),
    ])).toBe(true);
  });
});

describe("posting rules — Phase 5 (inventory)", () => {
  it("stock increase: DR Inventory / CR Operating", () => {
    const e = stockAdjustmentPosting({ id: "A1", date: "2026-07-01", value: 250, direction: "increase" });
    expect(dr(e)).toBe("1200"); expect(cr(e)).toBe("6300");
    expect(() => assertValidEntry(e)).not.toThrow();
  });
  it("stock write-off: DR QC Write-off / CR Inventory", () => {
    const e = stockAdjustmentPosting({ id: "A2", date: "2026-07-01", value: 120, direction: "decrease", reason: "damaged" });
    expect(dr(e)).toBe("6200"); expect(cr(e)).toBe("1200");
  });
});

describe("posting rules — Phase 6 (banking)", () => {
  it("money in: DR Cash / CR category", () => {
    const e = bankTxnPosting({ id: "T1", date: "2026-07-01", debit: 0, credit: 5000, coaCode: "4000" });
    expect(dr(e)).toBe("1000"); expect(cr(e)).toBe("4000");
    expect(() => assertValidEntry(e)).not.toThrow();
  });
  it("money out: DR category / CR Cash", () => {
    const e = bankTxnPosting({ id: "T2", date: "2026-07-02", debit: 800, credit: 0, coaCode: "6300" });
    expect(dr(e)).toBe("6300"); expect(cr(e)).toBe("1000");
  });
});

describe("opening balances (Phase 1)", () => {
  it("plugs the surplus to Owner Equity credit when debits exceed credits", () => {
    const e = openingBalanceEntry([
      { accountCode: "1000", amount: 50000, side: "debit" },  // cash
      { accountCode: "1200", amount: 30000, side: "debit" },  // inventory
      { accountCode: "2000", amount: 10000, side: "credit" }, // AP owed
    ], "2026-04-01");
    expect(() => assertValidEntry(e)).not.toThrow();
    const equity = e.lines.find((l) => l.accountCode === "3100")!;
    expect(equity.credit).toBe(70000);
    expect(e.externalId).toBe("opening-balance");
    expect(e.sourceType).toBe("opening_balance");
  });

  it("plugs to Owner Equity debit when liabilities exceed assets", () => {
    const e = openingBalanceEntry([
      { accountCode: "1000", amount: 1000, side: "debit" },
      { accountCode: "2000", amount: 4000, side: "credit" },
    ], "2026-04-01");
    const equity = e.lines.find((l) => l.accountCode === "3100")!;
    expect(equity.debit).toBe(3000);
    expect(() => assertValidEntry(e)).not.toThrow();
  });

  it("omits the plug when entries already balance; drops zero rows", () => {
    const e = openingBalanceEntry([
      { accountCode: "1000", amount: 500, side: "debit" },
      { accountCode: "2000", amount: 500, side: "credit" },
      { accountCode: "1200", amount: 0, side: "debit" },
    ], "2026-04-01");
    expect(e.lines).toHaveLength(2);
    expect(() => assertValidEntry(e)).not.toThrow();
  });

  it("rejects an all-empty wizard", () => {
    expect(() => openingBalanceEntry([{ accountCode: "1000", amount: 0, side: "debit" }], "2026-04-01"))
      .toThrow(EmptyOpeningBalanceError);
  });
});

describe("aging (AR/AP)", () => {
  const asOf = "2026-07-01";
  const rows = aging([
    { dueDate: "2026-07-10", outstanding: 100 }, // current (not yet due)
    { dueDate: "2026-06-20", outstanding: 200 }, // 11 days overdue -> 1-30
    { dueDate: "2026-05-15", outstanding: 300 }, // 47 days -> 31-60
    { dueDate: "2026-03-01", outstanding: 400 }, // 122 days -> 90+
    { dueDate: "2026-06-30", outstanding: 0 },   // zero -> ignored
  ], asOf);

  it("buckets by overdue age", () => {
    const by = (b: string) => rows.find((r) => r.bucket === b)!;
    expect(by("current").amount).toBe(100);
    expect(by("1-30").amount).toBe(200);
    expect(by("31-60").amount).toBe(300);
    expect(by("61-90").amount).toBe(0);
    expect(by("90+").amount).toBe(400);
  });
  it("total excludes zero-outstanding items", () => {
    expect(agingTotal(rows)).toBe(1000);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(4);
  });
});
