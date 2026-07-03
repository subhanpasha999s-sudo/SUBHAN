import { describe, it, expect } from "vitest";
import { advanceMonthly, firstRunDate, computeDueRuns } from "./salesDocs";

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
