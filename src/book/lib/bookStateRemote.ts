"use client";
/**
 * Tulmin Book persistence — Supabase (RLS-scoped book_state).
 *
 * Two workspace shapes:
 *  - OWNER: your own row (user_id = you), linked to your org via org_id.
 *  - STAFF: no own row needed — after redeeming an invite you're an
 *    organization_member, and RLS (migration 023) lets you read/update the
 *    owner's row. Your role comes from organization_members and overrides the
 *    in-blob demo role, so guard() enforces real permissions.
 *
 * Falls back silently when signed out / unconfigured; the store keeps a
 * localStorage cache for offline + instant first paint.
 */
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import type { Role, V2State } from "@/book/lib/v2/types";

async function authed() {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return null;
  return { sb, userId, email: data.session?.user?.email ?? undefined };
}

export async function isBookAuthed(): Promise<boolean> {
  return (await authed()) !== null;
}

export interface LoadedWorkspace {
  state: V2State;
  /** Set when this is a SHARED workspace you joined as staff. */
  shared?: { ownerUserId: string; myRole: Role; myEmail?: string };
}

/** The row (own or shared) this session saves to. */
let activeOwnerUserId: string | null = null;

/** Load this user's workspace: their own row, else a shared org row. */
export async function loadBookState(): Promise<LoadedWorkspace | null> {
  const a = await authed();
  if (!a) return null;

  // 1) Own workspace first.
  const own = await a.sb.from("book_state").select("state").eq("user_id", a.userId).maybeSingle();
  if (own.data?.state && typeof own.data.state === "object") {
    activeOwnerUserId = a.userId;
    return { state: own.data.state as V2State };
  }

  // 2) A shared workspace where I'm a member (via org membership RLS).
  const memberships = await a.sb
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", a.userId);
  for (const m of (memberships.data ?? []) as { org_id: string; role: Role }[]) {
    const sharedRow = await a.sb
      .from("book_state")
      .select("state, user_id")
      .eq("org_id", m.org_id)
      .neq("user_id", a.userId)
      .maybeSingle();
    if (sharedRow.data?.state && typeof sharedRow.data.state === "object") {
      activeOwnerUserId = sharedRow.data.user_id as string;
      return {
        state: sharedRow.data.state as V2State,
        shared: { ownerUserId: activeOwnerUserId, myRole: m.role, myEmail: a.email },
      };
    }
  }
  activeOwnerUserId = a.userId;
  return null;
}

/** Save the workspace — to the shared owner row when I'm staff, else my own. */
export async function saveBookState(state: V2State): Promise<{ ok: boolean; message?: string }> {
  const a = await authed();
  if (!a) return { ok: false, message: "Not signed in." };

  const target = activeOwnerUserId ?? a.userId;
  if (target !== a.userId) {
    // staff: update the owner's row in place (RLS member policy)
    const { error, count } = await a.sb
      .from("book_state")
      .update({ state, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("user_id", target);
    if (error) return { ok: false, message: error.message };
    if (!count) return { ok: false, message: "Workspace access was revoked." };
    return { ok: true };
  }

  // owner: upsert own row, linking it to the org so staff policies apply
  let orgId: string | null = null;
  try {
    const { data } = await a.sb.rpc("ensure_org", { p_name: state.org?.name || "My Business" });
    orgId = (data as string) ?? null;
  } catch { /* org linkage is best-effort; save must still succeed */ }

  const { error } = await a.sb
    .from("book_state")
    .upsert(
      { user_id: a.userId, org_id: orgId, state, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  return error ? { ok: false, message: error.message } : { ok: true };
}

// ── Staff management (owner side) + joining (staff side) ─────────────

export interface OrgMemberRow { userId: string; role: Role; email: string | null; isMe: boolean }
export interface OrgInviteRow { id: string; code: string; role: Role; usedAt: string | null; expiresAt: string }

export async function listOrgStaff(): Promise<{ members: OrgMemberRow[]; invites: OrgInviteRow[] } | null> {
  const a = await authed();
  if (!a) return null;
  const { data: orgId } = await a.sb.rpc("ensure_org", { p_name: "My Business" });
  if (!orgId) return null;
  const [members, invites] = await Promise.all([
    a.sb.from("organization_members").select("user_id, role, email").eq("org_id", orgId as string),
    a.sb.from("org_invites").select("id, code, role, used_at, expires_at").eq("org_id", orgId as string).order("created_at", { ascending: false }),
  ]);
  return {
    members: ((members.data ?? []) as { user_id: string; role: Role; email: string | null }[])
      .map((m) => ({ userId: m.user_id, role: m.role, email: m.email, isMe: m.user_id === a.userId })),
    invites: ((invites.data ?? []) as { id: string; code: string; role: Role; used_at: string | null; expires_at: string }[])
      .map((i) => ({ id: i.id, code: i.code, role: i.role, usedAt: i.used_at, expiresAt: i.expires_at })),
  };
}

export async function createStaffInvite(role: Exclude<Role, "owner">): Promise<{ ok: boolean; code?: string; message?: string }> {
  const a = await authed();
  if (!a) return { ok: false, message: "Sign in first." };
  const { data: orgId, error: orgErr } = await a.sb.rpc("ensure_org", { p_name: "My Business" });
  if (orgErr || !orgId) return { ok: false, message: orgErr?.message ?? "No organization." };
  const buf = new Uint8Array(9);
  globalThis.crypto.getRandomValues(buf);
  const code = "join-" + [...buf].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
  const { error } = await a.sb.from("org_invites").insert({ org_id: orgId as string, code, role, created_by: a.userId });
  return error ? { ok: false, message: error.message } : { ok: true, code };
}

export async function revokeStaffInvite(id: string): Promise<void> {
  const a = await authed();
  if (a) await a.sb.from("org_invites").delete().eq("id", id);
}

export async function joinWithInviteCode(code: string): Promise<{ ok: boolean; message?: string }> {
  const a = await authed();
  if (!a) return { ok: false, message: "Sign in with the staff account first." };
  const { error } = await a.sb.rpc("accept_org_invite", { p_code: code.trim() });
  return error ? { ok: false, message: error.message } : { ok: true };
}
