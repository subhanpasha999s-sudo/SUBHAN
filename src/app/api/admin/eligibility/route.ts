import { NextResponse } from "next/server";

import { getAdminRole } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email) return NextResponse.json({ error: "Admin email is required." }, { status: 400 });

  const role = getAdminRole(email);
  if (!role) {
    return NextResponse.json(
      { allowed: false, error: "This email is not allowed to access Tulmin Admin." },
      { status: 403 },
    );
  }

  return NextResponse.json({ allowed: true, role });
}
