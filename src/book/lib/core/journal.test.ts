import { describe, it, expect } from "vitest";
import {
  assertValidEntry, isBalanced, reverseEntry, glEntryToJournal,
  ledgerNetsToZero, lineTotals, round2,
  UnbalancedEntryError, InvalidLineError,
  type JournalEntryInput,
} from "./journal";
import type { GlEntry } from "../engine/accounting";

const entry = (lines: JournalEntryInput["lines"]): JournalEntryInput => ({
  entryDate: "2026-07-01", sourceType: "manual", lines,
});

describe("balancing", () => {
  it("accepts a balanced two-line entry", () => {
    const e = entry([
      { accountCode: "1000", debit: 100 },
      { accountCode: "4000", credit: 100 },
    ]);
    expect(isBalanced(e.lines)).toBe(true);
    expect(() => assertValidEntry(e)).not.toThrow();
  });

  it("accepts a balanced multi-line (split) entry", () => {
    const e = entry([
      { accountCode: "1000", debit: 90 },
      { accountCode: "1300", debit: 10 },   // TDS receivable
      { accountCode: "4000", credit: 100 },
    ]);
    expect(() => assertValidEntry(e)).not.toThrow();
  });

  it("rejects an unbalanced entry", () => {
    const e = entry([
      { accountCode: "1000", debit: 100 },
      { accountCode: "4000", credit: 99 },
    ]);
    expect(isBalanced(e.lines)).toBe(false);
    expect(() => assertValidEntry(e)).toThrow(UnbalancedEntryError);
  });

  it("rejects a line with both debit and credit", () => {
    expect(() => assertValidEntry(entry([
      { accountCode: "1000", debit: 50, credit: 50 },
      { accountCode: "4000", credit: 50 },
    ]))).toThrow(InvalidLineError);
  });

  it("rejects a line with neither debit nor credit", () => {
    expect(() => assertValidEntry(entry([
      { accountCode: "1000" },
      { accountCode: "4000", credit: 0 },
    ]))).toThrow(InvalidLineError);
  });

  it("rejects negative amounts", () => {
    expect(() => assertValidEntry(entry([
      { accountCode: "1000", debit: -100 },
      { accountCode: "4000", credit: -100 },
    ]))).toThrow(InvalidLineError);
  });

  it("requires at least two lines", () => {
    expect(() => assertValidEntry(entry([{ accountCode: "1000", debit: 10 }])))
      .toThrow(InvalidLineError);
  });

  it("tolerates sub-paisa rounding noise", () => {
    // 100/3 across three debits vs one 100 credit
    const third = round2(100 / 3); // 33.33
    const e = entry([
      { accountCode: "1000", debit: third },
      { accountCode: "1000", debit: third },
      { accountCode: "1000", debit: round2(100 - 2 * third) }, // 33.34
      { accountCode: "4000", credit: 100 },
    ]);
    expect(() => assertValidEntry(e)).not.toThrow();
  });
});

describe("reverseEntry", () => {
  it("swaps sides and stays balanced", () => {
    const original = entry([
      { accountCode: "1200", debit: 250 },  // Inventory
      { accountCode: "2000", credit: 250 }, // AP
    ]);
    const rev = reverseEntry(original);
    expect(rev.lines[0]).toMatchObject({ accountCode: "1200", credit: 250 });
    expect(rev.lines[1]).toMatchObject({ accountCode: "2000", debit: 250 });
    expect(() => assertValidEntry(rev)).not.toThrow();
    // original + reversal net to zero per account
    expect(ledgerNetsToZero([original, rev])).toBe(true);
  });
});

describe("glEntryToJournal (strangler-fig port)", () => {
  const gl: GlEntry = {
    id: "sett:TXN123", date: "2026-06-15",
    debitCode: "1000", creditCode: "4000", amount: 499.5,
    description: "DELIVERED settlement SUB1", sourceType: "order_settlement",
    sourceId: "SUB1",
  };

  it("produces a balanced two-line entry with a stable idempotency key", () => {
    const je = glEntryToJournal(gl);
    expect(je.externalId).toBe("gl:sett:TXN123");
    expect(je.lines).toHaveLength(2);
    expect(lineTotals(je.lines)).toEqual({ debit: 499.5, credit: 499.5 });
    expect(() => assertValidEntry(je)).not.toThrow();
  });

  it("a whole derived GL projection nets to zero", () => {
    const gls: GlEntry[] = [
      gl,
      { id: "cogs:SUB1", date: "2026-06-15", debitCode: "5000", creditCode: "1200", amount: 200, description: "COGS", sourceType: "cogs", sourceId: "SUB1" },
      { id: "fee:TXN123", date: "2026-06-15", debitCode: "6000", creditCode: "1000", amount: 60, description: "fee", sourceType: "order_settlement", sourceId: "SUB1" },
    ];
    expect(ledgerNetsToZero(gls.map(glEntryToJournal))).toBe(true);
  });
});
