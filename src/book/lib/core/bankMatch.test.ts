import { describe, it, expect } from "vitest";
import {
  payoutBatches, suggestPayoutMatches, suggestDocMatches,
  amountsMatch, bankBalanceSummary,
} from "./bankMatch";
import type { PaymentEvent } from "../engine";
import type { Invoice, Purchase, StoredBankTxn } from "../v2/types";

const ev = (o: Partial<PaymentEvent> & { transactionId: string; finalSettlement: number }): PaymentEvent => ({
  subOrderNo: "S", orderDate: "", eventDate: "2026-06-10", paymentDate: "2026-06-10",
  liveOrderStatus: "delivered", tcs: 0, tds: 0, claims: 0, compensation: 0, recovery: 0,
  sourceFile: "f", monthBucket: "2026-06", ...o,
});
const txn = (o: Partial<StoredBankTxn> & { id: string }): StoredBankTxn => ({
  txnDate: "2026-06-15", description: "MEESHO PAYOUT", debit: 0, credit: 0, status: "PENDING", ...o,
});

describe("payoutBatches", () => {
  it("nets settlement lines per Transaction ID", () => {
    const b = payoutBatches([
      ev({ transactionId: "TXN1", finalSettlement: 400 }),
      ev({ transactionId: "TXN1", finalSettlement: -50 }),
      ev({ transactionId: "TXN2", finalSettlement: 900, monthBucket: "2026-07" }),
    ]);
    expect(b.find((x) => x.batchId === "TXN1")).toMatchObject({ net: 350, count: 2 });
    expect(b.find((x) => x.batchId === "TXN2")).toMatchObject({ net: 900, count: 1, monthBucket: "2026-07" });
  });
});

describe("amountsMatch", () => {
  it("tolerates ₹1 or 1% of the target", () => {
    expect(amountsMatch(350, 350)).toBe(true);
    expect(amountsMatch(350.9, 350)).toBe(true);      // within ₹1
    expect(amountsMatch(1005, 1000)).toBe(true);       // within 1%
    expect(amountsMatch(1200, 1000)).toBe(false);
  });
});

describe("suggestPayoutMatches", () => {
  const batches = payoutBatches([
    ev({ transactionId: "TXN1", finalSettlement: 400 }),
    ev({ transactionId: "TXN1", finalSettlement: -50 }),   // net 350
    ev({ transactionId: "TXN2", finalSettlement: 900 }),
  ]);
  it("matches each deposit to its closest batch, one batch per deposit", () => {
    const s = suggestPayoutMatches([
      txn({ id: "T1", credit: 350 }),
      txn({ id: "T2", credit: 900 }),
      txn({ id: "T3", credit: 999999 }), // no batch
    ], batches);
    expect(s).toHaveLength(2);
    expect(s.find((x) => x.txnId === "T1")).toMatchObject({ batchId: "TXN1", batchNet: 350 });
    expect(s.find((x) => x.txnId === "T2")).toMatchObject({ batchId: "TXN2", batchNet: 900 });
  });
  it("does not let two deposits claim the same batch", () => {
    const s = suggestPayoutMatches([txn({ id: "A", credit: 350 }), txn({ id: "B", credit: 350 })], batches);
    expect(s).toHaveLength(1);
  });
});

describe("suggestDocMatches", () => {
  const invoices: Invoice[] = [
    { id: "I1", customerId: "c", number: "INV-1", amount: 1000, amountPaid: 400, invoiceDate: "2026-06-01", dueDate: "2026-06-15", status: "partial" }, // outstanding 600
    { id: "I2", customerId: "c", number: "INV-2", amount: 500, amountPaid: 500, invoiceDate: "2026-06-01", dueDate: "2026-06-15", status: "paid" },     // excluded
  ];
  const bills: Purchase[] = [
    { id: "P1", supplierName: "Acme", invoiceNo: "B-1", invoiceDate: "2026-06-01", totalAmount: 300, gstAmount: 0, paymentStatus: "pending", notes: "", items: [] },
  ];
  it("matches credits to open invoices and debits to open bills by outstanding", () => {
    const s = suggestDocMatches([txn({ id: "C1", credit: 600 }), txn({ id: "D1", debit: 300 })], invoices, bills);
    expect(s.find((x) => x.txnId === "C1")).toMatchObject({ kind: "invoice", docId: "I1", outstanding: 600, exact: true });
    expect(s.find((x) => x.txnId === "D1")).toMatchObject({ kind: "bill", docId: "P1", outstanding: 300, exact: true });
  });
  it("ignores paid documents and no-match amounts", () => {
    const s = suggestDocMatches([txn({ id: "X", credit: 500 })], invoices, bills); // 500 would match I2 but it's paid
    expect(s).toHaveLength(0);
  });
});

describe("bankBalanceSummary", () => {
  it("runs the statement balance from opening + net; counts uncleared", () => {
    const r = bankBalanceSummary([
      txn({ id: "1", credit: 1000, status: "CATEGORIZED" }),
      txn({ id: "2", debit: 300, status: "PENDING" }),
    ], 500);
    expect(r.statementBalance).toBe(1200); // 500 + 1000 − 300
    expect(r.clearedCount).toBe(1);
    expect(r.unclearedCount).toBe(1);
  });
});
