/** Derive a "YYYY-MM" label from the most common month in order dates. */
import { OrderRow, PaymentRow } from "./engine";

function monthOf(dateStr: string): string | null {
  if (!dateStr) return null;
  // ISO-ish "2026-05-03 ..." fast path
  const iso = dateStr.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  // dd/mm/yyyy or dd-mm-yyyy (Indian convention)
  const dmy = dateStr.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}`;
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

export function deriveMonthLabel(
  orders: OrderRow[],
  payments: PaymentRow[]
): string {
  const counts = new Map<string, number>();
  for (const r of orders) {
    const m = monthOf(r.orderDate);
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  if (!counts.size) {
    for (const r of payments) {
      const m = monthOf(r.orderDate);
      if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  let best = "";
  let bestN = 0;
  counts.forEach((n, m) => {
    if (n > bestN) { best = m; bestN = n; }
  });
  return best || new Date().toISOString().slice(0, 7);
}
