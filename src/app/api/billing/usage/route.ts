import { NextResponse, type NextRequest } from "next/server";

import {
  currentMonthKey,
  getServerEntitlement,
  requestFingerprint,
  requireBillingUser,
  touchDeviceTrial,
} from "@/lib/billing/server";

type UsageBody = {
  action?: "import" | "export";
  labelCount?: number;
  browser?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as UsageBody;
  const action = body.action === "export" ? "export" : "import";
  const labelCount = Math.max(0, Math.min(200000, Math.floor(Number(body.labelCount) || 0)));
  const fp = requestFingerprint(req, body.browser);

  const before = await getServerEntitlement(auth.sb, auth.user.id, fp.deviceHash);
  if (before.abuseReview) {
    return NextResponse.json(
      {
        ok: false,
        reason: "abuse_review",
        message:
          "This device has already used multiple free trials. Please upgrade or contact support to continue.",
        entitlement: before,
      },
      { status: 429 }
    );
  }

  if (before.labelsLimit != null && before.labelsUsed + labelCount > before.labelsLimit) {
    return NextResponse.json(
      {
        ok: false,
        reason: "limit_reached",
        message: `${before.labelsUsed.toLocaleString()} of ${before.labelsLimit.toLocaleString()} free labels used. Upgrade to keep today’s dispatch moving.`,
        entitlement: before,
      },
      { status: 402 }
    );
  }

  if (labelCount > 0) {
    const insert = await auth.sb.from("tulmin_usage_events").insert({
      user_id: auth.user.id,
      action,
      label_count: labelCount,
      month_key: currentMonthKey(),
      device_hash: fp.deviceHash,
      ip_hash: fp.ipHash,
      ua_hash: fp.uaHash,
    });

    if (insert.error) {
      return NextResponse.json(
        {
          ok: false,
          reason: "server_unavailable",
          message:
            "Usage validation is not ready yet. Please apply the billing migration and try again.",
        },
        { status: 503 }
      );
    }

    if (before.plan === "free") {
      await touchDeviceTrial(auth.sb, auth.user.id, fp, labelCount);
    }
  }

  const entitlement = await getServerEntitlement(auth.sb, auth.user.id, fp.deviceHash);
  return NextResponse.json({ ok: true, entitlement });
}
