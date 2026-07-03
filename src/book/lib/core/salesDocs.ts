/**
 * Sales-document helpers (Phase 3) — pure date math for recurring invoices.
 * The store materializes due runs client-side (no server jobs); these
 * functions make that catch-up deterministic and testable.
 */

/** Day-of-month clamped to the target month's length (31st → Feb 28/29). */
function clampedDate(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
  return d.toISOString().slice(0, 10);
}

/** The next monthly occurrence after `fromIso`, honoring the schedule's day. */
export function advanceMonthly(fromIso: string, dayOfMonth: number): string {
  const d = new Date(`${fromIso}T00:00:00Z`);
  return clampedDate(d.getUTCFullYear(), d.getUTCMonth() + 1, dayOfMonth);
}

/** First occurrence of `dayOfMonth` on/after today — the initial nextRunDate. */
export function firstRunDate(todayIso: string, dayOfMonth: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  const thisMonth = clampedDate(d.getUTCFullYear(), d.getUTCMonth(), dayOfMonth);
  return thisMonth >= todayIso ? thisMonth : advanceMonthly(thisMonth, dayOfMonth);
}

// ── Payment reminders ─────────────────────────────────────────────────

export const REMINDER_INTERVAL_DAYS = 7;

export interface ReminderInvoice {
  status: "open" | "partial" | "paid";
  dueDate: string;
  amount: number;
  amountPaid: number;
  amountCredited?: number;
  lastReminderAt?: string;
}

export function invoiceOutstanding(i: ReminderInvoice): number {
  return Math.round((i.amount - i.amountPaid - (i.amountCredited ?? 0)) * 100) / 100;
}

export function daysOverdue(i: ReminderInvoice, todayIso: string): number {
  const ms = new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${i.dueDate}T00:00:00Z`).getTime();
  return Math.floor(ms / 86_400_000);
}

export function isOverdue(i: ReminderInvoice, todayIso: string): boolean {
  return i.status !== "paid" && invoiceOutstanding(i) > 0.005 && daysOverdue(i, todayIso) > 0;
}

/**
 * Raise a reminder for an overdue invoice at most once per interval —
 * repeated page loads never spam the notification feed.
 */
export function shouldRemind(
  i: ReminderInvoice,
  todayIso: string,
  intervalDays = REMINDER_INTERVAL_DAYS,
): boolean {
  if (!isOverdue(i, todayIso)) return false;
  if (!i.lastReminderAt) return true;
  const since = (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${i.lastReminderAt}T00:00:00Z`).getTime()) / 86_400_000;
  return since >= intervalDays;
}

/**
 * All due run dates from nextRunDate through today (inclusive), plus the new
 * nextRunDate. Capped so a corrupt date can't loop forever; each returned run
 * corresponds to exactly one invoice, which is what makes catch-up idempotent.
 */
export function computeDueRuns(
  nextRunDate: string,
  todayIso: string,
  dayOfMonth: number,
  cap = 24,
): { runs: string[]; nextRunDate: string } {
  const runs: string[] = [];
  let next = nextRunDate;
  while (next <= todayIso && runs.length < cap) {
    runs.push(next);
    next = advanceMonthly(next, dayOfMonth);
  }
  return { runs, nextRunDate: next };
}
