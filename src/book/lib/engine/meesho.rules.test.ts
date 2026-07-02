/**
 * MEESHO_RULES regression suite (Phase 0 of CLAUDE_UPGRADE_SPEC).
 *
 * Pins the parser / dedupe / canonical-merge behavior documented in
 * docs/MEESHO_RULES.md using synthetic fixtures shaped like real Meesho
 * exports (preamble rows, formula-legend row, header drift, payout-batch
 * transaction ids). Classification → GL → trial-balance behavior is pinned
 * separately in core/reconciliation.characterization.test.ts.
 *
 * These tests are LAW: a change that breaks them needs operator approval.
 */
import { describe, it, expect } from "vitest";
import {
  parseOrderRows, parsePaymentRows, ParseError, type ParseReport,
} from "./parse";
import { canonicalizeOrders } from "./classify";
import {
  paymentRowToEvent, applyPaymentUpload, eventDedupeKey, normalizeSubOrderNo,
  isExchangeThenReturn, qcReturnTypesFor, classifyReconciled,
} from "./reconcile";
import type { OrderRow } from "./types";

const report = (): ParseReport => ({ skippedNoKey: 0, skippedBadValue: 0 });

// ── Fixture: order CSV with Meesho preamble + drifted headers ─────────
const ORDER_FIXTURE: unknown[][] = [
  ["Table 1"],                                    // preamble title row
  ["Order Related Details"],                      // group banner row
  [
    "Reason for Credit Entry", "Sub Order No", "Order Date", "Customer State",
    "Product Name", "SKU", "Size", "Quantity",
    "Supplier Listed Price (Incl. GST + Commision)",   // Meesho misspelling
    "Supplier Discounted Price (Incl GST and Commision)",
    "Packet Id",
  ],
  ["DELIVERED", "187156719912345678_1", "2026-06-01", "Karnataka",
    "Cotton Kurti", "KUR-RED-M", "M", 1, "499", "₹450", "PKT1"],
  ["door_step_exchanged", "187156719912345678_1", "2026-06-01", "Karnataka",
    "Cotton Kurti", "KUR-RED-M", "M", 1, "499", "450", "PKT1"],
  ["CANCELLED", "187156719954444444_1", "2026-06-02", "Delhi",
    "Silk Saree", "SAR-BLU", "Free", 1, "899", "850", ""],
  ["", "", "", "", "", "", "", "", "", "", ""],   // blank trailing row
];

describe("order file parsing (MEESHO_RULES §1)", () => {
  it("scans past preamble rows to find the real header", () => {
    const r = report();
    const rows = parseOrderRows(ORDER_FIXTURE, r);
    expect(rows).toHaveLength(3); // 2 rows for the exchange order + 1 cancelled
    expect(r.skippedNoKey).toBe(1); // the blank trailing row
  });

  it("preserves Sub Order No as an exact string incl. _1 suffix", () => {
    const rows = parseOrderRows(ORDER_FIXTURE);
    expect(rows[0].subOrderNo).toBe("187156719912345678_1");
  });

  it("matches drifted headers (misspelt Commision, appended qualifiers) and strips ₹", () => {
    const rows = parseOrderRows(ORDER_FIXTURE);
    expect(rows[0].listedPrice).toBe(499);
    expect(rows[0].discountedPrice).toBe(450);
    expect(rows[0].customerState).toBe("Karnataka");
  });

  it("uppercases the reason", () => {
    const rows = parseOrderRows(ORDER_FIXTURE);
    expect(rows[1].reason).toBe("DOOR_STEP_EXCHANGED");
  });

  it("rejects a non-Meesho file naming the missing columns", () => {
    expect(() => parseOrderRows([["foo", "bar"], ["1", "2"]]))
      .toThrow(ParseError);
  });
});

describe("canonical order merge (MEESHO_RULES §1a)", () => {
  it("DELIVERED + DOOR_STEP_EXCHANGED collapses to DELIVERED with hadExchangeLeg", () => {
    const rows = parseOrderRows(ORDER_FIXTURE);
    const canon = canonicalizeOrders(rows);
    expect(canon.rawRowCount).toBe(3);
    expect(canon.uniqueCount).toBe(2);
    expect(canon.mergedSubOrders).toEqual(["187156719912345678_1"]);
    const merged = canon.orders.find((o) => o.subOrderNo === "187156719912345678_1")!;
    expect(merged.reason).toBe("DELIVERED");
    expect(merged.hadExchangeLeg).toBe(true);
  });
});

