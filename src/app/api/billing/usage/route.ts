import { NextResponse, type NextRequest } from "next/server";

import {
  checkBillingRateLimit,
  getServerEntitlement,
  recordAbuseEvent,
  requestFingerprint,
  requireBillingUser,
  touchDeviceTrial,
} from "@/lib/billing/server";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type UsageAction = "filter" | "crop" | "export" | "import";

type UsageBody = {
  action?: UsageAction;
  labelCount?: number;
  allowPartial?: boolean;
  browser?: Record<string, unknown>;
};

type UsageReservationRow = {
  accepted_label_count?: number | null;
  rejected_label_count?: number | null;
  monthly_limit_hit?: boolean | null;
  daily_limit_hit?: boolean | null;
};

const LIMIT_EXHAUSTED_MESSAGE =
  "Your monthly label limit is exhausted. Upgrade your plan or buy more usage to continue.";

const DAILY_LIMIT_EXHAUSTED_MESSAGE =
  "You have used today's label allowance. Buy more labels or upgrade to continue processing now.";

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;
  const billingSb = getSupabaseServiceRole();
  if (!billingSb) {
    return NextResponse.json(
      {
        ok: false,
        reason: "server_unavailable",
        message:
          "Usage tracking is not configured. Add SUPABASE_SERVICE_ROLE_KEY so monthly label limits can be enforced securely.",
        setupHint:
          "Add SUPABASE_SERVICE_ROLE_KEY to your local and production environment variables, then restart or redeploy the app.",
      },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as UsageBody;
  const allowedAction = body.action === "crop" || body.action === "export" || body.action === "import";
  const action: UsageAction = allowedAction ? (body.action as UsageAction) : "filter";
  const labelCount = Math.max(0, Math.min(200000, Math.floor(Number(body.labelCount) || 0)));
  const allowPartial = body.allowPartial === true;
  const fp = requestFingerprint(req, body.browser);
  const rateLimit = checkBillingRateLimit(`usage:${auth.user.id}:${fp.deviceHash}`, 80, 60_000);
  if (!rateLimit.ok) {
    await recordAbuseEvent(billingSb, {
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

  const before = await getServerEntitlement(billingSb, auth.user.id, fp.deviceHash);
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

  const reservation = await billingSb.rpc("tulmin_reserve_usage_labels", {
    p_user_id: auth.user.id,
    p_action: action,
    p_requested_label_count: labelCount,
    p_allow_partial: allowPartial,
    p_month_key: before.monthKey,
    p_day_key: before.dayKey,
    p_monthly_limit: before.labelsLimit,
    p_daily_limit: before.dailyLabelsLimit,
    p_billing_period_key: before.monthKey,
    p_device_hash: fp.deviceHash,
    p_ip_hash: fp.ipHash,
    p_ua_hash: fp.uaHash,
    p_metadata: {},
  });

  if (reservation.error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "server_unavailable",
        message:
          "Usage could not be saved, so Tulmin stopped this run to protect your monthly label limit. Apply the latest billing migration and try again.",
        setupHint:
          "Run supabase/migrations/010_atomic_usage_reservations.sql against your Supabase project, then restart or redeploy the app.",
        entitlement: before,
        trackingError: reservation.error.message,
      },
      { status: 503 }
    );
  }

  const reservationRow = (
    Array.isArray(reservation.data) ? reservation.data[0] : reservation.data
  ) as UsageReservationRow | null;
  const acceptedLabelCount = Math.max(0, Number(reservationRow?.accepted_label_count) || 0);
  const rejectedLabelCount = Math.max(0, Number(reservationRow?.rejected_label_count) || 0);
  const monthlyLimitHit = Boolean(reservationRow?.monthly_limit_hit);
  const dailyLimitHit = Boolean(reservationRow?.daily_limit_hit);

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
    if (before.plan === "free") {
      await touchDeviceTrial(billingSb, auth.user.id, fp, acceptedLabelCount);
    }
  }

  const entitlement = await getServerEntitlement(billingSb, auth.user.id, fp.deviceHash);
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
