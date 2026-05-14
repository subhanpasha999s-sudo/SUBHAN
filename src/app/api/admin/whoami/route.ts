import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin/blog-admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({
    allowed: true,
    email: admin.email,
    role: admin.role,
    expectedOwner: "info@tulmin.com",
    error: null,
  });
}
