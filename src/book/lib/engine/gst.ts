/**
 * GST MODULE math (spec Part 9). Working summary only — the UI must show:
 * "Verify with your CA before filing — this is a working summary, not a
 * filing document."
 */

export const GST_SLABS = [0, 5, 12, 18, 28] as const;
export type GstSlab = (typeof GST_SLABS)[number];

export interface SaleForGst {
  skuCode: string;
  /** Gross sale value incl. GST (Total Sale Amount from the payment file). */
  grossValue: number;
  /** Product GST % from the payment file / SKU master. */
  gstRate: number;
}

export interface GstInputItem {
  description: string;
  gstAmount: number; // input credit from purchases / expenses with GST
}

export interface SlabSummary {
  rate: number;
  taxableValue: number;
  gstAmount: number;
}

export interface GstMonthlySummary {
  outputGst: number; // collected on sales
  outputBySlab: SlabSummary[];
  inputCredit: number; // from purchases + expenses
  netPayable: number; // output − input (floor 0 informationally)
  tcs: number; // marketplace-deducted, recoverable
  tds: number; // recoverable
}

/** Back out taxable value + GST from a GST-inclusive gross amount. */
export function splitInclusiveGst(grossValue: number, ratePct: number): {
  taxableValue: number;
  gstAmount: number;
} {
  if (ratePct <= 0) return { taxableValue: grossValue, gstAmount: 0 };
  const taxable = grossValue / (1 + ratePct / 100);
  return {
    taxableValue: Math.round(taxable * 100) / 100,
    gstAmount: Math.round((grossValue - taxable) * 100) / 100,
  };
}

export function gstMonthlySummary(
  sales: SaleForGst[],
  inputs: GstInputItem[],
  tcs: number,
  tds: number
): GstMonthlySummary {
  const bySlab = new Map<number, SlabSummary>();
  for (const s of sales) {
    // snap odd rates to the nearest statutory slab for reporting
    const rate = GST_SLABS.reduce((best, slab) =>
      Math.abs(slab - s.gstRate) < Math.abs(best - s.gstRate) ? slab : best, 0 as number);
    const { taxableValue, gstAmount } = splitInclusiveGst(s.grossValue, rate);
    const row = bySlab.get(rate) ?? { rate, taxableValue: 0, gstAmount: 0 };
    row.taxableValue += taxableValue;
    row.gstAmount += gstAmount;
    bySlab.set(rate, row);
  }
  const outputBySlab = Array.from(bySlab.values()).sort((a, b) => a.rate - b.rate);
  const outputGst = outputBySlab.reduce((s, r) => s + r.gstAmount, 0);
  const inputCredit = inputs.reduce((s, i) => s + i.gstAmount, 0);
  return {
    outputGst: Math.round(outputGst * 100) / 100,
    outputBySlab,
    inputCredit: Math.round(inputCredit * 100) / 100,
    netPayable: Math.round((outputGst - inputCredit) * 100) / 100,
    tcs,
    tds,
  };
}
