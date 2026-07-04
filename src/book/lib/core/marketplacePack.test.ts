import { describe, it, expect } from "vitest";
import {
  MARKETPLACE_PACKS, getPack, livePacks, packParseOrders, packParsePayments,
  PackNotLiveError, MEESHO_PACK, FLIPKART_PACK, AMAZON_PACK,
} from "./marketplacePack";

// Same fixture shape as meesho.rules.test.ts — proves the pack wires to the
// real, golden-mastered parsers (behavior itself is pinned there).
const ORDER_ROWS: unknown[][] = [
  ["Table 1"],
  ["Reason for Credit Entry", "Sub Order No", "SKU", "Quantity", "Order Date"],
  ["DELIVERED", "1234_1", "KUR-RED-M", 1, "2026-06-01"],
];
const PAYMENT_ROWS: unknown[][] = [
  ["Order Payments"],
  ["Sub Order No", "Final Settlement Amount", "Live Order Status", "Payment Date"],
  ["", "B + C", "", ""], // legend row
  ["1234_1", "₹ 400.50", "DELIVERED", "2026-06-15"],
];

describe("pack registry", () => {
  it("registers Meesho (live) + Flipkart/Amazon (planned) in operator order", () => {
    expect(MARKETPLACE_PACKS.map((p) => p.id)).toEqual(["meesho", "flipkart", "amazon"]);
    expect(getPack("meesho")).toBe(MEESHO_PACK);
    expect(livePacks().map((p) => p.id)).toEqual(["meesho"]);
    expect(FLIPKART_PACK.status).toBe("planned");
    expect(AMAZON_PACK.status).toBe("planned");
  });

  it("every pack declares a deduction taxonomy and capabilities", () => {
    for (const p of MARKETPLACE_PACKS) {
      expect(p.deductionTaxonomy.length).toBeGreaterThan(0);
      expect(p.capabilities.settlementReconciliation).toBe(true);
    }
  });
});

describe("Meesho pack delegates to the real parsers", () => {
  it("parses orders through the pack", () => {
    const orders = packParseOrders(MEESHO_PACK, ORDER_ROWS);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ subOrderNo: "1234_1", sku: "KUR-RED-M", reason: "DELIVERED" });
  });
  it("parses payments through the pack (skipping the legend row)", () => {
    const pays = packParsePayments(MEESHO_PACK, PAYMENT_ROWS);
    expect(pays).toHaveLength(1);
    expect(pays[0].finalSettlement).toBe(400.5);
  });
});

describe("planned packs refuse to parse", () => {
  it("throws PackNotLiveError for Flipkart/Amazon", () => {
    expect(() => packParseOrders(FLIPKART_PACK, ORDER_ROWS)).toThrow(PackNotLiveError);
    expect(() => packParsePayments(AMAZON_PACK, PAYMENT_ROWS)).toThrow(PackNotLiveError);
  });
});
