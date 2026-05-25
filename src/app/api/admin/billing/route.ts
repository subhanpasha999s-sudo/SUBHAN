import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin/auth";
import {
  defaultBillingPlans,
  encryptBillingSecret,
  secretLast4,
  type AdminBillingPlanSetting,
} from "@/lib/admin/billing-settings";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type BillingSettingsRow = {
  provider: "razorpay";
  mode: "test" | "live";
  checkout_enabled: boolean;
  razorpay_key_id: string | null;
  razorpay_key_secret_encrypted: string | null;
  razorpay_key_secret_last4: string | null;
  razorpay_webhook_secret_encrypted: string | null;
  razorpay_webhook_secret_last4: string | null;
};

type PlanRow = {
  plan: AdminBillingPlanSetting["plan"];
  enabled: boolean;
  monthly_price: number;
  yearly_monthly_equivalent: number;
  yearly_total: number;
  label_limit: number | null;
  daily_limit: number | null;
  razorpay_monthly_plan_id: string | null;
  razorpay_yearly_plan_id: string | null;
};

type BonusGrantKind = "labels" | "unlimited_monthly" | "unlimited_lifetime";
type BonusGrantStatus = "active" | "suspended";

type BonusGrantRow = {
  id: number;
  user_id: string;
  user_email?: string | null;
  label_count: number | null;
  used_label_count: number | null;
  reason: string | null;
  expires_at: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  status?: string | null;
  grant_kind?: string | null;
  renewed_at?: string | null;
};

type PutBody = {
  action?: "save_billing" | "grant_credits" | "update_bonus" | "delete_bonus";
  grant?: {
    bonusId?: number;
    userId?: string;
    userEmail?: string;
    labelCount?: number;
    reason?: string;
    expiresAt?: string;
    status?: BonusGrantStatus;
    grantKind?: BonusGrantKind;
  };
  settings?: {
    mode?: "test" | "live";
    checkoutEnabled?: boolean;
    razorpayKeyId?: string;
    razorpayKeySecret?: string;
    razorpayWebhookSecret?: string;
  };
  plans?: AdminBillingPlanSetting[];
};

const UNLIMITED_GRANT_LABEL_COUNT = 2147483647;

function normalizeGrantKind(value?: string): BonusGrantKind {
  if (value === "unlimited_monthly" || value === "unlimited_lifetime") return value;
  return "labels";
}

function normalizeGrantStatus(value?: string): BonusGrantStatus {
  return value === "suspended" ? "suspended" : "active";
}

function endOfCurrentMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1).toISOString();
}

