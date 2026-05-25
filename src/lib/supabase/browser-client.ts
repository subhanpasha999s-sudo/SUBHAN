import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { normalizeSupabaseUrl } from "@/lib/supabase/url";

let cached: SupabaseClient | null | undefined;

/** Call after rotating env vars in dev Tools without restarting Electron/Cursor watchers */
export function resetSupabaseBrowserClient() {
  cached = undefined;
}

export function getSupabaseBrowser(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(normalizeSupabaseUrl(url), key);
  return cached;
}
