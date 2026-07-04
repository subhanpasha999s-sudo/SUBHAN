import { describe, it, expect } from "vitest";
import {
  gstStateCode, placeOfSupply, splitByPlace, gstr1B2C, hsnSummary,
  gstr3b, tcsTdsLedger, type Gstr1SaleRow,
} from "./gstPack";
import type { PaymentEvent } from "../engine";

describe("place of supply", () => {
  it("resolves state codes fuzzily (case, punctuation, aliases)", () => {
    expect(gstStateCode("Karnataka")).toBe("29");
    expect(gstStateCode("  MAHARASHTRA ")).toBe("27");
    expect(gstStateCode("Orissa")).toBe("21");        // alias → Odisha
    expect(gstStateCode("NCT of Delhi")).toBe("07");
    expect(gstStateCode("Atlantis")).toBeNull();
  });

  it("intra vs inter from org state vs buyer state", () => {
    expect(placeOfSupply("Karnataka", "Karnataka").interState).toBe(false);
    expect(placeOfSupply("Karnataka", "Delhi")).toMatchObject({ stateCode: "07", interState: true });
    // unknown buyer state defaults to inter-state (IGST), bucketed as OT
    expect(placeOfSupply("Karnataka", "??")).toMatchObject({ stateCode: "OT", interState: true });
    // org state unset → everything inter-state (conservative)
    expect(placeOfSupply(undefined, "Karnataka").interState).toBe(true);
  });

  it("splits CGST/SGST evenly intra-state incl. odd paise", () => {
    expect(splitByPlace(100, true)).toEqual({ cgst: 0, sgst: 0, igst: 100 });
    const s = splitByPlace(100.01, false);
    expect(s.cgst + s.sgst).toBeCloseTo(100.01, 2);
    expect(s.igst).toBe(0);
  });
});

describe("GSTR-1 B2C", () => {
  const org = "Karnataka";
  const rows: Gstr1SaleRow[] = [
    { buyerState: "Karnataka", grossInclusive: 1050, ratePct: 5, qty: 1, hsn: "6104" }, // intra: taxable 1000, gst 50 → 25/25
    { buyerState: "Delhi", grossInclusive: 525, ratePct: 5, qty: 1, hsn: "6104" },      // inter: taxable 500, gst 25 igst
    { buyerState: "Delhi", grossInclusive: 525, ratePct: 5, qty: 1, hsn: "6104", isReturn: true }, // full return nets Delhi to zero
    { buyerState: "Maharashtra", grossInclusive: 236, ratePct: 18, qty: 2, hsn: "3926" }, // taxable 200, igst 36
  ];
  const b2c = gstr1B2C(rows, org);

  it("nets by state × rate with returns subtracting", () => {
    const ka = b2c.find((r) => r.stateCode === "29")!;
    expect(ka).toMatchObject({ ratePct: 5, taxableValue: 1000, cgst: 25, sgst: 25, igst: 0, count: 1 });
    const dl = b2c.find((r) => r.stateCode === "07")!;
    expect(dl).toMatchObject({ taxableValue: 0, igst: 0, count: 0 }); // sale − return
    const mh = b2c.find((r) => r.stateCode === "27")!;
    expect(mh).toMatchObject({ ratePct: 18, taxableValue: 200, igst: 36, cgst: 0 });
  });

  it("HSN summary nets qty and values", () => {
    const hsn = hsnSummary(rows);
    const h6104 = hsn.find((h) => h.hsn === "6104")!;
    expect(h6104.qty).toBe(1);                 // 1 + 1 − 1 returned
    expect(h6104.taxableValue).toBe(1000);     // 1000 + 500 − 500
    const h3926 = hsn.find((h) => h.hsn === "3926")!;
    expect(h3926).toMatchObject({ qty: 2, taxableValue: 200, gstAmount: 36 });
  });

  it("GSTR-3B totals from the B2C table + ITC + TCS", () => {
    const s = gstr3b(b2c, 30, 12.5);
    expect(s.outwardTaxable).toBe(1200);       // 1000 + 0 + 200
    expect(s.igst).toBe(36);
    expect(s.cgst + s.sgst).toBe(50);
    expect(s.itc).toBe(30);
    expect(s.tcsCredit).toBe(12.5);
    expect(s.netPayable).toBe(56);             // 86 output − 30 ITC
  });

  it("netPayable floors at zero when ITC exceeds output", () => {
    expect(gstr3b(b2c, 999, 0).netPayable).toBe(0);
  });
});

describe("TCS/TDS credit ledger", () => {
  const ev = (paymentDate: string, tcs: number, tds: number): PaymentEvent => ({
    subOrderNo: "S", transactionId: "T", orderDate: "", eventDate: paymentDate, paymentDate,
    liveOrderStatus: "delivered", finalSettlement: 0, tcs, tds, claims: 0, compensation: 0,
    recovery: 0, sourceFile: "f", monthBucket: paymentDate.slice(0, 7),
  });

  it("accrues per month with running cumulative", () => {
    const led = tcsTdsLedger([
      ev("2026-05-15", 10, 20), ev("2026-05-20", 5, 0), ev("2026-06-10", 2.5, 7.5),
    ]);
    expect(led).toEqual([
      { month: "2026-05", marketplace: "Meesho", tcs: 15, tds: 20, cumTcs: 15, cumTds: 20 },
      { month: "2026-06", marketplace: "Meesho", tcs: 2.5, tds: 7.5, cumTcs: 17.5, cumTds: 27.5 },
    ]);
  });
});