// ── Fixture: Order Payments sheet with title + legend rows ───────────
const PAYMENT_FIXTURE: unknown[][] = [
  ["Order Payments"],                              // sheet title row
  [
    "Sub Order No", "Order Date", "Dispatch Date", "Product Name",
    "Supplier SKU", "Live Order Status", "Product GST %",
    "Total Sale Amount (Incl. Shipping & GST)", "Final Settlement Amount",
    "Quantity", "Return Shipping Charge (Incl. GST)", "TCS", "TDS",
    "Compensation", "Claims", "Recovery", "Payment Date", "Transaction ID",
  ],
  // Meesho formula-legend row — non-numeric settlement, MUST be skipped
  ["", "", "", "", "", "", "A", "B", "B + C - D", "", "C", "", "", "", "", "", "", ""],
  ["187156719912345678_1", "2026-06-01", "2026-06-02", "Cotton Kurti",
    "KUR-RED-M", "DELIVERED", "5", "₹499", "₹ 400.50", 1, "0", "2.5", "10",
    "0", "0", "0", "2026-06-15", "TXN_BATCH_1"],
  ["187156719977777777_1", "2026-06-03", "2026-06-04", "Silk Saree",
    "SAR-BLU", "", "5", "0", "-55", 1, "0", "0", "0", "0", "0", "0",
    "2026-06-15", "TXN_BATCH_1"],                  // blank status, negative = fee
];

describe("payment file parsing (MEESHO_RULES §2)", () => {
  it("skips the blank-key formula-legend row, counting it as skippedNoKey", () => {
    const r = report();
    const rows = parsePaymentRows(PAYMENT_FIXTURE, r);
    expect(rows).toHaveLength(2);
    expect(r.skippedNoKey).toBe(1);    // legend row: blank Sub Order No
    expect(r.skippedBadValue).toBe(0);
  });

  it("drops a keyed row with non-numeric settlement, counting it as skippedBadValue", () => {
    const r = report();
    const withBad = [...PAYMENT_FIXTURE,
      ["187156719900000000_1", "2026-06-05", "", "X", "SKU", "DELIVERED", "5",
        "0", "N/A", 1, "0", "0", "0", "0", "0", "0", "2026-06-15", "TXN_BATCH_1"]];
    const rows = parsePaymentRows(withBad, r);
    expect(rows).toHaveLength(2);      // bad row not imported
    expect(r.skippedBadValue).toBe(1); // …but never silently
  });

  it("parses ₹/space/comma amounts and keeps blank status as null", () => {
    const rows = parsePaymentRows(PAYMENT_FIXTURE);
    expect(rows[0].finalSettlement).toBe(400.5);
    expect(rows[0].tcs).toBe(2.5);
    expect(rows[0].tds).toBe(10);
    expect(rows[1].liveOrderStatus).toBeNull(); // meaningful blank
    expect(rows[1].finalSettlement).toBe(-55);
  });
});

describe("event dedupe on re-import (MEESHO_RULES §2b)", () => {
  const rows = parsePaymentRows(PAYMENT_FIXTURE);
  const june = rows.map((r) => paymentRowToEvent(r, "2026-06", "june.xlsx"));

  it("re-importing the same file skips every line", () => {
    const res = applyPaymentUpload(new Map(), june, june);
    expect(res.newEvents).toHaveLength(0);
    expect(res.duplicatesSkipped).toBe(2);
  });

  it("the same line in a different month's file still dedupes (monthBucket excluded)", () => {
    const july = rows.map((r) => paymentRowToEvent(r, "2026-07", "july.xlsx"));
    expect(eventDedupeKey(june[0])).toBe(eventDedupeKey(july[0]));
    const res = applyPaymentUpload(new Map(), june, july);
    expect(res.duplicatesSkipped).toBe(2);
  });

  it("a later payout with a different Transaction ID is kept even at the same amount", () => {
    const later = { ...june[0], transactionId: "TXN_BATCH_2" };
    const res = applyPaymentUpload(new Map(), june, [later]);
    expect(res.newEvents).toHaveLength(1);
  });
});

describe("exchange-then-return double QC (MEESHO_RULES §3e)", () => {
  const order: OrderRow = {
    reason: "DELIVERED", subOrderNo: "X_1", catalogId: "", orderDate: "2026-06-01",
    orderSource: "", customerState: "Karnataka", productName: "Kurti",
    sku: "KUR", size: "M", quantity: 1, listedPrice: 499, discountedPrice: 450,
    packetId: "P", hadExchangeLeg: true,
  };
  const returnEvent = paymentRowToEvent({
    subOrderNo: "X_1", transactionId: "T9", orderDate: "2026-06-01",
    dispatchDate: "", productName: "Kurti", sku: "KUR", liveOrderStatus: "RETURN",
    finalSettlement: -80, quantity: 1, totalSaleAmount: 0, returnShippingCharge: 80,
    tcs: 0, tds: 0, compensation: 0, claims: 0, recovery: 0, paymentDate: "2026-06-20",
  }, "2026-06", "f.xlsx");

  it("classifies RETURN and yields TWO QC entries (both units come back)", () => {
    expect(classifyReconciled(order, [returnEvent])).toBe("RETURN");
    expect(isExchangeThenReturn(order, [returnEvent])).toBe(true);
    expect(qcReturnTypesFor(order, [returnEvent]))
      .toEqual(["CUSTOMER_RETURN", "EXCHANGE_RETURN"]);
  });
});

describe("sub order no normalization (MEESHO_RULES §1)", () => {
  it("trims whitespace, preserves suffix, never numeric", () => {
    expect(normalizeSubOrderNo(" 187156719912345678_2 ")).toBe("187156719912345678_2");
    expect(normalizeSubOrderNo(187156719912345678)).toBe(String(187156719912345678));
  });
});
