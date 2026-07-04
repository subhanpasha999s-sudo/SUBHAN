/**
 * Settlement 2.0 (Phase 8, spec §7.2) — expected-vs-settled health checks and
 * the per-deduction-type breakdown, derived from reconciled orders.
 *
 * IMPORTANT: this module only OBSERVES. GL posting rules are pinned by the
 * characterization suite (MEESHO_RULES §4) and are not changed here. Meesho
 * publishes no fee schedule, so "expected" uses transparent heuristics with
 * configurable thresholds — every exception says why it fired.
 */
import type { ReconciledOrder } from "../engine";
import { isAffiliateFeeEvent, isClaimEvent } from "../engine";
import { round2 } from "./journal";

// ── Exceptions queue ──────────────────────────────────────────────────

export type ExceptionKind =
  | "MISSING_SETTLEMENT"    // delivered long ago, no payment events at all
  | "NEGATIVE_ON_DELIVERED" // delivered/exchange but the order NET is negative
  | "LOW_REALIZATION"       // delivered but settled far below the customer price
  | "UNMATCHED_PAYOUT";     // settlement lines with no matching order

export interface SettlementException {
  key: string;              // stable: kind:subOrderNo
  kind: ExceptionKind;
  subOrderNo: string;
  amount: number;           // the money at stake (positive)
  detail: string;           // human "why this fired"
}

export interface ExceptionOptions {
  today?: string;             // YYYY-MM-DD
  /** Days after order date before a silent delivered order is an exception. */
  graceDays?: number;         // default 45
  /** Fire LOW_REALIZATION when net < this % of the customer-paid price. */
  lowRealizationPct?: number; // default 40
}

function daysBetween(aIso: string, bIso: string): number {
  return Math.floor((new Date(`${bIso}T00:00:00Z`).getTime() - new Date(`${aIso}T00:00:00Z`).getTime()) / 86_400_000);
}

export function detectSettlementExceptions(
  reconciled: ReconciledOrder[],
  opts: ExceptionOptions = {},
): SettlementException[] {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const graceDays = opts.graceDays ?? 45;
  const lowPct = opts.lowRealizationPct ?? 40;
  const out: SettlementException[] = [];

  for (const r of reconciled) {
    // Payment-only records: money with no known order.
    if (!r.order) {
      const net = round2(r.cumulativeSettlement);
      if (Math.abs(net) > 0.005) {
        out.push({
          key: `UNMATCHED_PAYOUT:${r.subOrderNo}`,
          kind: "UNMATCHED_PAYOUT",
          subOrderNo: r.subOrderNo,
          amount: Math.abs(net),
          detail: `Settlement lines worth ${net} have no matching order — upload that month's order file or raise with Meesho.`,
        });
      }
      continue;
    }

    const delivered = r.currentClass === "DELIVERED" || r.currentClass === "EXCHANGE";
    if (!delivered) continue;

    const price = round2((r.order.discountedPrice || 0) * (r.order.quantity || 1));
    const net = round2(r.cumulativeSettlement);
    const age = r.order.orderDate ? daysBetween(r.order.orderDate.slice(0, 10), today) : 0;

    if (r.events.length === 0) {
      if (age > graceDays) {
        out.push({
          key: `MISSING_SETTLEMENT:${r.subOrderNo}`,
          kind: "MISSING_SETTLEMENT",
          subOrderNo: r.subOrderNo,
          amount: price,
          detail: `Delivered ${age} days ago, no settlement line yet (customer paid ${price}).`,
        });
      }
      continue;
    }

    if (net < -0.005) {
      out.push({
        key: `NEGATIVE_ON_DELIVERED:${r.subOrderNo}`,
        kind: "NEGATIVE_ON_DELIVERED",
        subOrderNo: r.subOrderNo,
        amount: Math.abs(net),
        detail: `Delivered order settled NEGATIVE (${net}) — deductions exceed the sale.`,
      });
      continue;
    }

    if (price > 0 && net > 0.005 && net < price * (lowPct / 100)) {
      out.push({
        key: `LOW_REALIZATION:${r.subOrderNo}`,
        kind: "LOW_REALIZATION",
        subOrderNo: r.subOrderNo,
        amount: round2(price - net),
        detail: `Settled ${net} on a ${price} sale (${Math.round((net / price) * 100)}% realization, threshold ${lowPct}%).`,
      });
    }
  }
  return out;
}

/** Persisted resolution for one exception key. */
export interface ExceptionResolution {
  key: string;
  action: "resolved" | "ignored";
  note?: string;
  at: string;
  by: string;
}

export function openExceptions(
  all: SettlementException[],
  resolutions: ExceptionResolution[],
): { open: SettlementException[]; resolvedCount: number } {
  const done = new Set(resolutions.map((r) => r.key));
  const open = all.filter((e) => !done.has(e.key));
  return { open, resolvedCount: all.length - open.length };
}

// ── Deduction breakdown (per month, payment-date basis) ──────────────

export interface DeductionMonth {
  month: string;        // YYYY-MM
  grossIn: number;      // positive settlements on status rows
  returnCharges: number;// negative settlements on status rows (as positive)
  platformFees: number; // blank-status negative lines (as positive)
  claimsIncome: number; // blank-status positive lines
  recovery: number;     // recovery column total
  tcs: number;
  tds: number;
  net: number;          // Σ finalSettlement
}

export function deductionBreakdown(reconciled: ReconciledOrder[]): DeductionMonth[] {
  const by = new Map<string, DeductionMonth>();
  const row = (m: string) => {
    const r = by.get(m) ?? { month: m, grossIn: 0, returnCharges: 0, platformFees: 0, claimsIncome: 0, recovery: 0, tcs: 0, tds: 0, net: 0 };
    by.set(m, r);
    return r;
  };
  for (const rec of reconciled) {
    for (const e of rec.events) {
      const m = (e.paymentDate || "").slice(0, 7) || e.monthBucket;
      if (!m) continue;
      const r = row(m);
      r.net = round2(r.net + e.finalSettlement);
      r.recovery = round2(r.recovery + (e.recovery || 0));
      r.tcs = round2(r.tcs + (e.tcs || 0));
      r.tds = round2(r.tds + (e.tds || 0));
      if (isAffiliateFeeEvent(e)) r.platformFees = round2(r.platformFees + -e.finalSettlement);
      else if (isClaimEvent(e)) r.claimsIncome = round2(r.claimsIncome + e.finalSettlement);
      else if (e.finalSettlement >= 0) r.grossIn = round2(r.grossIn + e.finalSettlement);
      else r.returnCharges = round2(r.returnCharges + -e.finalSettlement);
    }
  }
  return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
}
