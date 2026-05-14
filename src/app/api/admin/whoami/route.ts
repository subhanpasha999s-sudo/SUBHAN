import { NextResponse } from "next/server";

import { getConfiguredAdminRole } from "@/lib/admin/blog-admin-auth";
import { getSupabaseRouteHandler } from "@/lib/supabase/server-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ allowed: false, error: "Admin session required." }, { status: 401 });
  }

  const supabase = getSupabaseRouteHandler();
  if (!supabase) {
    return NextResponse.json(
      { allowed: false, error: "Admin auth is not configured on this server." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.trim().toLowerCase() ?? "";
  if (error || !email) {
    return NextResponse.json(
      { allowed: false, error: "Invalid or expired admin session." },
      { status: 401 },
    );
  }

  const role = getConfiguredAdminRole(email);
  return NextResponse.json({
    allowed: Boolean(role),
    email,
    role,
    expectedOwner: "info@tulmin.com",
    error: role ? null : `Logged in as ${email}, but this email is not allowed for Tulmin Admin.`,
  }, { status: role ? 200 : 403 });
}
