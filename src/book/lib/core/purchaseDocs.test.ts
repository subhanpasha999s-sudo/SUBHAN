import { describe, it, expect } from "vitest";
import { allocateLandedCost, receivedBillTotals } from "./purchaseDocs";

const items = [
  { skuCode: "A", quantity: 10, unitCost: 50, gstRate: 5 },   // value 500
  { skuCode: "B", quantity: 5, unitCost: 100, gstRate: 12 },  // value 500
];

describe("allocateLandedCost", () => {
  it("splits by value and grosses up unit costs", () => {
    const r = allocateLandedCost(items, 100, "value");
    expect(r[0].allocated).toBe(50);            // 500/1000 of 100
    expect(r[1].allocated).toBe(50);
    expect(r[0].landedUnitCost).toBe(55);       // 50 + 50/10
    expect(r[1].landedUnitCost).toBe(110);      // 100 + 50/5
  });

  it("splits by quantity", () => {
    const r = allocateLandedCost(items, 90, "quantity");
    expect(r[0].allocated).toBe(60);            // 10/15 of 90
    expect(r[1].allocated).toBe(30);
  });

  it("total allocated equals the landed cost exactly despite rounding", () => {
    const odd = [
      { skuCode: "A", quantity: 3, unitCost: 33.33, gstRate: 0 },
      { skuCode: "B", quantity: 3, unitCost: 33.33, gstRate: 0 },
      { skuCode: "C", quantity: 3, unitCost: 33.34, gstRate: 0 },
    ];
    const r = allocateLandedCost(odd, 100, "value");
    expect(r.reduce((s, x) => s + x.allocated, 0)).toBeCloseTo(100, 2);
  });

  it("falls back when weights degenerate (zero-value lines)", () => {
    const free = [
      { skuCode: "A", quantity: 4, unitCost: 0, gstRate: 0 },
      { skuCode: "B", quantity: 1, unitCost: 0, gstRate: 0 },
    ];
    const r = allocateLandedCost(free, 50, "value"); // value weights are 0 → quantity
    expect(r[0].allocated).toBe(40);
    expect(r[1].allocated).toBe(10);
  });
});

describe("receivedBillTotals", () => {
  it("GST applies to goods only; landed cost added net", () => {
    const t = receivedBillTotals(items, 100);
    expect(t.goods).toBe(1000);
    expect(t.gst).toBe(85);      // 500*5% + 500*12%
    expect(t.total).toBe(1185);  // 1000 + 85 + 100
  });
});
