/**
 * Exact money primitives (Phase 12, spec §3.4).
 *
 * The engine historically represents rupees as JS numbers rounded to 2 dp
 * (round2 + MONEY_EPSILON), and the DB ledger uses numeric(14,2) — both exact
 * at the boundary. These integer-paise helpers give a drift-free arithmetic
 * substrate for new code and for an eventual engine migration, WITHOUT the
 * big-bang rewrite that would risk the Meesho golden master (§10).
 *
 * Rule: do arithmetic in integer paise, convert to rupees only at the edges.
 */

/** Rupees (2 dp) → integer paise. */
export function toPaise(rupees: number): number {
  return Math.round((rupees + Number.EPSILON * Math.sign(rupees)) * 100);
}

/** Integer paise → rupees (2 dp number). */
export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

/** Sum a list of rupee amounts exactly (via paise). */
export function sumMoney(rupees: number[]): number {
  return fromPaise(rupees.reduce((p, r) => p + toPaise(r), 0));
}

/** a − b, exact. */
export function subMoney(a: number, b: number): number {
  return fromPaise(toPaise(a) - toPaise(b));
}

/**
 * Split a total across n parts as evenly as possible in paise, distributing the
 * remainder one paisa at a time — the parts always sum back to the total
 * exactly (used for CGST/SGST halves, allocations, etc.).
 */
export function splitMoney(total: number, n: number): number[] {
  if (n <= 0) return [];
  const totalPaise = toPaise(total);
  const base = Math.trunc(totalPaise / n);
  let remainder = totalPaise - base * n; // signed
  const step = remainder >= 0 ? 1 : -1;
  remainder = Math.abs(remainder);
  return Array.from({ length: n }, (_, i) => fromPaise(base + (i < remainder ? step : 0)));
}

/** Allocate a total across weights proportionally, exact to the paisa. */
export function allocateMoney(total: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return weights.map(() => 0);
  const totalPaise = toPaise(total);
  const raw = weights.map((w) => (totalPaise * w) / totalWeight);
  const floored = raw.map((x) => Math.floor(x));
  let leftover = totalPaise - floored.reduce((s, x) => s + x, 0);
  // give the leftover paise to the largest fractional parts first
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floored];
  for (let k = 0; k < order.length && leftover > 0; k++) { out[order[k].i] += 1; leftover--; }
  return out.map(fromPaise);
}