function normalizeExpiresAt(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T23:59:59.999Z`;
  return trimmed;
}

function metadataEmail(row: BonusGrantRow) {
  const email = row.metadata?.userEmail;
  return typeof email === "string" ? email : null;
}

function mapBonusGrant(row: BonusGrantRow, emailByUserId: Map<string, string>) {
  const grantKind = normalizeGrantKind(row.grant_kind ?? undefined);
  const labelCount = Math.max(0, Number(row.label_count) || 0);
  const usedLabelCount = Math.max(0, Number(row.used_label_count) || 0);
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email || metadataEmail(row) || emailByUserId.get(row.user_id) || "Unknown user",
    labelCount,
    usedLabelCount,
    remainingLabels: grantKind === "labels" ? Math.max(0, labelCount - usedLabelCount) : null,
    reason: row.reason || "admin_bonus",
    status: normalizeGrantStatus(row.status ?? undefined),
    grantKind,
    expiresAt: row.expires_at,
    renewedAt: row.renewed_at ?? null,
    createdAt: row.created_at,
  };
}

function mapSettings(row?: BillingSettingsRow | null) {
  return {
    provider: "razorpay" as const,
    mode: row?.mode ?? "test",
    checkoutEnabled: Boolean(row?.checkout_enabled),
    razorpayKeyId: row?.razorpay_key_id ?? "",
    razorpayKeySecretSaved: Boolean(row?.razorpay_key_secret_encrypted),
    razorpayKeySecretLast4: row?.razorpay_key_secret_last4 ?? "",
    razorpayWebhookSecretSaved: Boolean(row?.razorpay_webhook_secret_encrypted),
    razorpayWebhookSecretLast4: row?.razorpay_webhook_secret_last4 ?? "",
  };
}

function mapPlan(row: PlanRow): AdminBillingPlanSetting {
  return {
    plan: row.plan,
    enabled: row.enabled,
    monthlyPrice: row.monthly_price,
    yearlyMonthlyEquivalent: row.yearly_monthly_equivalent,
    yearlyTotal: row.yearly_total,
    labelLimit: row.label_limit,
    dailyLimit: row.daily_limit,
    razorpayMonthlyPlanId: row.razorpay_monthly_plan_id ?? "",
    razorpayYearlyPlanId: row.razorpay_yearly_plan_id ?? "",
  };
}

async function resolveUserIdForGrant(
  sb: NonNullable<ReturnType<typeof getSupabaseServiceRole>>,
  grant?: PutBody["grant"]
) {
  const directUserId = grant?.userId?.trim();
  if (directUserId) return { userId: directUserId, userEmail: grant?.userEmail?.trim().toLowerCase() || null };

  const email = grant?.userEmail?.trim().toLowerCase();
  if (!email) return { userId: "", userEmail: null };

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    const user = data.users.find((item) => item.email?.toLowerCase() === email);
    if (user) return { userId: user.id, userEmail: email };
    if (data.users.length < 1000) break;
  }

  return { userId: "", userEmail: email };
}

async function emailMapForUsers(
  sb: NonNullable<ReturnType<typeof getSupabaseServiceRole>>,
  userIds: string[]
) {
  const needed = new Set(userIds.filter(Boolean));
  const emailByUserId = new Map<string, string>();
  if (needed.size === 0) return emailByUserId;

  for (let page = 1; page <= 20 && needed.size > 0; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const user of data.users) {
      if (needed.has(user.id) && user.email) {
        emailByUserId.set(user.id, user.email.toLowerCase());
        needed.delete(user.id);
      }
    }
    if (data.users.length < 1000) break;
  }

  return emailByUserId;
}

async function loadBonusGrants(sb: NonNullable<ReturnType<typeof getSupabaseServiceRole>>) {
  const grantsResult = await sb
    .from("tulmin_label_credit_grants")
    .select("id,user_id,user_email,label_count,used_label_count,reason,expires_at,metadata,created_at,status,grant_kind,renewed_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const rowsResult = grantsResult.error
    ? await sb
      .from("tulmin_label_credit_grants")
      .select("id,user_id,label_count,used_label_count,reason,expires_at,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(100)
    : grantsResult;

  if (rowsResult.error || !rowsResult.data) return [];

  const rows = rowsResult.data as BonusGrantRow[];
  const emailByUserId = await emailMapForUsers(
    sb,
    rows.filter((row) => !row.user_email && !metadataEmail(row)).map((row) => row.user_id)
  );
  return rows.map((row) => mapBonusGrant(row, emailByUserId));
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const sb = getSupabaseServiceRole();
  if (!sb) return NextResponse.json({ error: "Service role is not configured." }, { status: 503 });

  const [settingsResult, plansResult, bonusGrants] = await Promise.all([
    sb.from("tulmin_billing_settings").select("*").eq("id", true).maybeSingle(),
    sb.from("tulmin_plan_settings").select("*").order("monthly_price", { ascending: true }),
    loadBonusGrants(sb),
  ]);

  if (settingsResult.error || plansResult.error) {
    return NextResponse.json(
      {
        error:
          "Billing admin tables are not ready. Apply supabase migration 008_billing_admin.sql.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    admin,
    settings: mapSettings(settingsResult.data as BillingSettingsRow | null),
    plans:
      plansResult.data && plansResult.data.length > 0
        ? (plansResult.data as PlanRow[]).map(mapPlan)
        : defaultBillingPlans(),
    bonusGrants,
  });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  if (admin.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admins can update billing." }, { status: 403 });
  }

  const sb = getSupabaseServiceRole();
  if (!sb) return NextResponse.json({ error: "Service role is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as PutBody;

  if (body.action === "grant_credits") {
    const { userId, userEmail } = await resolveUserIdForGrant(sb, body.grant);
    const grantKind = normalizeGrantKind(body.grant?.grantKind);
    const labelCount =
      grantKind === "labels"
        ? Math.max(0, Math.floor(Number(body.grant?.labelCount) || 0))
        : UNLIMITED_GRANT_LABEL_COUNT;
    if (!userId || (grantKind === "labels" && labelCount <= 0)) {
      return NextResponse.json({ error: "User email and positive label count are required." }, { status: 400 });
    }
    const savedGrant = await sb.from("tulmin_label_credit_grants").insert({
      user_id: userId,
      user_email: userEmail,
      label_count: labelCount,
      reason: body.grant?.reason?.trim() || "admin_bonus",
      expires_at:
        grantKind === "unlimited_lifetime"
          ? null
          : normalizeExpiresAt(body.grant?.expiresAt) ?? (grantKind === "unlimited_monthly" ? endOfCurrentMonthIso() : null),
      status: "active",
      grant_kind: grantKind,
      created_by: admin.id,
      metadata: { adminEmail: admin.email, userEmail, identityMode: "email_primary_uuid_storage" },
    });
    if (savedGrant.error) return NextResponse.json({ error: savedGrant.error.message }, { status: 500 });
    return GET(req);
  }

  if (body.action === "update_bonus") {
    const bonusId = Math.max(0, Math.floor(Number(body.grant?.bonusId) || 0));
    if (!bonusId) return NextResponse.json({ error: "Bonus grant is required." }, { status: 400 });

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.grant?.status) update.status = normalizeGrantStatus(body.grant.status);
    if (body.grant?.reason !== undefined) update.reason = body.grant.reason.trim() || "admin_bonus";
    if (body.grant?.expiresAt !== undefined) {
      update.expires_at = normalizeExpiresAt(body.grant.expiresAt);
      update.renewed_at = new Date().toISOString();
    }

    const savedGrant = await sb.from("tulmin_label_credit_grants").update(update).eq("id", bonusId);
    if (savedGrant.error) return NextResponse.json({ error: savedGrant.error.message }, { status: 500 });
    return GET(req);
  }

  if (body.action === "delete_bonus") {
    const bonusId = Math.max(0, Math.floor(Number(body.grant?.bonusId) || 0));
    if (!bonusId) return NextResponse.json({ error: "Bonus grant is required." }, { status: 400 });
    const deletedGrant = await sb.from("tulmin_label_credit_grants").delete().eq("id", bonusId);
    if (deletedGrant.error) return NextResponse.json({ error: deletedGrant.error.message }, { status: 500 });
    return GET(req);
  }

  if (body.settings) {
    const existing = await sb.from("tulmin_billing_settings").select("*").eq("id", true).maybeSingle();
    if (existing.error) {
      return NextResponse.json(
        { error: "Billing admin tables are not ready. Apply supabase migration 008_billing_admin.sql." },
        { status: 503 }
      );
    }
    const update: Record<string, unknown> = {
      id: true,
      provider: "razorpay",
      mode: body.settings.mode ?? "test",
      checkout_enabled: Boolean(body.settings.checkoutEnabled),
      razorpay_key_id: body.settings.razorpayKeyId?.trim() ?? "",
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    };

    if (body.settings.razorpayKeySecret?.trim()) {
      update.razorpay_key_secret_encrypted = encryptBillingSecret(body.settings.razorpayKeySecret);
      update.razorpay_key_secret_last4 = secretLast4(body.settings.razorpayKeySecret);
    }
    if (body.settings.razorpayWebhookSecret?.trim()) {
      update.razorpay_webhook_secret_encrypted = encryptBillingSecret(body.settings.razorpayWebhookSecret);
      update.razorpay_webhook_secret_last4 = secretLast4(body.settings.razorpayWebhookSecret);
    }

    const saved = await sb.from("tulmin_billing_settings").upsert(update, { onConflict: "id" });
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }

  if (Array.isArray(body.plans)) {
    const rows = body.plans.map((plan) => ({
      plan: plan.plan,
      enabled: Boolean(plan.enabled),
      monthly_price: Math.max(0, Math.floor(Number(plan.monthlyPrice) || 0)),
      yearly_monthly_equivalent: Math.max(0, Math.floor(Number(plan.yearlyMonthlyEquivalent) || 0)),
      yearly_total: Math.max(0, Math.floor(Number(plan.yearlyTotal) || 0)),
      label_limit: plan.labelLimit == null ? null : Math.max(0, Math.floor(Number(plan.labelLimit) || 0)),
      daily_limit: plan.dailyLimit == null ? null : Math.max(0, Math.floor(Number(plan.dailyLimit) || 0)),
      razorpay_monthly_plan_id: plan.razorpayMonthlyPlanId?.trim() ?? "",
      razorpay_yearly_plan_id: plan.razorpayYearlyPlanId?.trim() ?? "",
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    }));
    const savedPlans = await sb.from("tulmin_plan_settings").upsert(rows, { onConflict: "plan" });
    if (savedPlans.error) return NextResponse.json({ error: savedPlans.error.message }, { status: 500 });
  }

  return GET(req);
}
