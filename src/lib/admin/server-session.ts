import { cookies } from "next/headers";

import { getSupabaseRouteHandler } from "@/lib/supabase/server-admin";
import { ADMIN_SESSION_COOKIE, getAdminRole, type AdminPrincipal } from "@/lib/admin/auth";

export async function getAdminFromSessionCookie(): Promise<AdminPrincipal | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = getSupabaseRouteHandler();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return null;

  const role = getAdminRole(data.user.email);
  if (!role) return null;

  return {
    id: data.user.id,
    email: data.user.email,
    role,
  };
}
