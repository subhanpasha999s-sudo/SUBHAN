import { describe, it, expect } from "vitest";
import { toPaise, fromPaise, sumMoney, subMoney, splitMoney, allocateMoney } from "./money";
import { round2, ledgerNetsToZero, type JournalEntryInput } from "./journal";
import { glEntryToJournal } from "./journal";
import type { GlEntry } from "../engine/accounting";

describe("paise round-trip", () => {
  it("is exact for 2-dp values", () => {
    for (const r of [0, 0.01, 0.5, 1, 12.34, 999999.99, -55.5]) {
      expect(fromPaise(toPaise(r))).toBe(r);
    }
  });
  it("classic float traps are exact in paise", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);        // 0.1+0.2 !== 0.3 in float
    expect(subMoney(1.0, 0.9)).toBe(0.1);
    expect(sumMoney([0.7, 0.1, 0.02])).toBe(0.82);
  });
});

describe("splitMoney / allocateMoney conserve the total", () => {
  it("even split distributes the remainder, sums back exactly", () => {
    expect(sumMoney(splitMoney(100, 3))).toBe(100);
    expect(splitMoney(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(splitMoney(0.05, 2)).toEqual([0.03, 0.02]);
    expect(sumMoney(splitMoney(100.01, 2))).toBe(100.01);
  });
  it("weighted allocation sums back exactly", () => {
    const parts = allocateMoney(100, [1, 1, 1]);
    expect(sumMoney(parts)).toBe(100);
    const freight = allocateMoney(1000, [3, 5, 2]); // landed-cost style
    expect(sumMoney(freight)).toBe(1000);
  });
});

describe("no drift: round2 sums match exact-paise sums over long sequences", () => {
  it("1000 random amounts agree within a paisa", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const amounts = Array.from({ length: 1000 }, () => round2((rand() - 0.5) * 5000));
    const floatSum = round2(amounts.reduce((s, a) => s + a, 0));
    const paiseSum = sumMoney(amounts);
    expect(Math.abs(floatSum - paiseSum)).toBeLessThan(0.005);
  });
});

describe("ledger fuzz: a projection of balanced GL entries always nets to zero", () => {
  it("500 random 2-line entries", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const gl: GlEntry[] = Array.from({ length: 500 }, (_, i) => ({
      id: `e${i}`, date: "2026-06-01",
      debitCode: "1000", creditCode: "4000",
      amount: round2(rand() * 10000),
      description: "fuzz", sourceType: "adjustment" as const, sourceId: String(i),
    }));
    const entries: JournalEntryInput[] = gl.map(glEntryToJournal);
    expect(ledgerNetsToZero(entries)).toBe(true);
  });
});
