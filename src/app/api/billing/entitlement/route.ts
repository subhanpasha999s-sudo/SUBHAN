import { NextResponse, type NextRequest } from "next/server";

import {
  getServerEntitlement,
  requestFingerprint,
  requireBillingUser,
} from "@/lib/billing/server";

export async function GET(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;

  const browser = Object.fromEntries(req.nextUrl.searchParams.entries());
  const fp = requestFingerprint(req, browser);
  const entitlement = await getServerEntitlement(auth.sb, auth.user.id, fp.deviceHash);

  return NextResponse.json({ entitlement });
}
