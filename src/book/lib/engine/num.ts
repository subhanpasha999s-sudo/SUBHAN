/** Number / string coercion helpers with explicit NaN guards. */

/** Fee/amount columns: blank or unparseable ⇒ 0. */
export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Status columns: blank ⇒ null. Blank status is MEANINGFUL — it drives
 * Classes F and G — so it must stay distinguishable from any real status.
 */
export function toStatus(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Sub Order Nos are strings end-to-end — parsing as number loses precision. */
export function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
