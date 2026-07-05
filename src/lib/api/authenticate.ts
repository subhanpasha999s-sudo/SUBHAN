/**
 * Public REST API authentication (Phase 10). A request carries an API key as a
 * bearer token; we hash it and look up a live api_keys row (service role, so it
 * bypasses RLS), returning the org_id + scopes. Every downstream query MUST
 * filter by that org_id — the API layer is the tenancy boundary here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";
import { bearerToken, hashApiKey } from "@/book/lib/core/apiKeys";

export interface ApiContext {
  orgId: string;
  scopes: string[];
  db: SupabaseClient;
  keyId: string;
}

export type AuthResult =
  | { ok: true; ctx: ApiContext }
  | { ok: false; status: number; error: string };

export async function authenticateApiRequest(req: Request): Promise<AuthResult> {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return { ok: false, status: 401, error: "Missing bearer API key." };

  const db = getSupabaseServiceRole();
  if (!db) return { ok: false, status: 503, error: "API backend not configured." };

  const hash = await hashApiKey(token);
  const { data, error } = await db
    .from("api_keys")
    .select("id, org_id, scopes, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: "Auth lookup failed." };
  if (!data || data.revoked_at) return { ok: false, status: 401, error: "Invalid or revoked API key." };

  // best-effort last-used stamp (don't block the request on it)
  void db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return { ok: true, ctx: { orgId: data.org_id, scopes: data.scopes ?? ["read"], db, keyId: data.id } };
}

export function requireScope(ctx: ApiContext, scope: "read" | "write"): AuthResult | null {
  if (ctx.scopes.includes(scope)) return null;
  return { ok: false, status: 403, error: `API key lacks '${scope}' scope.` };
}

/** Clamp a ?limit / ?offset pair from the query string. */
export function pagination(url: URL, defaultLimit = 100, maxLimit = 500): { limit: number; offset: number } {
  const limit = Math.min(maxLimit, Math.max(1, Number(url.searchParams.get("limit")) || defaultLimit));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  return { limit, offset };
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
