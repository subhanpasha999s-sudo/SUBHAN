"use client";
/**
 * Tulmin Book persistence — Supabase (per-user, RLS-scoped book_state row).
 * Reuses Tulmin's existing browser Supabase client + auth session, so Book
 * shares the same login. Falls back silently when signed out / unconfigured;
 * the store keeps a localStorage cache for offline + instant first paint.
 */
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import type { V2State } from "@/book/lib/v2/types";

async function authed() {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return null;
  return { sb, userId };
}

export async function isBookAuthed(): Promise<boolean> {
  return (await authed()) !== null;
}

/** Load this user's saved Book state, or null when absent / signed out. */
export async function loadBookState(): Promise<V2State | null> {
  const a = await authed();
  if (!a) return null;
  const { data, error } = await a.sb
    .from("book_state")
    .select("state")
    .eq("user_id", a.userId)
    .maybeSingle();
  if (error || !data) return null;
  const state = (data as { state?: unknown }).state;
  return state && typeof state === "object" ? (state as V2State) : null;
}

/** Upsert the whole Book state for the signed-in user. */
export async function saveBookState(state: V2State): Promise<{ ok: boolean; message?: string }> {
  const a = await authed();
  if (!a) return { ok: false, message: "Not signed in." };
  const { error } = await a.sb
    .from("book_state")
    .upsert(
      { user_id: a.userId, state, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  return error ? { ok: false, message: error.message } : { ok: true };
}
