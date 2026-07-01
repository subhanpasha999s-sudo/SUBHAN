/**
 * Phase 2 characterization ("golden master") tests.
 *
 * These lock in the CURRENT behaviour of the e-commerce reconciliation → GL
 * pipeline on a representative fixture, so any Phase 2+ refactor (routing
 * auto-posting through the stored ledger) that changes a number will fail loud.
 * The numbers below were captured from the live pipeline, not hand-derived.
 */
import { describe, it, expect } from "vitest";
import { buildEmptyState } from "@/book/lib/v2/emptyState";
import { reconcileAll } from "@/book/lib/v2/derived";
import { glEntries } from "@/book/lib/v2/reportDerived";
import { trialBalance } from "@/book/lib/engine/accounting";
import type { OrderRow, PaymentEvent } from "@/book/lib/engine";
import type { V2State } from "@/book/lib/v2/types";
import { glEntryToJournal, ledgerNetsToZero } from "./journal";
import { trialBalanceFromJournal, trialBalanceBalances } from "./trialBalance";

function order(o: Partial<OrderRow> & { subOrderNo: string; sku: string }): OrderRow {
  return {
    reason: "DELIVERED", catalogId: "C", orderDate: "2026-06-01", orderSource: "",
    customerState: "Karnataka", productName: "Test", size: "M", quantity: 1,
    listedPrice: 500, discountedPrice: 450, packetId: "P", ...o,
  } as OrderRow;
}
function event(e: Partial<PaymentEvent> & { subOrderNo: string; transactionId: string }): PaymentEvent {
  return {
    orderDate: "2026-06-01", eventDate: "2026-06-15", paymentDate: "2026-06-15",
    liveOrderStatus: "Delivered", finalSettlement: 0, tcs: 0, tds: 0, claims: 0,
    compensation: 0, recovery: 0, sourceFile: "f.xlsx", monthBucket: "2026-06", ...e,
  } as PaymentEvent;
}

/** Delivered sale (w/ TDS+TCS) + an RTO loss + a purchase on credit. */
function fixture(): V2State {
  const s = buildEmptyState();
  s.org.settleAfterDays = 60;
  s.skus = [{ skuCode: "SKU-A", productName: "Widget", category: "", sizeSet: "", currentCogs: 100, gstRate: 5, hsnCode: "", reorderLevel: 0, status: "active" }];
  s.orders = [
    order({ subOrderNo: "O1_1", sku: "SKU-A", reason: "DELIVERED" }),
    order({ subOrderNo: "O2_1", sku: "SKU-A", reason: "RTO_COMPLETE" }),
  ];
  s.events = [
    event({ subOrderNo: "O1_1", transactionId: "T1", liveOrderStatus: "Delivered", finalSettlement: 400, tds: 10, tcs: 5 }),
    event({ subOrderNo: "O2_1", transactionId: "T2", liveOrderStatus: "RTO", finalSettlement: -50 }),
  ];
  s.purchases = [{ id: "P1", supplierName: "Acme", invoiceNo: "INV1", invoiceDate: "2026-05-01", totalAmount: 300, gstAmount: 0, paymentStatus: "pending", notes: "", items: [{ skuCode: "SKU-A", quantity: 3, unitCost: 100, gstRate: 5 }] }];
  return s;
}

