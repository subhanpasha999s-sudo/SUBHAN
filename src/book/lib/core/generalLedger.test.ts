import { describe, it, expect } from "vitest";
import type { GlEntry } from "../engine/accounting";
import {
  accountLedger, activeAccountCodes, compareAccountMovements,
  postingsFromGl, postingsFromJournal,
} from "./generalLedger";
import { invoicePosting, receiptPosting } from "./postings";

// Cash (1000, debit-normal) across two months.
const gl: GlEntry[] = [
  { id: "a", date: "2026-05-10", debitCode: "1000", creditCode: "4000", amount: 500, description: "May sale", sourceType: "order_settlement", sourceId: "S1" },
  { id: "b", date: "2026-06-05", debitCode: "1000", creditCode: "4000", amount: 300, description: "Jun sale", sourceType: "order_settlement", sourceId: "S2" },
  { id: "c", date: "2026-06-20", debitCode: "6000", creditCode: "1000", amount: 120, description: "Jun fee", sourceType: "order_settlement", sourceId: "S2" },
];
const postings = postingsFromGl(gl);

describe("accountLedger", () => {
  it("running balance (debit-normal) with opening from prior periods", () => {
    const led = accountLedger(postings, "1000", { from: "2026-06-01", to: "2026-06-30" })!;
    expect(led.opening).toBe(500);
    expect(led.rows.map((r) => r.balance)).toEqual([800, 680]);
    expect(led.totalDebit).toBe(300);
    expect(led.totalCredit).toBe(120);
    expect(led.closing).toBe(680);
  });

  it("credit-normal account balances the other way", () => {
    const led = accountLedger(postings, "4000")!;
    expect(led.closing).toBe(800);
    expect(led.rows).toHaveLength(2);
  });

  it("full history when no range; unknown account = null", () => {
    expect(accountLedger(postings, "1000")!.rows).toHaveLength(3);
    expect(accountLedger(postings, "9999")).toBeNull();
  });
});

describe("document postings feed the same ledger (invoice → AR)", () => {
  it("flattens invoice/receipt lines onto their accounts", () => {
    const docs = postingsFromJournal([
      invoicePosting({ id: "I1", date: "2026-06-01", total: 1000, number: "INV-1" }),
      receiptPosting({ id: "R1", date: "2026-06-10", amount: 400 }),
    ]);
    const ar = accountLedger(docs, "1100")!; // AR, debit-normal
    expect(ar.rows.map((r) => [r.debit, r.credit])).toEqual([[1000, 0], [0, 400]]);
    expect(ar.closing).toBe(600); // invoiced 1000 − received 400
  });
});

describe("compareAccountMovements", () => {
  it("nets each account per range and reports the delta", () => {
    const cmp = compareAccountMovements(postings, { from: "2026-06-01", to: "2026-06-30" }, { from: "2026-05-01", to: "2026-05-31" });
    const cash = cmp.find((m) => m.account.code === "1000")!;
    expect(cash.a).toBe(180);
    expect(cash.b).toBe(500);
    expect(cash.delta).toBe(-320);
  });
});

describe("activeAccountCodes", () => {
  it("collects every touched account", () => {
    expect(activeAccountCodes(postings)).toEqual(new Set(["1000", "4000", "6000"]));
  });
});
