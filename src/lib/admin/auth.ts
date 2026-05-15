import { NextResponse } from "next/server";

import { getSupabaseRouteHandler } from "@/lib/supabase/server-admin";

export const ADMIN_SESSION_COOKIE = "tulmin_admin_token";

export type AdminRole = "super_admin" | "editor";

export type AdminPrincipal = {
  id: string;
  email: string;
  role: AdminRole;
};

const BUILT_IN_ADMINS = ["info@tulmin.com", "admin@tulmin.com"];

const SUPER_ADMINS = new Set(
  [
    ...BUILT_IN_ADMINS,
    ...(process.env.TULMIN_SUPER_ADMIN_EMAILS ?? process.env.TULMIN_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase()),
  ].filter(Boolean),
);

const EDITORS = new Set(
  (process.env.TULMIN_EDITOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return "";
  return (
    cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

export function getAdminRole(email: string): AdminRole | null {
  const normalized = email.trim().toLowerCase();
  if (SUPER_ADMINS.has(normalized)) return "super_admin";
  if (EDITORS.has(normalized)) return "editor";
  return null;
}

export function adminUnauthorized(message = "Admin authentication required.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function adminForbidden(message = "This email is not allowed to access Tulmin Admin.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireAdmin(request: Request): Promise<AdminPrincipal | NextResponse> {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    decodeURIComponent(readCookie(request, ADMIN_SESSION_COOKIE));

  if (!token) return adminUnauthorized();

  const supabase = getSupabaseRouteHandler();
  if (!supabase) return adminForbidden("Admin auth is not configured on this server.");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) {
    return adminUnauthorized("Invalid or expired admin session.");
  }

  const role = getAdminRole(data.user.email);
  if (!role) return adminForbidden(`This email is not allowed to access Tulmin Admin: ${data.user.email}`);

  return {
    id: data.user.id,
    email: data.user.email,
    role,
  };
}