describe("reconciliation → GL characterization", () => {
  const s = fixture();

  it("classifies orders as they do today", () => {
    const recon = reconcileAll(s).map((r) => ({ sub: r.subOrderNo, cls: r.currentClass, cum: r.cumulativeSettlement }));
    expect(recon).toEqual([
      { sub: "O1_1", cls: "DELIVERED", cum: 400 },
      { sub: "O2_1", cls: "RTO", cum: -50 },
    ]);
  });

  it("emits the same GL entries (delivered sale + TDS/TCS split, COGS, RTO loss, purchase)", () => {
    const gl = glEntries(s).map((e) => ({ id: e.id, d: e.debitCode, c: e.creditCode, amt: e.amount }));
    expect(gl).toEqual([
      { id: "sett:T1", d: "1000", c: "4000", amt: 400 }, // net cash in vs Sales
      { id: "tds:T1",  d: "1300", c: "4000", amt: 10 },  // TDS receivable vs Sales
      { id: "tcs:T1",  d: "1400", c: "4000", amt: 5 },   // TCS receivable vs Sales
      { id: "cogs:O1_1", d: "5000", c: "1200", amt: 100 }, // COGS recognised (delivered only)
      { id: "sett:T2", d: "5100", c: "1000", amt: 50 },  // RTO loss vs Cash
      { id: "purchase:P1", d: "1200", c: "2000", amt: 300 }, // Inventory vs AP (unpaid)
    ]);
    // RTO must NOT recognise COGS
    expect(gl.some((e) => e.id === "cogs:O2_1")).toBe(false);
  });

  it("produces the same trial balance", () => {
    const tb = trialBalance(glEntries(s)).filter((r) => r.debit || r.credit)
      .map((r) => ({ code: r.account.code, dr: r.debit, cr: r.credit, bal: r.balance }));
    expect(tb).toEqual([
      { code: "1000", dr: 400, cr: 50, bal: 350 },
      { code: "1200", dr: 300, cr: 100, bal: 200 },
      { code: "1300", dr: 10, cr: 0, bal: 10 },
      { code: "1400", dr: 5, cr: 0, bal: 5 },
      { code: "2000", dr: 0, cr: 300, bal: 300 },
      { code: "4000", dr: 0, cr: 415, bal: 415 },
      { code: "5000", dr: 100, cr: 0, bal: 100 },
      { code: "5100", dr: 50, cr: 0, bal: 50 },
    ]);
  });

  it("the whole projection balances (Σ debit = Σ credit = 865)", () => {
    const rows = trialBalance(glEntries(s));
    const dr = rows.reduce((n, r) => n + r.debit, 0);
    const cr = rows.reduce((n, r) => n + r.credit, 0);
    expect(dr).toBeCloseTo(865, 2);
    expect(cr).toBeCloseTo(865, 2);
    expect(ledgerNetsToZero(glEntries(s).map(glEntryToJournal))).toBe(true);
  });

  it("stored-ledger port preserves the derived trial balance exactly", () => {
    const gl = glEntries(s);
    const derived = trialBalance(gl);
    const stored = trialBalanceFromJournal(gl.map(glEntryToJournal));
    expect(trialBalanceBalances(stored)).toBe(true);
    for (let i = 0; i < derived.length; i++) {
      expect(stored[i].account.code).toBe(derived[i].account.code);
      expect(stored[i].balance).toBeCloseTo(derived[i].balance, 2);
    }
  });
});

describe("AP: bill -> payment posting", () => {
  const bal = (st: V2State, code: string) => trialBalance(glEntries(st)).find((r) => r.account.code === code)!.balance;

  it("a paid bill nets Inventory up / Cash down / AP zero", () => {
    const st = buildEmptyState();
    st.purchases = [{ id: "PP", supplierName: "Acme", invoiceNo: "B", invoiceDate: "2026-06-01", totalAmount: 1000, gstAmount: 0, paymentStatus: "paid", notes: "", items: [] }];
    expect(bal(st, "1200")).toBeCloseTo(1000, 2); // Inventory
    expect(bal(st, "1000")).toBeCloseTo(-1000, 2); // Cash out
    expect(bal(st, "2000")).toBeCloseTo(0, 2);     // AP settled
  });

  it("a pending bill leaves the amount in AP", () => {
    const st = buildEmptyState();
    st.purchases = [{ id: "PP", supplierName: "Acme", invoiceNo: "B", invoiceDate: "2026-06-01", totalAmount: 1000, gstAmount: 0, paymentStatus: "pending", notes: "", items: [] }];
    expect(bal(st, "2000")).toBeCloseTo(1000, 2); // AP outstanding
    expect(bal(st, "1000")).toBeCloseTo(0, 2);    // no cash moved
  });

  it("a discrete partial payment reduces AP by that amount", () => {
    const st = buildEmptyState();
    st.purchases = [{ id: "PP", supplierName: "Acme", invoiceNo: "B", invoiceDate: "2026-06-01", totalAmount: 1000, gstAmount: 0, paymentStatus: "partial", notes: "", items: [] }];
    st.billPayments = [{ id: "BP1", purchaseId: "PP", amount: 600, date: "2026-06-20" }];
    expect(bal(st, "2000")).toBeCloseTo(400, 2);  // 1000 bill - 600 paid
    expect(bal(st, "1000")).toBeCloseTo(-600, 2); // cash out
  });
});
