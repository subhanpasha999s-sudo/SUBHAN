/**
 * Full-organization backup (Phase 10, spec §5.10) — pure serialize/validate.
 *
 * The whole Book domain is one V2State object, so a backup is that object in a
 * versioned envelope. Restore validates the envelope shape before the store
 * replaces state, so a wrong/corrupt file can never silently wipe live data.
 */
import type { V2State } from "../v2/types";

export const BACKUP_FORMAT = "tulmin-book-backup";
export const BACKUP_VERSION = 1;

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: string;
  state: V2State;
}

/** A few required V2State keys used to sanity-check a restore payload. */
const REQUIRED_KEYS: (keyof V2State)[] = ["org", "skus", "orders", "events", "invoices", "purchases"];

export function buildBackup(state: V2State, app = "Tulmin Book"): BackupEnvelope {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), app, state };
}

export function serializeBackup(state: V2State): string {
  return JSON.stringify(buildBackup(state), null, 2);
}

export interface ParseResult {
  ok: boolean;
  state?: V2State;
  message?: string;
  /** True when the file is older than the current format version. */
  olderVersion?: boolean;
}

/** Parse + validate a backup file's text. Never throws. */
export function parseBackup(text: string): ParseResult {
  let env: unknown;
  try { env = JSON.parse(text); }
  catch { return { ok: false, message: "Not valid JSON." }; }

  if (!env || typeof env !== "object") return { ok: false, message: "Empty or malformed file." };
  const e = env as Partial<BackupEnvelope>;
  if (e.format !== BACKUP_FORMAT) return { ok: false, message: "This isn't a Tulmin Book backup file." };
  if (typeof e.version !== "number") return { ok: false, message: "Backup is missing a version." };
  if (e.version > BACKUP_VERSION) return { ok: false, message: `Backup is from a newer app version (${e.version}). Update the app first.` };
  if (!e.state || typeof e.state !== "object") return { ok: false, message: "Backup has no state." };

  const missing = REQUIRED_KEYS.filter((k) => !(k in (e.state as object)));
  if (missing.length) return { ok: false, message: `Backup is missing required data: ${missing.join(", ")}.` };

  return { ok: true, state: e.state as V2State, olderVersion: e.version < BACKUP_VERSION };
}

/** Rough record count for the "you're about to replace N records" confirmation. */
export function backupRecordCount(state: V2State): number {
  const arrays: (keyof V2State)[] = [
    "orders", "events", "invoices", "receipts", "creditNotes", "purchases",
    "billPayments", "expenses", "bankTxns", "skus", "customers", "vendors",
  ];
  return arrays.reduce((n, k) => n + (Array.isArray(state[k]) ? (state[k] as unknown[]).length : 0), 0);
}
