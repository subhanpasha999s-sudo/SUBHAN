"use client";
/**
 * API-key management (Phase 10) — browser client, RLS-scoped. Generates a key,
 * stores only its hash + prefix, and returns the plaintext ONCE for the user to
 * copy. Mirrors ledgerRemote's ensureOrg + browser-client pattern.
 */
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { ensureOrg } from "./ledgerRemote";
import { generateApiKey } from "./apiKeys";

async function authed() {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ? sb : null;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function isApiAuthed(): Promise<boolean> {
  return (await authed()) !== null;
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const sb = await authed();
  if (!sb) return [];
  const org = await ensureOrg();
  if (!org) return [];
  const { data } = await sb
    .from("api_keys")
    .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
    .eq("org_id", org)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Array<{ id: string; name: string; key_prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }>)
    .map((k) => ({ id: k.id, name: k.name, prefix: k.key_prefix, scopes: k.scopes, createdAt: k.created_at, lastUsedAt: k.last_used_at, revokedAt: k.revoked_at }));
}

/** Create a key; returns the plaintext once (never retrievable again). */
export async function createApiKey(
  name: string,
  scopes: ("read" | "write")[],
): Promise<{ ok: boolean; plaintext?: string; message?: string }> {
  const sb = await authed();
  if (!sb) return { ok: false, message: "Sign in to create API keys." };
  const org = await ensureOrg();
  if (!org) return { ok: false, message: "No organization." };
  const key = await generateApiKey();
  const { error } = await sb.from("api_keys").insert({
    org_id: org, name: name.trim() || "API key",
    key_prefix: key.prefix, key_hash: key.hash, scopes,
  });
  return error ? { ok: false, message: error.message } : { ok: true, plaintext: key.plaintext };
}

export async function revokeApiKey(id: string): Promise<{ ok: boolean; message?: string }> {
  const sb = await authed();
  if (!sb) return { ok: false, message: "Not signed in." };
  const { error } = await sb.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, message: error.message } : { ok: true };
}
