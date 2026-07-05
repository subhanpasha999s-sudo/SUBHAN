/**
 * GET  /api/v1/journal-entries — list posted entries with their lines.
 * POST /api/v1/journal-entries — post a balanced entry (write scope).
 *   body: { entryDate, memo?, sourceType?, sourceId?, externalId?,
 *           lines: [{ accountCode, debit?, credit?, memo? }] }
 * Posting goes through the post_journal_entry RPC (balanced + idempotent).
 */
import { authenticateApiRequest, requireScope, pagination, jsonError } from "@/lib/api/authenticate";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { ctx } = auth;
  const { limit, offset } = pagination(new URL(req.url));

  const { data: entries, error } = await ctx.db
    .from("journal_entries")
    .select("id, entry_date, memo, source_type, source_id, external_id, status, created_at")
    .eq("org_id", ctx.orgId)
    .order("entry_date", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return jsonError(500, error.message);

  const ids = (entries ?? []).map((e) => e.id);
  const { data: lines } = ids.length
    ? await ctx.db.from("journal_lines")
        .select("entry_id, account_id, debit, credit, memo, accounts(code, name)")
        .in("entry_id", ids)
    : { data: [] as unknown[] };

  const byEntry = new Map<string, unknown[]>();
  for (const l of (lines ?? []) as Array<{ entry_id: string; account_id: string; debit: number; credit: number; memo: string | null; accounts: { code: string; name: string } | null }>) {
    const list = byEntry.get(l.entry_id) ?? [];
    list.push({ accountCode: l.accounts?.code, accountName: l.accounts?.name, debit: Number(l.debit), credit: Number(l.credit), memo: l.memo });
    byEntry.set(l.entry_id, list);
  }

  return Response.json({
    data: (entries ?? []).map((e) => ({
      id: e.id, entryDate: e.entry_date, memo: e.memo, sourceType: e.source_type,
      sourceId: e.source_id, externalId: e.external_id, status: e.status,
      lines: byEntry.get(e.id) ?? [],
    })),
    limit, offset, count: entries?.length ?? 0,
  });
}

export async function POST(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { ctx } = auth;
  const scopeErr = requireScope(ctx, "write");
  if (scopeErr && !scopeErr.ok) return jsonError(scopeErr.status, scopeErr.error);

  let body: {
    entryDate?: string; memo?: string; sourceType?: string; sourceId?: string; externalId?: string;
    lines?: { accountCode: string; debit?: number; credit?: number; memo?: string }[];
  };
  try { body = await req.json(); }
  catch { return jsonError(400, "Body must be JSON."); }

  if (!body.entryDate || !Array.isArray(body.lines) || body.lines.length < 2) {
    return jsonError(422, "entryDate and at least two lines are required.");
  }

  const p_lines = body.lines.map((l) => ({
    account_code: l.accountCode, debit: l.debit ?? 0, credit: l.credit ?? 0, memo: l.memo ?? null,
  }));

  const { data, error } = await ctx.db.rpc("post_journal_entry", {
    p_org: ctx.orgId,
    p_entry_date: body.entryDate,
    p_source_type: body.sourceType ?? "manual",
    p_lines,
    p_memo: body.memo ?? null,
    p_source_id: body.sourceId ?? null,
    p_external_id: body.externalId ?? null,
  });

  if (error) return jsonError(422, error.message); // unbalanced / bad account / closed period
  return Response.json({ id: data as string }, { status: 201 });
}
