/**
 * Receivables / Payables aging (Phases 3 & 4). Pure — buckets outstanding
 * documents by how overdue they are as of a date. Used by AR/AP aging reports.
 */
import { round2 } from "./journal";

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGING_BUCKETS: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export interface AgingItem { dueDate: string; outstanding: number }
export interface AgingRow { bucket: AgingBucket; amount: number; count: number }

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / 86_400_000);
}

export function bucketFor(dueDate: string, asOf: string): AgingBucket {
  const overdue = daysBetween(dueDate, asOf); // >0 means past due
  if (overdue <= 0) return "current";
  if (overdue <= 30) return "1-30";
  if (overdue <= 60) return "31-60";
  if (overdue <= 90) return "61-90";
  return "90+";
}

export function aging(items: AgingItem[], asOf: string): AgingRow[] {
  const acc = new Map<AgingBucket, { amount: number; count: number }>();
  for (const b of AGING_BUCKETS) acc.set(b, { amount: 0, count: 0 });
  for (const it of items) {
    if (Math.abs(it.outstanding) < 0.005) continue;
    const row = acc.get(bucketFor(it.dueDate, asOf))!;
    row.amount += it.outstanding;
    row.count += 1;
  }
  return AGING_BUCKETS.map((bucket) => ({ bucket, amount: round2(acc.get(bucket)!.amount), count: acc.get(bucket)!.count }));
}

export function agingTotal(rows: AgingRow[]): number {
  return round2(rows.reduce((s, r) => s + r.amount, 0));
}
