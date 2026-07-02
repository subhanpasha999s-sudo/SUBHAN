"use client";
/**
 * Ledger persistence — Supabase (per-org, RLS-scoped) via the shared browser
 * client + auth session, mirroring bookStateRemote.ts. Posting goes through the
 * post_journal_entry RPC so a header + its lines land in one transaction.
 */
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import type { CoaType } from "../engine/accounting";
import type { GlEntry } from "../engine/accounting";
import { glEntryToJournal, type JournalEntryInput } from "./journal";

async function authed() {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (!data.session?.user?.id) return null;
  return sb;
}

export async function isLedgerAuthed(): Promise<boolean> {
  return (await authed()) !== null;
}

/** Get-or-create the signed-in user's organization; returns its id or null. */
export async function ensureOrg(name = "My Business"): Promise<string | null> {
  const sb = await authed();
  if (!sb) return null;
  const { data, error } = await sb.rpc("ensure_org", { p_name: name });
  if (error) return null;
  return (data as string) ?? null;
}

/** Post one balanced journal entry via the transactional RPC. Idempotent on externalId. */
export async function postJournalEntry(
  orgId: string,
  entry: JournalEntryInput,
): Promise<{ ok: boolean; id?: string; message?: string }> {
  const sb = await authed();
  if (!sb) return { ok: false, message: "Not signed in." };
  const p_lines = entry.lines.map((l) => ({
    account_code: l.accountCode,
    debit: l.debit ?? 0,
    credit: l.credit ?? 0,
    memo: l.memo ?? null,
  }));
  const { data, error } = await sb.rpc("post_journal_entry", {
    p_org: orgId,
    p_entry_date: entry.entryDate,
    p_source_type: entry.sourceType,
    p_lines,
    p_memo: entry.memo ?? null,
    p_source_id: entry.sourceId ?? null,
    p_external_id: entry.externalId ?? null,
  });
  return error ? { ok: false, message: error.message } : { ok: true, id: data as string };
}

/** Post a batch of already-built journal entries (idempotent). */
export async function postJournalBatch(
  orgId: string,
  entries: JournalEntryInput[],
): Promise<{ posted: number; failed: number; firstError?: string }> {
  let posted = 0, failed = 0;
  let firstError: string | undefined;
  for (const e of entries) {
    const r = await postJournalEntry(orgId, e);
    if (r.ok) posted++;
    else { failed++; firstError ??= r.message; }
  }
  return { posted, failed, firstError };
}

/**
 * Port today's derived GL into the stored ledger (idempotent — safe to re-run).
 * Returns counts so the UI can report progress.
 */
export async function syncDerivedLedger(
  orgId: string,
  gl: GlEntry[],
): Promise<{ posted: number; failed: number; firstError?: string }> {
  return postJournalBatch(orgId, gl.map(glEntryToJournal));
}

// ── Phase 1: COA + accounting periods management ──────────────────────

export interface OrgAccount {
  id: string;
  code: string;
  name: string;
  type: CoaType;
  creditNormal: boolean;
  isSystem: boolean;
  archived: boolean;
}

export async function fetchAccounts(orgId: string): Promise<OrgAccount[]> {
  const sb = await authed();
  if (!sb) return [];
  const { data } = await sb
    .from("accounts")
    .select("id,code,name,type,credit_normal,is_system,archived")
    .eq("org_id", orgId)
    .order("code");
  return ((data ?? []) as Array<{ id: string; code: string; name: string; type: CoaType; credit_normal: boolean; is_system: boolean; archived: boolean }>)
    .map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, creditNormal: a.credit_normal, isSystem: a.is_system, archived: a.archived }));
}

const CREDIT_NORMAL_TYPES: CoaType[] = ["liability", "equity", "revenue"];

