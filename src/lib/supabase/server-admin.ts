import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;
let cachedServiceRole: SupabaseClient | null | undefined;

/**
 * Optional server-side Supabase client (typically service role) for cron or trusted jobs only.
 * App UI talks to Supabase from the browser; RLS applies there — never expose service role keys in client bundles.
 */
export function getSupabaseRouteHandler(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key);
  return cached;
}

export function getSupabaseServiceRole(): SupabaseClient | null {
  if (cachedServiceRole !== undefined) return cachedServiceRole;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cachedServiceRole = null;
    return null;
  }
  cachedServiceRole = createClient(url, key);
  return cachedServiceRole;
}
