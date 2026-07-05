/**
 * GET /api/v1/trial-balance[?asOf=YYYY-MM-DD] — trial balance from the stored
 * ledger: per-account debit/credit totals + natural-sign balance, plus the
 * grand totals (which must be equal for a balanced ledger).
 */
import { authenticateApiRequest, jsonError } from "@/lib/api/authenticate";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { ctx } = auth;
  const asOf = new URL(req.url).searchParams.get("asOf") || undefined;

  const { data: accounts, error: accErr } = await ctx.db
    .from("accounts").select("id, code, name, type, credit_normal").eq("org_id", ctx.orgId).order("code");
  if (accErr) return jsonError(500, accErr.message);

  let lineQuery = ctx.db
    .from("journal_lines")
    .select("account_id, debit, credit, journal_entries!inner(entry_date, org_id)")
    .eq("org_id", ctx.orgId);
  if (asOf) lineQuery = lineQuery.lte("journal_entries.entry_date", asOf);
  const { data: lines, error: lineErr } = await lineQuery;
  if (lineErr) return jsonError(500, lineErr.message);

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const sums = new Map<string, { dr: number; cr: number }>();
  for (const l of (lines ?? []) as Array<{ account_id: string; debit: number; credit: number }>) {
    const s = sums.get(l.account_id) ?? { dr: 0, cr: 0 };
    s.dr += Number(l.debit); s.cr += Number(l.credit);
    sums.set(l.account_id, s);
  }

  let totalDebit = 0, totalCredit = 0;
  const rows = ((accounts ?? []) as Array<{ id: string; code: string; name: string; type: string; credit_normal: boolean }>)
    .map((a) => {
      const s = sums.get(a.id) ?? { dr: 0, cr: 0 };
      const debit = round2(s.dr), credit = round2(s.cr);
      totalDebit += debit; totalCredit += credit;
      return { code: a.code, name: a.name, type: a.type, debit, credit, balance: a.credit_normal ? round2(credit - debit) : round2(debit - credit) };
    })
    .filter((r) => r.debit || r.credit);

  return Response.json({
    asOf: asOf ?? null,
    rows,
    totals: { debit: round2(totalDebit), credit: round2(totalCredit), balanced: Math.abs(round2(totalDebit) - round2(totalCredit)) < 0.005 },
  });
}
