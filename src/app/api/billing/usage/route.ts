import { NextResponse, type NextRequest } from "next/server";

import {
  checkBillingRateLimit,
  currentMonthKey,
  getServerEntitlement,
  recordAbuseEvent,
  requestFingerprint,
  requireBillingUser,
  touchDeviceTrial,
} from "@/lib/billing/server";
import type { ServerEntitlement } from "@/lib/billing/server";

type UsageAction = "filter" | "crop" | "export" | "import";

type UsageBody = {
  action?: UsageAction;
  labelCount?: number;
  allowPartial?: boolean;
  browser?: Record<string, unknown>;
};

const LIMIT_EXHAUSTED_MESSAGE =
  "Your monthly label limit is exhausted. Upgrade your plan or buy more usage to continue.";

const DAILY_LIMIT_EXHAUSTED_MESSAGE =
  "You have used today's label allowance. Buy more labels or upgrade to continue processing now.";

function projectEntitlementUsage(
  entitlement: ServerEntitlement,
  acceptedLabelCount: number
): ServerEntitlement {
  const nextLabelsUsed = entitlement.labelsUsed + acceptedLabelCount;
  const nextDailyLabelsUsed = entitlement.dailyLabelsUsed + acceptedLabelCount;
  return {
    ...entitlement,
    labelsUsed: nextLabelsUsed,
    labelsRemaining:
      entitlement.labelsLimit == null
        ? null
        : Math.max(0, entitlement.labelsLimit - nextLabelsUsed),
    dailyLabelsUsed: nextDailyLabelsUsed,
    dailyLabelsRemaining:
      entitlement.dailyLabelsLimit == null
        ? null
        : Math.max(0, entitlement.dailyLabelsLimit - nextDailyLabelsUsed),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as UsageBody;
  const allowedAction = body.action === "crop" || body.action === "export" || body.action === "import";
  const action: UsageAction = allowedAction ? (body.action as UsageAction) : "filter";
  const labelCount = Math.max(0, Math.min(200000, Math.floor(Number(body.labelCount) || 0)));
  const allowPartial = body.allowPartial === true;
  const fp = requestFingerprint(req, body.browser);
  const rateLimit = checkBillingRateLimit(`usage:${auth.user.id}:${fp.deviceHash}`, 80, 60_000);
  if (!rateLimit.ok) {
    await recordAbuseEvent(auth.sb, {
      userId: auth.user.id,
      deviceHash: fp.deviceHash,
      ipHash: fp.ipHash,
      uaHash: fp.uaHash,
      riskScore: 40,
      reason: "usage_rate_limit",
      metadata: { action, labelCount, retryAfterSeconds: rateLimit.retryAfterSeconds },
    });
    return NextResponse.json(
      {
        ok: false,
        reason: "abuse_review",
        message: "Too many processing attempts. Please wait a moment and try again.",
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const before = await getServerEntitlement(auth.sb, auth.user.id, fp.deviceHash);
  if (before.abuseReview) {
    return NextResponse.json(
      {
        ok: false,
        reason: "abuse_review",
        message:
          before.blockedUntil
            ? "This device is temporarily limited because free trial usage looks unusual. Upgrade or contact support to continue."
            : "This device has already used multiple free trials. Please upgrade or contact support to continue.",
        entitlement: before,
      },
      { status: 429 }
    );
  }

  if (labelCount <= 0) {
    return NextResponse.json({
      ok: true,
      entitlement: before,
      acceptedLabelCount: 0,
      rejectedLabelCount: 0,
    });
  }

  const labelsRemaining =
    before.labelsLimit == null ? null : Math.max(0, before.labelsLimit - before.labelsUsed);
  const dailyLabelsRemaining =
    before.dailyLabelsLimit == null
      ? null
      : Math.max(0, before.dailyLabelsLimit - before.dailyLabelsUsed);
  const effectiveRemaining =
    labelsRemaining == null && dailyLabelsRemaining == null
      ? null
      : Math.min(labelsRemaining ?? Number.POSITIVE_INFINITY, dailyLabelsRemaining ?? Number.POSITIVE_INFINITY);
  const acceptedLabelCount =
    effectiveRemaining == null
      ? labelCount
      : allowPartial
        ? Math.min(labelCount, effectiveRemaining)
        : labelCount > effectiveRemaining
          ? 0
          : labelCount;
  const rejectedLabelCount = Math.max(0, labelCount - acceptedLabelCount);
  const monthlyLimitHit = labelsRemaining != null && labelCount > labelsRemaining;
  const dailyLimitHit = dailyLabelsRemaining != null && labelCount > dailyLabelsRemaining;

  if ((monthlyLimitHit || dailyLimitHit) && acceptedLabelCount <= 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: "limit_reached",
        message: dailyLimitHit ? DAILY_LIMIT_EXHAUSTED_MESSAGE : LIMIT_EXHAUSTED_MESSAGE,
        entitlement: before,
      },
      { status: 402 }
    );
  }

  if (acceptedLabelCount > 0) {
    const insertPayload = {
      user_id: auth.user.id,
      action,
      label_count: acceptedLabelCount,
      month_key: currentMonthKey(),
      billing_period_key: before.monthKey,
      device_hash: fp.deviceHash,
      ip_hash: fp.ipHash,
      ua_hash: fp.uaHash,
      metadata: {
        requestedLabelCount: labelCount,
        rejectedLabelCount,
        allowPartial,
      },
    };
    const insert = await auth.sb.from("tulmin_usage_events").insert(insertPayload);

    if (insert.error) {
      const legacyInsert = await auth.sb.from("tulmin_usage_events").insert({
        user_id: auth.user.id,
        action: action === "export" ? "export" : "import",
        label_count: acceptedLabelCount,
        month_key: currentMonthKey(),
        device_hash: fp.deviceHash,
        ip_hash: fp.ipHash,
        ua_hash: fp.uaHash,
      });

      if (legacyInsert.error) {
        if (before.plan === "free") {
          await touchDeviceTrial(auth.sb, auth.user.id, fp, acceptedLabelCount);
        }
        const projectedEntitlement = projectEntitlementUsage(before, acceptedLabelCount);
        return NextResponse.json({
          ok: true,
          entitlement: projectedEntitlement,
          acceptedLabelCount,
          rejectedLabelCount,
          partial: rejectedLabelCount > 0,
          limitReached: rejectedLabelCount > 0,
          trackingUnavailable: true,
          message:
            "Usage was reserved for this run, but the billing migration must be applied so the count persists after refresh.",
        });
      }
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
        ? dailyLimitHit
          ? DAILY_LIMIT_EXHAUSTED_MESSAGE
          : LIMIT_EXHAUSTED_MESSAGE
        : undefined,
  });
}
