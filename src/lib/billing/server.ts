import { createHash } from "node:crypto";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  TULMIN_PLAN_BY_ID,
  type TulminPlanId,
} from "@/lib/billing/plans";
import { getSupabaseRouteHandler } from "@/lib/supabase/server-admin";

export type ServerEntitlement = {
  plan: TulminPlanId;
  status: "active" | "trialing" | "free" | "past_due";
  labelsUsed: number;
  labelsLimit: number | null;
  baseLabelsLimit?: number | null;
  bonusLabelsAvailable?: number;
  labelsRemaining: number | null;
  dailyLabelsUsed: number;
  dailyLabelsLimit: number | null;
  dailyLabelsRemaining: number | null;
  monthKey: string;
  dayKey: string;
  abuseReview: boolean;
  riskScore?: number;
  blockedUntil?: string | null;
  loaded: boolean;
};

export function currentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sha(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

type DynamicPlanSetting = {
  enabled?: boolean | null;
  label_limit?: number | null;
  daily_limit?: number | null;
};

type UsageTotalsRow = {
  labels_used?: number | null;
  daily_labels_used?: number | null;
};

type RateLimitRow = {
  ok?: boolean | null;
  retry_after_seconds?: number | null;
};

type CreditGrantRow = {
  label_count?: number | null;
  used_label_count?: number | null;
  expires_at?: string | null;
  status?: string | null;
  grant_kind?: string | null;
};

const BILLABLE_USAGE_ACTIONS = ["import", "export", "filter", "crop", "processed"] as const;

const fallbackRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function checkFallbackBillingRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const current = fallbackRateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    fallbackRateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { ok: true };
}

export async function checkBillingRateLimit(
  sb: SupabaseClient | null | undefined,
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  if (!sb) return checkFallbackBillingRateLimit(key, limit, windowMs);

  const result = await sb.rpc("tulmin_check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });

  if (result.error) return checkFallbackBillingRateLimit(key, limit, windowMs);

  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as RateLimitRow | null;
  if (row?.ok === false) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 1),
    };
  }

  return { ok: true };
}

function bearerToken(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function requireBillingUser(req: NextRequest): Promise<
  | { ok: true; sb: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }
> {
  const sb = getSupabaseRouteHandler();
  if (!sb) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Billing backend is not configured." },
        { status: 503 }
      ),
    };
  }

  const token = bearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sign in required." }, { status: 401 }),
    };
  }

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid session." }, { status: 401 }),
    };
  }

  return { ok: true, sb, user: data.user };
}

export function requestFingerprint(req: NextRequest, browser: Record<string, unknown> = {}) {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipBlock = ip.includes(".") ? ip.split(".").slice(0, 3).join(".") : ip;
  const ua = req.headers.get("user-agent") || "unknown";
  const deviceId = typeof browser.deviceId === "string" ? browser.deviceId : "unknown";
  const browserBits = [
    browser.timezone,
    browser.language,
    browser.platform,
    browser.screen,
  ]
    .filter((x) => typeof x === "string")
    .join("|");

  return {
    deviceHash: sha(`${deviceId}|${ua}|${browserBits}`),
    ipHash: sha(ipBlock),
    uaHash: sha(ua),
  };
}

