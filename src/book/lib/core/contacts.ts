/**
 * Contact helpers (Phase 2, upgrade spec §5.2) — pure functions for CSV
 * export/import and duplicate merge. Marketplace buyers stay out of contacts
 * by design (MEESHO_RULES); these cover B2B customers and vendors only.
 */
import type { Customer, Invoice, Vendor } from "../v2/types";

// ── CSV ───────────────────────────────────────────────────────────────

/** RFC-4180-style escaping: quote when a value contains comma/quote/newline. */
export function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: (string | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

export const CONTACT_CSV_HEADER = ["name", "gstin", "state", "phone", "email", "address", "notes"];

export function customersToCsv(customers: Customer[]): string {
  return toCsv(CONTACT_CSV_HEADER, customers.map((c) => [
    c.name, c.gstin, c.state, c.phone, c.email, c.address, c.notes,
  ]));
}

export function vendorsToCsv(vendors: Vendor[]): string {
  return toCsv(CONTACT_CSV_HEADER, vendors.map((v) => [
    v.name, v.gstin, v.state, v.contact, v.email, v.address, v.notes,
  ]));
}

/** One parsed import row (headers matched fuzzily by the caller-facing mapper). */
export interface ContactCsvRow {
  name: string;
  gstin?: string;
  state?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

/**
 * Map header-keyed CSV records (e.g. PapaParse `header: true` output) to
 * ContactCsvRows. Header matching is case/space-insensitive and accepts a few
 * synonyms; rows without a name are dropped.
 */
export function recordsToContactRows(records: Record<string, unknown>[]): ContactCsvRow[] {
  const out: ContactCsvRow[] = [];
  for (const rec of records) {
    const get = (...keys: string[]) => {
      for (const [k, v] of Object.entries(rec)) {
        const norm = k.toLowerCase().replace(/[^a-z]/g, "");
        if (keys.includes(norm)) {
          const s = String(v ?? "").trim();
          if (s) return s;
        }
      }
      return undefined;
    };
    const name = get("name", "customername", "vendorname", "suppliername", "contactname");
    if (!name) continue;
    out.push({
      name,
      gstin: get("gstin", "gstno", "gstnumber"),
      state: get("state", "customerstate", "placeofsupply"),
      phone: get("phone", "contact", "mobile", "phonenumber"),
      email: get("email", "emailid", "mail"),
      address: get("address", "billingaddress"),
      notes: get("notes", "note", "remarks"),
    });
  }
  return out;
}

// ── Dedupe & merge ────────────────────────────────────────────────────

export function normalizeContactName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Split incoming rows into fresh vs duplicates of existing names (fuzzy). */
export function dedupeByName<T extends { name: string }>(
  existing: { name: string }[],
  incoming: T[],
): { fresh: T[]; skippedDuplicates: number } {
  const seen = new Set(existing.map((e) => normalizeContactName(e.name)));
  const fresh: T[] = [];
  let skippedDuplicates = 0;
  for (const row of incoming) {
    const key = normalizeContactName(row.name);
    if (seen.has(key)) { skippedDuplicates++; continue; }
    seen.add(key);
    fresh.push(row);
  }
  return { fresh, skippedDuplicates };
}

/**
 * Merge a duplicate customer into the one being kept:
 *  - invoices of the duplicate are reassigned to the kept customer,
 *  - the kept record keeps its own values; empty optional fields are filled
 *    from the duplicate (no data silently overwritten),
 *  - the duplicate is removed.
 * Pure — returns the new arrays; the store persists them.
 */
export function mergeCustomerRecords(
  customers: Customer[],
  invoices: Invoice[],
  keepId: string,
  mergedId: string,
): { ok: boolean; message?: string; customers: Customer[]; invoices: Invoice[] } {
  if (keepId === mergedId) return { ok: false, message: "Pick two different customers.", customers, invoices };
  const keep = customers.find((c) => c.id === keepId);
  const merged = customers.find((c) => c.id === mergedId);
  if (!keep || !merged) return { ok: false, message: "Customer not found.", customers, invoices };

  const filled: Customer = { ...keep };
  for (const f of ["gstin", "state", "phone", "email", "address", "notes"] as const) {
    if (!filled[f] && merged[f]) filled[f] = merged[f];
  }
  return {
    ok: true,
    customers: customers.filter((c) => c.id !== mergedId).map((c) => (c.id === keepId ? filled : c)),
    invoices: invoices.map((i) => (i.customerId === mergedId ? { ...i, customerId: keepId } : i)),
  };
}

// ── Stock-adjustment reason codes (Phase 2 items polish) ─────────────
export const ADJUSTMENT_REASONS = [
  { code: "CORRECTION", label: "Count correction" },
  { code: "DAMAGED", label: "Damaged / unsellable" },
  { code: "LOST_THEFT", label: "Lost or theft" },
  { code: "FOUND", label: "Found stock" },
  { code: "SAMPLE_PROMO", label: "Sample / promotion" },
  { code: "OTHER", label: "Other (add note)" },
] as const;

export type AdjustmentReasonCode = (typeof ADJUSTMENT_REASONS)[number]["code"];

/** Reason string stored on the ledger event: "CODE" or "CODE — note". */
export function formatAdjustmentReason(code: AdjustmentReasonCode, note?: string): string {
  const n = (note ?? "").trim();
  return n ? `${code} — ${n}` : code;
}
