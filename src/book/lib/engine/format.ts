/** Indian-format currency / number helpers (₹1,23,456.78). */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat("en-IN");

export function formatINR(v: number, whole = false): string {
  if (!Number.isFinite(v)) v = 0;
  return (whole ? inrWhole : inr).format(v);
}

export function formatNum(v: number): string {
  return num.format(Number.isFinite(v) ? v : 0);
}

export function formatPct(v: number, digits = 1): string {
  return `${Number.isFinite(v) ? v.toFixed(digits) : "0.0"}%`;
}

/**
 * Compact Indian currency for chart axes / dense labels: ₹1.2L, ₹3.4Cr,
 * ₹85k, ₹420. Keeps sign. Lakhs/crores are the units Indian sellers read.
 */
export function formatINRCompact(v: number): string {
  if (!Number.isFinite(v)) v = 0;
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${sign}₹${Math.round(a)}`;
}
