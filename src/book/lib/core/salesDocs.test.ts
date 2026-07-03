import { describe, it, expect } from "vitest";
import {
  advanceMonthly, firstRunDate, computeDueRuns,
  isOverdue, shouldRemind, daysOverdue, invoiceOutstanding,
} from "./salesDocs";

const inv = (over: Partial<Parameters<typeof isOverdue>[0]> = {}) => ({
  status: "open" as const, dueDate: "2026-06-20", amount: 1000, amountPaid: 0, ...over,
});

describe("payment reminders", () => {
  const today = "2026-07-03";

  it("overdue = past due, unpaid, with outstanding (credits count)", () => {
    expect(isOverdue(inv(), today)).toBe(true);
    expect(daysOverdue(inv(), today)).toBe(13);
    expect(isOverdue(inv({ status: "paid" }), today)).toBe(false);
    expect(isOverdue(inv({ dueDate: "2026-07-10" }), today)).toBe(false);       // not yet due
    expect(isOverdue(inv({ dueDate: today }), today)).toBe(false);              // due today ≠ overdue
    expect(isOverdue(inv({ amountPaid: 600, amountCredited: 400 }), today)).toBe(false); // settled
    expect(invoiceOutstanding(inv({ amountPaid: 300, amountCredited: 200 }))).toBe(500);
  });

  it("reminds once per interval, not on every page load", () => {
    expect(shouldRemind(inv(), today)).toBe(true);                                // never reminded
    expect(shouldRemind(inv({ lastReminderAt: "2026-07-01" }), today)).toBe(false); // 2 days ago
    expect(shouldRemind(inv({ lastReminderAt: "2026-06-26" }), today)).toBe(true);  // 7 days ago
    expect(shouldRemind(inv({ status: "paid", lastReminderAt: undefined }), today)).toBe(false);
  });
});

describe("advanceMonthly", () => {
  it("advances to the same day next month", () => {
    expect(advanceMonthly("2026-01-15", 15)).toBe("2026-02-15");
  });
  it("clamps day 31 to short months and recovers", () => {
    expect(advanceMonthly("2026-01-31", 31)).toBe("2026-02-28");
    expect(advanceMonthly("2026-02-28", 31)).toBe("2026-03-31");
  });
  it("crosses year end", () => {
    expect(advanceMonthly("2026-12-05", 5)).toBe("2027-01-05");
  });
});

describe("firstRunDate", () => {
  it("uses this month when the day is still ahead (or today)", () => {
    expect(firstRunDate("2026-07-03", 15)).toBe("2026-07-15");
    expect(firstRunDate("2026-07-03", 3)).toBe("2026-07-03");
  });
  it("rolls to next month when the day already passed", () => {
    expect(firstRunDate("2026-07-20", 15)).toBe("2026-08-15");
  });
});

describe("computeDueRuns", () => {
  it("returns nothing when the schedule is in the future", () => {
    const r = computeDueRuns("2026-08-01", "2026-07-03", 1);
    expect(r.runs).toEqual([]);
    expect(r.nextRunDate).toBe("2026-08-01");
  });
  it("catches up every missed month exactly once", () => {
    const r = computeDueRuns("2026-04-10", "2026-07-03", 10);
    expect(r.runs).toEqual(["2026-04-10", "2026-05-10", "2026-06-10"]);
    expect(r.nextRunDate).toBe("2026-07-10");
  });
  it("includes a run due today and caps runaway loops", () => {
    const today = computeDueRuns("2026-07-03", "2026-07-03", 3);
    expect(today.runs).toEqual(["2026-07-03"]);
    const capped = computeDueRuns("2000-01-01", "2026-07-03", 1, 24);
    expect(capped.runs).toHaveLength(24);
  });
});
