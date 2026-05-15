import { NextResponse } from "next/server";

import { getConfiguredAdminRole } from "@/lib/admin/blog-admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";

  if (!email) {
    return NextResponse.json({ error: "Admin email is required." }, { status: 400 });
  }

  const role = getConfiguredAdminRole(email);
  if (!role) {
    return NextResponse.json(
      {
        allowed: false,
        error: "This email is not allowed to access Tulmin Admin.",
        expectedOwner: "info@tulmin.com",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ allowed: true, role });
}
