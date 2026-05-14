import { NextResponse } from "next/server";

import { getSupabaseRouteHandler } from "@/lib/supabase/server-admin";

export type AdminRole = "super_admin" | "editor";

export type AdminPrincipal = {
  id: string;
  email: string;
  role: AdminRole;
};

const BUILT_IN_SUPER_ADMIN_EMAILS = ["info@tulmin.com"];

const SUPER_ADMIN_EMAILS = new Set(
  [
    ...BUILT_IN_SUPER_ADMIN_EMAILS,
    ...(process.env.TULMIN_SUPER_ADMIN_EMAILS ?? process.env.TULMIN_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase()),
  ].filter(Boolean),
);

const EDITOR_EMAILS = new Set(
  (process.env.TULMIN_EDITOR_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function getConfiguredAdminRole(email: string): AdminRole | null {
  const normalized = email.trim().toLowerCase();
  if (SUPER_ADMIN_EMAILS.has(normalized)) return "super_admin";
  if (EDITOR_EMAILS.has(normalized)) return "editor";
  return null;
}

export function adminUnauthorized(message = "Admin authentication required.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function adminForbidden(message = "This account is not allowed to access Tulmin Admin.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireAdmin(request: Request): Promise<AdminPrincipal | NextResponse> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return adminUnauthorized();

  const supabase = getSupabaseRouteHandler();
  if (!supabase) return adminForbidden("Admin auth is not configured on this server.");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return adminUnauthorized("Invalid or expired admin session.");

  const role = getConfiguredAdminRole(data.user.email);
  if (!role) return adminForbidden();

  return {
    id: data.user.id,
    email: data.user.email,
    role,
  };
}

export function canPublish(role: AdminRole) {
  return role === "super_admin" || role === "editor";
}

export function canDelete(role: AdminRole) {
  return role === "super_admin";
}
