import { describe, it, expect } from "vitest";
import { detectSettlementExceptions, openExceptions, deductionBreakdown } from "./settlementHealth";
import type { ReconciledOrder, OrderRow, PaymentEvent } from "../engine";

const order = (o: Partial<OrderRow> & { subOrderNo: string }): OrderRow => ({
  reason: "DELIVERED", catalogId: "", orderDate: "2026-05-01", orderSource: "",
  customerState: "Karnataka", productName: "P", sku: "SKU", size: "M", quantity: 1,
  listedPrice: 600, discountedPrice: 500, packetId: "P", ...o,
});
const ev = (o: Partial<PaymentEvent> & { finalSettlement: number }): PaymentEvent => ({
  subOrderNo: "S", transactionId: "T", orderDate: "", eventDate: "2026-05-20", paymentDate: "2026-05-20",
  liveOrderStatus: "delivered", tcs: 0, tds: 0, claims: 0, compensation: 0, recovery: 0,
  sourceFile: "f", monthBucket: "2026-05", ...o,
});
const rec = (o: Partial<ReconciledOrder> & { subOrderNo: string }): ReconciledOrder => ({
  order: null, events: [], cumulativeSettlement: 0, currentClass: "DELIVERED",
  lifecycleStatus: "SETTLED", lastEventAt: null, totalTcs: 0, totalTds: 0, ...o,
});

describe("detectSettlementExceptions", () => {
  const today = "2026-07-01";

  it("flags a delivered order with no settlement past the grace window", () => {
    const exc = detectSettlementExceptions([
      rec({ subOrderNo: "A", order: order({ subOrderNo: "A", orderDate: "2026-05-01" }), events: [] }),
    ], { today });
    expect(exc).toHaveLength(1);
    expect(exc[0]).toMatchObject({ kind: "MISSING_SETTLEMENT", subOrderNo: "A", amount: 500 });
  });

  it("does not flag a recent delivered order still within grace", () => {
    const exc = detectSettlementExceptions([
      rec({ subOrderNo: "B", order: order({ subOrderNo: "B", orderDate: "2026-06-20" }), events: [] }),
    ], { today });
    expect(exc).toHaveLength(0);
  });

  it("flags a delivered order that settled negative", () => {
    const exc = detectSettlementExceptions([
      rec({ subOrderNo: "C", order: order({ subOrderNo: "C" }), events: [ev({ finalSettlement: -30 })], cumulativeSettlement: -30 }),
    ], { today });
    expect(exc[0]).toMatchObject({ kind: "NEGATIVE_ON_DELIVERED", amount: 30 });
  });

  it("flags low realization vs the customer price, with a shortfall amount", () => {
    const exc = detectSettlementExceptions([
      rec({ subOrderNo: "D", order: order({ subOrderNo: "D", discountedPrice: 500 }), events: [ev({ finalSettlement: 150 })], cumulativeSettlement: 150 }),
    ], { today, lowRealizationPct: 40 });
    expect(exc[0]).toMatchObject({ kind: "LOW_REALIZATION", subOrderNo: "D", amount: 350 });
  });

  it("does not flag a healthy settlement", () => {
    const exc = detectSettlementExceptions([
      rec({ subOrderNo: "E", order: order({ subOrderNo: "E" }), events: [ev({ finalSettlement: 420 })], cumulativeSettlement: 420 }),
    ], { today });
    expect(exc).toHaveLength(0);
  });

  it("flags unmatched payout-only records", () => {
    const exc = detectSettlementExceptions([
      rec({ subOrderNo: "Z", order: null, events: [ev({ finalSettlement: 88 })], cumulativeSettlement: 88 }),
    ], { today });
    expect(exc[0]).toMatchObject({ kind: "UNMATCHED_PAYOUT", subOrderNo: "Z", amount: 88 });
  });
});

describe("openExceptions", () => {
  it("removes resolved/ignored keys", () => {
    const all = detectSettlementExceptions([
      rec({ subOrderNo: "A", order: order({ subOrderNo: "A" }), events: [], cumulativeSettlement: 0 }),
      rec({ subOrderNo: "C", order: order({ subOrderNo: "C" }), events: [{ ...({} as PaymentEvent), finalSettlement: -30, monthBucket: "2026-05", liveOrderStatus: "delivered", tcs: 0, tds: 0, recovery: 0, claims: 0, compensation: 0, paymentDate: "2026-05-20", subOrderNo: "C", transactionId: "T", orderDate: "", eventDate: "", sourceFile: "" }], cumulativeSettlement: -30 }),
    ], { today: "2026-07-01" });
    const { open, resolvedCount } = openExceptions(all, [{ key: all[0].key, action: "ignored", at: "x", by: "u" }]);
    expect(resolvedCount).toBe(1);
    expect(open).toHaveLength(all.length - 1);
  });
});

describe("deductionBreakdown", () => {
  it("buckets each deduction type per month by payment date", () => {
    const r = deductionBreakdown([
      rec({ subOrderNo: "A", order: order({ subOrderNo: "A" }), events: [
        ev({ finalSettlement: 420, tcs: 5, tds: 10, paymentDate: "2026-05-20", monthBucket: "2026-05" }),
        ev({ finalSettlement: -20, liveOrderStatus: "return", paymentDate: "2026-05-25", monthBucket: "2026-05" }),
        ev({ finalSettlement: -15, liveOrderStatus: null, paymentDate: "2026-05-28", monthBucket: "2026-05" }), // platform fee
        ev({ finalSettlement: 30, liveOrderStatus: null, paymentDate: "2026-06-05", monthBucket: "2026-06" }),  // claim income
      ] }),
    ]);
    const may = r.find((m) => m.month === "2026-05")!;
    expect(may).toMatchObject({ grossIn: 420, returnCharges: 20, platformFees: 15, tcs: 5, tds: 10, net: 385 });
    const jun = r.find((m) => m.month === "2026-06")!;
    expect(jun).toMatchObject({ claimsIncome: 30, net: 30 });
  });
});
