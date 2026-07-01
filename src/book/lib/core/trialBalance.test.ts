import { describe, it, expect } from "vitest";
import { trialBalance, type GlEntry } from "../engine/accounting";
import { glEntryToJournal } from "./journal";
import { trialBalanceFromJournal, trialBalanceBalances } from "./trialBalance";

// A representative slice of a derived GL projection: a delivered sale (net cash
// + TDS/TCS receivable split against revenue), its COGS, a platform fee, and a
// purchase on credit.
const gl: GlEntry[] = [
  { id: "sett:T1", date: "2026-06-10", debitCode: "1000", creditCode: "4000", amount: 470, description: "settle", sourceType: "order_settlement", sourceId: "S1" },
  { id: "tds:T1",  date: "2026-06-10", debitCode: "1300", creditCode: "4000", amount: 20,  description: "tds",    sourceType: "order_settlement", sourceId: "S1" },
  { id: "tcs:T1",  date: "2026-06-10", debitCode: "1400", creditCode: "4000", amount: 10,  description: "tcs",    sourceType: "order_settlement", sourceId: "S1" },
  { id: "cogs:S1", date: "2026-06-10", debitCode: "5000", creditCode: "1200", amount: 200, description: "cogs",   sourceType: "cogs",              sourceId: "S1" },
  { id: "fee:T1",  date: "2026-06-10", debitCode: "6000", creditCode: "1000", amount: 55,  description: "fee",    sourceType: "order_settlement", sourceId: "S1" },
  { id: "purchase:P1", date: "2026-06-12", debitCode: "1200", creditCode: "2000", amount: 300, description: "buy", sourceType: "purchase", sourceId: "P1" },
];

describe("trial balance parity (derived GL vs stored journal)", () => {
  const derived = trialBalance(gl);
  const stored = trialBalanceFromJournal(gl.map(glEntryToJournal));

  it("both trial balances balance (debits == credits)", () => {
    expect(trialBalanceBalances(derived)).toBe(true);
    expect(trialBalanceBalances(stored)).toBe(true);
  });

  it("every account matches, row for row", () => {
    expect(stored.length).toBe(derived.length);
    for (let i = 0; i < derived.length; i++) {
      expect(stored[i].account.code).toBe(derived[i].account.code);
      expect(stored[i].debit).toBeCloseTo(derived[i].debit, 2);
      expect(stored[i].credit).toBeCloseTo(derived[i].credit, 2);
      expect(stored[i].balance).toBeCloseTo(derived[i].balance, 2);
    }
  });

  it("spot-check key balances", () => {
    const bal = (rows: typeof stored, code: string) => rows.find((r) => r.account.code === code)!.balance;
    // Cash: 470 in - 55 fee = 415 (debit-normal)
    expect(bal(stored, "1000")).toBeCloseTo(415, 2);
    // Sales revenue: 470 + 20 + 10 = 500 (credit-normal)
    expect(bal(stored, "4000")).toBeCloseTo(500, 2);
    // Inventory: 300 purchased - 200 COGS = 100
    expect(bal(stored, "1200")).toBeCloseTo(100, 2);
    // AP: 300 (credit-normal)
    expect(bal(stored, "2000")).toBeCloseTo(300, 2);
  });

  it("respects asOf cut-off", () => {
    const beforePurchase = trialBalanceFromJournal(gl.map(glEntryToJournal), "2026-06-11");
    const ap = beforePurchase.find((r) => r.account.code === "2000")!;
    expect(ap.balance).toBeCloseTo(0, 2); // purchase on 06-12 excluded
  });
});
