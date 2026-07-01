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
