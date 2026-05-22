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
  labelsRemaining: number | null;
  monthKey: string;
  abuseReview: boolean;
  loaded: boolean;
};

export function currentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sha(input: string) {
  return createHash("sha256").update(input).digest("hex");
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

  const usage = await sb
    .from("tulmin_usage_events")
    .select("label_count")
    .eq("user_id", userId)
    .eq("month_key", monthKey);

  const labelsUsed =
    usage.error || !usage.data
      ? 0
      : usage.data.reduce((sum, row) => sum + (Number(row.label_count) || 0), 0);

  let abuseReview = false;
  if (deviceHash && plan === "free") {
    const deviceUsers = await sb
      .from("tulmin_device_trials")
      .select("user_id")
      .eq("device_hash", deviceHash)
      .limit(6);
    if (!deviceUsers.error && deviceUsers.data) {
      const users = new Set(deviceUsers.data.map((row) => String(row.user_id)));
      if (users.size >= 2 && !users.has(userId)) abuseReview = true;
    }
  }

  const labelsLimit = TULMIN_PLAN_BY_ID[plan].labelLimit;
  return {
    plan,
    status,
    labelsUsed,
    labelsLimit,
    labelsRemaining:
      labelsLimit == null ? null : Math.max(0, labelsLimit - labelsUsed),
    monthKey,
    abuseReview,
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
