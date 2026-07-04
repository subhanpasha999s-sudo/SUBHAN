import { describe, it, expect } from "vitest";
import { buildEmptyState } from "../v2/emptyState";
import {
  serializeBackup, parseBackup, buildBackup, backupRecordCount,
  BACKUP_FORMAT, BACKUP_VERSION,
} from "./backup";

describe("backup round-trip", () => {
  it("serializes to a versioned envelope and parses back to the same state", () => {
    const state = buildEmptyState();
    state.org.name = "Round Trip Traders";
    state.invoices = [{ id: "I1", customerId: "c", number: "INV-1", amount: 100, amountPaid: 0, invoiceDate: "2026-06-01", dueDate: "2026-06-15", status: "open" }];

    const text = serializeBackup(state);
    const env = JSON.parse(text);
    expect(env.format).toBe(BACKUP_FORMAT);
    expect(env.version).toBe(BACKUP_VERSION);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.state!.org.name).toBe("Round Trip Traders");
    expect(parsed.state!.invoices).toHaveLength(1);
  });

  it("counts records for the replace confirmation", () => {
    const state = buildEmptyState();
    state.orders = [{} as never, {} as never];
    state.invoices = [{} as never];
    expect(backupRecordCount(state)).toBe(3);
  });
});

describe("restore validation (never throws, never silently wipes)", () => {
  it("rejects non-JSON", () => {
    expect(parseBackup("not json").ok).toBe(false);
  });
  it("rejects a foreign JSON file", () => {
    const r = parseBackup(JSON.stringify({ hello: "world" }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/isn't a Tulmin Book backup/);
  });
  it("rejects a newer-version backup", () => {
    const env = buildBackup(buildEmptyState());
    const r = parseBackup(JSON.stringify({ ...env, version: BACKUP_VERSION + 1 }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/newer app version/);
  });
  it("rejects a backup missing required state keys", () => {
    const r = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, state: { org: {} } }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/missing required data/);
  });
  it("accepts a valid backup and flags older versions", () => {
    const env = buildBackup(buildEmptyState());
    expect(parseBackup(JSON.stringify(env)).ok).toBe(true);
    // v1 is current, so olderVersion is false
    expect(parseBackup(JSON.stringify(env)).olderVersion).toBe(false);
  });
});
