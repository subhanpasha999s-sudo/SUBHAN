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
  allowPartial?: boolean;
  browser?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as UsageBody;
  const action = body.action === "export" ? "export" : "import";
  const labelCount = Math.max(0, Math.min(200000, Math.floor(Number(body.labelCount) || 0)));
  const allowPartial = body.allowPartial === true;
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

  const labelsRemaining =
    before.labelsLimit == null ? null : Math.max(0, before.labelsLimit - before.labelsUsed);
  const acceptedLabelCount =
    before.labelsLimit == null
      ? labelCount
      : allowPartial
        ? Math.min(labelCount, labelsRemaining ?? 0)
        : labelCount;
  const rejectedLabelCount = Math.max(0, labelCount - acceptedLabelCount);

  if (before.labelsLimit != null && before.labelsUsed + labelCount > before.labelsLimit && acceptedLabelCount <= 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: "limit_reached",
        message: "You have exhausted your available labels for this plan. Upgrade to continue processing more labels without interruption.",
        entitlement: before,
      },
      { status: 402 }
    );
  }

  if (acceptedLabelCount > 0) {
    const insert = await auth.sb.from("tulmin_usage_events").insert({
      user_id: auth.user.id,
      action,
      label_count: acceptedLabelCount,
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
      await touchDeviceTrial(auth.sb, auth.user.id, fp, acceptedLabelCount);
    }
  }

  const entitlement = await getServerEntitlement(auth.sb, auth.user.id, fp.deviceHash);
  return NextResponse.json({
    ok: true,
    entitlement,
    acceptedLabelCount,
    rejectedLabelCount,
    partial: rejectedLabelCount > 0,
    limitReached: rejectedLabelCount > 0,
    message:
      rejectedLabelCount > 0
        ? "You have exhausted your available labels for this plan. Upgrade to continue processing more labels without interruption."
        : undefined,
  });
}
