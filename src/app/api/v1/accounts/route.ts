/** GET /api/v1/accounts — the org's chart of accounts. */
import { authenticateApiRequest, pagination, jsonError } from "@/lib/api/authenticate";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { ctx } = auth;
  const { limit, offset } = pagination(new URL(req.url));

  const { data, error } = await ctx.db
    .from("accounts")
    .select("id, code, name, type, credit_normal, archived")
    .eq("org_id", ctx.orgId)
    .order("code")
    .range(offset, offset + limit - 1);

  if (error) return jsonError(500, error.message);
  return Response.json({
    data: (data ?? []).map((a) => ({
      id: a.id, code: a.code, name: a.name, type: a.type,
      creditNormal: a.credit_normal, archived: a.archived,
    })),
    limit, offset, count: data?.length ?? 0,
  });
}