export async function addAccount(
  orgId: string,
  acc: { code: string; name: string; type: CoaType },
): Promise<{ ok: boolean; message?: string }> {
  const sb = await authed();
  if (!sb) return { ok: false, message: "Not signed in." };
  const { error } = await sb.from("accounts").insert({
    org_id: orgId,
    code: acc.code.trim(),
    name: acc.name.trim(),
    type: acc.type,
    credit_normal: CREDIT_NORMAL_TYPES.includes(acc.type),
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function setAccountArchived(
  orgId: string,
  accountId: string,
  archived: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const sb = await authed();
  if (!sb) return { ok: false, message: "Not signed in." };
  const { error } = await sb.from("accounts").update({ archived }).eq("org_id", orgId).eq("id", accountId);
  return error ? { ok: false, message: error.message } : { ok: true };
}

export interface OrgPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
}

export async function fetchPeriods(orgId: string): Promise<OrgPeriod[]> {
  const sb = await authed();
  if (!sb) return [];
  const { data } = await sb
    .from("accounting_periods")
    .select("id,name,start_date,end_date,status")
    .eq("org_id", orgId)
    .order("start_date");
  return ((data ?? []) as Array<{ id: string; name: string; start_date: string; end_date: string; status: "open" | "closed" }>)
    .map((p) => ({ id: p.id, name: p.name, startDate: p.start_date, endDate: p.end_date, status: p.status }));
}

/** Generate 12 monthly periods for an Indian fiscal year (Apr → Mar). */
export async function generateFiscalYear(
  orgId: string,
  startYear: number,
): Promise<{ ok: boolean; created: number; message?: string }> {
  const sb = await authed();
  if (!sb) return { ok: false, created: 0, message: "Not signed in." };
  const existing = new Set((await fetchPeriods(orgId)).map((p) => p.name));
  const rows = [];
  for (let m = 0; m < 12; m++) {
    const date = new Date(Date.UTC(startYear, 3 + m, 1)); // April = month index 3
    const y = date.getUTCFullYear();
    const mo = date.getUTCMonth();
    const name = `FY${startYear}-${String(y).slice(2)}·${date.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
    if (existing.has(name)) continue;
    const start = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(y, mo + 1, 0)).toISOString().slice(0, 10);
    rows.push({ org_id: orgId, name, start_date: start, end_date: end });
  }
  if (rows.length === 0) return { ok: true, created: 0 };
  const { error } = await sb.from("accounting_periods").insert(rows);
  return error ? { ok: false, created: 0, message: error.message } : { ok: true, created: rows.length };
}

export async function setPeriodStatus(
  orgId: string,
  periodId: string,
  status: "open" | "closed",
): Promise<{ ok: boolean; message?: string }> {
  const sb = await authed();
  if (!sb) return { ok: false, message: "Not signed in." };
  const { data: session } = await sb.auth.getSession();
  const patch = status === "closed"
    ? { status, closed_at: new Date().toISOString(), closed_by: session.session?.user?.id ?? null }
    : { status, closed_at: null, closed_by: null };
  const { error } = await sb.from("accounting_periods").update(patch).eq("org_id", orgId).eq("id", periodId);
  return error ? { ok: false, message: error.message } : { ok: true };
}

export interface StoredTrialBalanceRow {
  code: string;
  name: string;
  type: CoaType;
  creditNormal: boolean;
  debit: number;
  credit: number;
  balance: number;
}

/** Read the trial balance from the stored ledger for an org. */
export async function fetchStoredTrialBalance(orgId: string): Promise<StoredTrialBalanceRow[]> {
  const sb = await authed();
  if (!sb) return [];
  const [{ data: accts }, { data: lines }] = await Promise.all([
    sb.from("accounts").select("id,code,name,type,credit_normal").eq("org_id", orgId).order("code"),
    sb.from("journal_lines").select("account_id,debit,credit").eq("org_id", orgId),
  ]);
  const sums = new Map<string, { dr: number; cr: number }>();
  for (const l of (lines ?? []) as { account_id: string; debit: number; credit: number }[]) {
    const s = sums.get(l.account_id) ?? { dr: 0, cr: 0 };
    s.dr += Number(l.debit); s.cr += Number(l.credit);
    sums.set(l.account_id, s);
  }
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return ((accts ?? []) as { id: string; code: string; name: string; type: CoaType; credit_normal: boolean }[])
    .map((a) => {
      const s = sums.get(a.id) ?? { dr: 0, cr: 0 };
      const debit = round2(s.dr), credit = round2(s.cr);
      return {
        code: a.code, name: a.name, type: a.type, creditNormal: a.credit_normal,
        debit, credit,
        balance: a.credit_normal ? round2(credit - debit) : round2(debit - credit),
      };
    });
}