export async function getServerEntitlement(
  sb: SupabaseClient,
  userId: string,
  deviceHash?: string
): Promise<ServerEntitlement> {
  const monthKey = currentMonthKey();
  const dayKey = currentDayKey();
  let plan: TulminPlanId = "free";
  let status: ServerEntitlement["status"] = "free";

  const subscription = await sb
    .from("tulmin_user_subscriptions")
    .select("plan,status,current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (!subscription.error && subscription.data) {
    const row = subscription.data as {
      plan?: string;
      status?: string;
      current_period_end?: string | null;
    };
    if (row.plan && row.plan in TULMIN_PLAN_BY_ID) plan = row.plan as TulminPlanId;
    if (row.status === "active" || row.status === "trialing" || row.status === "past_due") {
      status = row.status;
    }
  }

  let dynamicPlan: DynamicPlanSetting | null = null;
  const dynamicPlanResult = await sb
    .from("tulmin_plan_settings")
    .select("enabled,label_limit,daily_limit")
    .eq("plan", plan)
    .maybeSingle();
  if (!dynamicPlanResult.error && dynamicPlanResult.data) {
    dynamicPlan = dynamicPlanResult.data as DynamicPlanSetting;
  }

  const usageTotals = await sb.rpc("tulmin_usage_totals", {
    p_user_id: userId,
    p_month_key: monthKey,
    p_day_key: dayKey,
  });
  const usageTotalsRow = (
    Array.isArray(usageTotals.data) ? usageTotals.data[0] : usageTotals.data
  ) as UsageTotalsRow | null;
  let labelsUsed = Math.max(0, Number(usageTotalsRow?.labels_used) || 0);
  let dailyLabelsUsed = Math.max(0, Number(usageTotalsRow?.daily_labels_used) || 0);

  if (usageTotals.error) {
    const usage = await sb
      .from("tulmin_usage_events")
      .select("label_count,created_at,action")
      .eq("user_id", userId)
      .eq("month_key", monthKey);

    labelsUsed =
      usage.error || !usage.data
        ? 0
        : usage.data.reduce((sum, row) => {
            const action = typeof row.action === "string" ? row.action : "import";
            if (!BILLABLE_USAGE_ACTIONS.includes(action as (typeof BILLABLE_USAGE_ACTIONS)[number])) {
              return sum;
            }
            return sum + (Number(row.label_count) || 0);
          }, 0);
    dailyLabelsUsed =
      usage.error || !usage.data
        ? 0
        : usage.data.reduce((sum, row) => {
            const createdAt = typeof row.created_at === "string" ? row.created_at : "";
            const action = typeof row.action === "string" ? row.action : "import";
            if (!BILLABLE_USAGE_ACTIONS.includes(action as (typeof BILLABLE_USAGE_ACTIONS)[number])) {
              return sum;
            }
            return createdAt.startsWith(dayKey) ? sum + (Number(row.label_count) || 0) : sum;
          }, 0);
  }

  const credits = await sb
    .from("tulmin_label_credit_grants")
    .select("label_count,used_label_count,expires_at,status,grant_kind")
    .eq("user_id", userId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  const creditRowsResult = credits.error
    ? await sb
      .from("tulmin_label_credit_grants")
      .select("label_count,used_label_count,expires_at")
      .eq("user_id", userId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    : credits;
  const activeCredits = (creditRowsResult.error || !creditRowsResult.data ? [] : (creditRowsResult.data as CreditGrantRow[])).filter(
    (row) => !row.status || row.status === "active"
  );
  const hasUnlimitedBonus = activeCredits.some((row) =>
    row.grant_kind === "unlimited_lifetime" || row.grant_kind === "unlimited_monthly"
  );
  const bonusLabelsAvailable =
    hasUnlimitedBonus
      ? 0
      : activeCredits.reduce(
          (sum, row) =>
            sum +
            Math.max(0, (Number(row.label_count) || 0) - (Number(row.used_label_count) || 0)),
          0
        );

  let abuseReview = false;
  let riskScore = 0;
  let blockedUntil: string | null = null;
  if (deviceHash && plan === "free") {
    const deviceUsers = await sb
      .from("tulmin_device_trials")
      .select("user_id")
      .eq("device_hash", deviceHash)
      .limit(6);
    if (!deviceUsers.error && deviceUsers.data) {
      const users = new Set(deviceUsers.data.map((row) => String(row.user_id)));
      if (users.size >= 4 && !users.has(userId)) {
        abuseReview = true;
        riskScore = Math.max(riskScore, 70);
      } else if (users.size >= 3) {
        riskScore = Math.max(riskScore, 45);
      }
    }

    const block = await sb
      .from("tulmin_abuse_events")
      .select("risk_score,blocked_until")
      .eq("device_hash", deviceHash)
      .gt("blocked_until", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (!block.error && block.data?.length) {
      const row = block.data[0] as { risk_score?: number | null; blocked_until?: string | null };
      riskScore = Math.max(riskScore, Number(row.risk_score) || 0);
      blockedUntil = row.blocked_until ?? null;
      abuseReview = true;
    }
  }

  const planConfig = TULMIN_PLAN_BY_ID[plan];
  const baseLabelsLimit =
    dynamicPlan?.label_limit !== undefined ? dynamicPlan.label_limit : planConfig.labelLimit;
  const labelsLimit =
    hasUnlimitedBonus || baseLabelsLimit == null
      ? null
      : Math.max(0, Number(baseLabelsLimit) || 0) + bonusLabelsAvailable;
  const dailyLabelsLimit =
    dynamicPlan?.daily_limit !== undefined ? dynamicPlan.daily_limit : (planConfig.dailyLabelLimit ?? null);
  return {
    plan,
    status,
    labelsUsed,
    labelsLimit,
    baseLabelsLimit,
    bonusLabelsAvailable,
    labelsRemaining:
      labelsLimit == null ? null : Math.max(0, labelsLimit - labelsUsed),
    dailyLabelsUsed,
    dailyLabelsLimit,
    dailyLabelsRemaining:
      dailyLabelsLimit == null ? null : Math.max(0, dailyLabelsLimit - dailyLabelsUsed),
    monthKey,
    dayKey,
    abuseReview,
    riskScore,
    blockedUntil,
    loaded: true,
  };
}

export async function touchDeviceTrial(
  sb: SupabaseClient,
  userId: string,
  fp: { deviceHash: string; ipHash: string; uaHash: string },
  labelCount: number
) {
  await sb.from("tulmin_device_trials").upsert(
    {
      device_hash: fp.deviceHash,
      user_id: userId,
      ip_hash: fp.ipHash,
      ua_hash: fp.uaHash,
      free_usage_count: labelCount,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "device_hash,user_id" }
  );
}

export async function recordAbuseEvent(
  sb: SupabaseClient,
  input: {
    userId?: string | null;
    deviceHash?: string | null;
    ipHash?: string | null;
    uaHash?: string | null;
    riskScore: number;
    reason: string;
    blockedUntil?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await sb.from("tulmin_abuse_events").insert({
    user_id: input.userId ?? null,
    device_hash: input.deviceHash ?? null,
    ip_hash: input.ipHash ?? null,
    ua_hash: input.uaHash ?? null,
    risk_score: input.riskScore,
    reason: input.reason,
    blocked_until: input.blockedUntil ?? null,
    metadata: input.metadata ?? {},
  }).then(() => undefined, () => undefined);
}
