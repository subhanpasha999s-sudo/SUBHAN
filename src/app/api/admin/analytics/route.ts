import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin/auth";
import { TULMIN_PLAN_BY_ID, type TulminPlanId } from "@/lib/billing/plans";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseServiceRole>>;
type SupabaseQueryError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type SubscriptionRow = {
  user_id: string;
  user_email?: string | null;
  plan: TulminPlanId;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type UsageRow = {
  user_id: string;
  user_email?: string | null;
  action: string | null;
  label_count: number | null;
  month_key: string | null;
  created_at: string | null;
};

type PaymentRow = {
  user_id: string | null;
  user_email?: string | null;
  plan: TulminPlanId | null;
  amount: number | null;
  status: string | null;
  billing_cycle: string | null;
  label_credits: number | null;
  failure_reason: string | null;
  invoice_url: string | null;
  created_at: string | null;
};

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(date = new Date()) {
  return monthKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));
}

function planPrice(plan: TulminPlanId) {
  return TULMIN_PLAN_BY_ID[plan]?.monthlyPrice ?? 0;
}

function isPaidPlan(plan: string | null | undefined) {
  return Boolean(plan && plan !== "free");
}

function isActiveStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

function paymentIsPaid(status: string | null | undefined) {
  return status === "paid" || status === "captured" || status === "fulfilled";
}

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
}

function errorText(error: SupabaseQueryError | null | undefined) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
}

function missingColumn(error: SupabaseQueryError | null | undefined, column: string) {
  const text = errorText(error).toLowerCase();
  return Boolean(error && text.includes(column.toLowerCase()));
}

function analyticsSetupError(errors: Array<{ name: string; error: SupabaseQueryError | null | undefined }>) {
  const failed = errors.filter((item) => item.error);
  if (failed.length === 0) return null;
  return `Admin analytics tables are not ready: ${failed
    .map((item) => `${item.name} (${item.error?.message ?? "query failed"})`)
    .join("; ")}`;
}

async function loadSubscriptions(sb: SupabaseAdminClient) {
  const result = await sb
    .from("tulmin_user_subscriptions")
    .select("user_id, user_email, plan, status, current_period_start, current_period_end, created_at, updated_at")
    .limit(50000);

  if (!missingColumn(result.error, "user_email")) {
    return { rows: (result.data ?? []) as SubscriptionRow[], error: result.error };
  }

  const fallback = await sb
    .from("tulmin_user_subscriptions")
    .select("user_id, plan, status, current_period_start, current_period_end, created_at, updated_at")
    .limit(50000);

  return { rows: (fallback.data ?? []) as SubscriptionRow[], error: fallback.error };
}

async function loadUsageEvents(sb: SupabaseAdminClient, activityWindowStart: Date) {
  const result = await sb
    .from("tulmin_usage_events")
    .select("user_id, user_email, action, label_count, month_key, created_at")
    .gte("created_at", activityWindowStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(30000);

  if (!missingColumn(result.error, "user_email")) {
    return { rows: (result.data ?? []) as UsageRow[], error: result.error };
  }

  const fallback = await sb
    .from("tulmin_usage_events")
    .select("user_id, action, label_count, month_key, created_at")
    .gte("created_at", activityWindowStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(30000);

  return { rows: (fallback.data ?? []) as UsageRow[], error: fallback.error };
}

async function loadPaymentEvents(sb: SupabaseAdminClient) {
  const result = await sb
    .from("tulmin_payment_events")
    .select("user_id, user_email, plan, amount, status, billing_cycle, label_credits, failure_reason, invoice_url, created_at")
    .order("created_at", { ascending: false })
    .limit(50000);

  if (!missingColumn(result.error, "user_email")) {
    return { rows: (result.data ?? []) as PaymentRow[], error: result.error };
  }

  const fallback = await sb
    .from("tulmin_payment_events")
    .select("user_id, plan, amount, status, billing_cycle, label_credits, failure_reason, invoice_url, created_at")
    .order("created_at", { ascending: false })
    .limit(50000);

  return { rows: (fallback.data ?? []) as PaymentRow[], error: fallback.error };
}

async function loadAuthUsers(sb: SupabaseAdminClient, userIds: Set<string>) {
  const emails = new Map<string, string>();
  const createdAt = new Map<string, string>();
  let authUserCount = 0;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    authUserCount += data.users.length;
    for (const user of data.users) {
      if (user.created_at) createdAt.set(user.id, user.created_at);
      if (userIds.has(user.id) && user.email) emails.set(user.id, user.email.toLowerCase());
    }
    if (data.users.length < 1000) break;
  }

  return { emails, createdAt, authUserCount };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const sb = getSupabaseServiceRole();
  if (!sb) {
    return NextResponse.json({ error: "Admin analytics database is not configured." }, { status: 503 });
  }

  const now = new Date();
  const today = startOfDay(now);
  const currentMonth = monthKey(now);
  const previousMonth = previousMonthKey(now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const activityWindowStart = new Date(now.getTime() - 180 * 86_400_000);
  const renewalWindowEnd = new Date(now.getTime() + 14 * 86_400_000);

  const [subscriptionsResult, usageEventsResult, paymentEventsResult] = await Promise.all([
    loadSubscriptions(sb),
    loadUsageEvents(sb, activityWindowStart),
    loadPaymentEvents(sb),
  ]);

  const setupError = analyticsSetupError([
    { name: "tulmin_user_subscriptions", error: subscriptionsResult.error },
    { name: "tulmin_usage_events", error: usageEventsResult.error },
    { name: "tulmin_payment_events", error: paymentEventsResult.error },
  ]);
  if (setupError) {
    return NextResponse.json({ error: setupError }, { status: 503 });
  }

  const subs = subscriptionsResult.rows;
  const usage = usageEventsResult.rows;
  const payments = paymentEventsResult.rows;

  const userIds = new Set(
    [
      ...subs.map((row) => row.user_id),
      ...usage.map((row) => row.user_id),
      ...payments.map((row) => row.user_id ?? ""),
    ].filter(Boolean)
  );
  const directEmails = new Map<string, string>();
  for (const row of [...subs, ...usage, ...payments]) {
    if (row.user_id && row.user_email) directEmails.set(row.user_id, row.user_email.toLowerCase());
  }
  const { emails, createdAt, authUserCount } = await loadAuthUsers(sb, userIds);
  const displayUser = (userId: string | null | undefined) =>
    userId ? directEmails.get(userId) ?? emails.get(userId) ?? userId : "unknown";

  const planCounts: Record<TulminPlanId, number> = {
    free: 0,
    starter: 0,
    pro: 0,
    business: 0,
  };

  const activeSubscribers = subs.filter((sub) => isPaidPlan(sub.plan) && isActiveStatus(sub.status));
  const trialUsers = subs.filter((sub) => sub.status === "trialing").length;
  const canceledOrPastDue = subs.filter((sub) => sub.status === "canceled" || sub.status === "past_due").length;
  for (const sub of subs) {
    if (sub.plan in planCounts) planCounts[sub.plan] += 1;
  }

  const mrr = activeSubscribers.reduce((sum, sub) => sum + planPrice(sub.plan), 0);
  const paidRevenue = payments.filter((payment) => paymentIsPaid(payment.status));
  const totalRevenue = paidRevenue.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const revenueThisMonth = paidRevenue
    .filter((payment) => payment.created_at?.slice(0, 7) === currentMonth)
    .reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const revenuePreviousMonth = paidRevenue
    .filter((payment) => payment.created_at?.slice(0, 7) === previousMonth)
    .reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const revenueGrowth =
    revenuePreviousMonth > 0
      ? Math.round(((revenueThisMonth - revenuePreviousMonth) / revenuePreviousMonth) * 1000) / 10
      : revenueThisMonth > 0
        ? 100
        : 0;

  const totalUsers = Math.max(userIds.size, authUserCount);
  const paidUsers = new Set(activeSubscribers.map((sub) => sub.user_id)).size;
  const freeUsers = Math.max(0, totalUsers - paidUsers);
  const conversionRate = totalUsers ? Math.round((paidUsers / totalUsers) * 1000) / 10 : 0;
  const churnRate =
    paidUsers + canceledOrPastDue > 0
      ? Math.round((canceledOrPastDue / (paidUsers + canceledOrPastDue)) * 1000) / 10
      : 0;
  const retentionRate = Math.max(0, Math.round((100 - churnRate) * 10) / 10);
  const arpu = activeSubscribers.length ? Math.round(mrr / activeSubscribers.length) : 0;
  const ltv = paidUsers ? Math.round(totalRevenue / paidUsers) : 0;

  const authCreatedDates = [...createdAt.values()];
  const newUsersToday = authCreatedDates.filter((date) => new Date(date) >= today).length;
  const newUsersMonth = authCreatedDates.filter((date) => date.slice(0, 7) === currentMonth).length;
  const activeUsers = new Set(
    usage
      .filter((row) => row.created_at && new Date(row.created_at) >= thirtyDaysAgo)
      .map((row) => row.user_id)
  ).size;

  const currentMonthUsage = usage.filter((row) => row.month_key === currentMonth);
  const totalLabelsProcessed = usage.reduce((sum, row) => sum + Math.max(0, Number(row.label_count) || 0), 0);
  const labelsByUser = new Map<string, number>();
  const featureUsage = new Map<string, number>();
  for (const row of usage) {
    labelsByUser.set(row.user_id, (labelsByUser.get(row.user_id) ?? 0) + Math.max(0, Number(row.label_count) || 0));
    const action = row.action || "usage";
    featureUsage.set(action, (featureUsage.get(action) ?? 0) + 1);
  }

  const dailyLabels = new Map<string, number>();
  const dailyRevenue = new Map<string, number>();
  const dailyUsers = new Map<string, number>();
  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    dailyLabels.set(date, 0);
    dailyRevenue.set(date, 0);
    dailyUsers.set(date, 0);
  }
  for (const row of usage) {
    const key = row.created_at?.slice(0, 10);
    if (key && dailyLabels.has(key)) {
      dailyLabels.set(key, (dailyLabels.get(key) ?? 0) + Math.max(0, Number(row.label_count) || 0));
    }
  }
  for (const payment of paidRevenue) {
    const key = payment.created_at?.slice(0, 10);
    if (key && dailyRevenue.has(key)) {
      dailyRevenue.set(key, (dailyRevenue.get(key) ?? 0) + Math.max(0, Number(payment.amount) || 0));
    }
  }
  for (const date of authCreatedDates) {
    const key = date.slice(0, 10);
    if (dailyUsers.has(key)) dailyUsers.set(key, (dailyUsers.get(key) ?? 0) + 1);
  }

  const planWiseRevenue: Record<string, number> = {};
  for (const plan of ["starter", "pro", "business"] as const) {
    planWiseRevenue[plan] = activeSubscribers.filter((sub) => sub.plan === plan).length * planPrice(plan);
  }

  const renewals = activeSubscribers
    .filter((sub) => {
      if (!sub.current_period_end) return false;
      const date = new Date(sub.current_period_end);
      return date >= now && date <= renewalWindowEnd;
    })
    .map((sub) => ({
      user: displayUser(sub.user_id),
      plan: sub.plan,
      renewalDate: sub.current_period_end,
      daysLeft: sub.current_period_end ? daysBetween(now, new Date(sub.current_period_end)) : null,
    }))
    .slice(0, 8);

  const failedPayments = payments.filter((payment) => payment.status === "failed");
  const refundsOrCancellations = [
    ...payments.filter((payment) => payment.status === "refunded"),
    ...subs.filter((sub) => sub.status === "canceled").map((sub) => ({
      user_id: sub.user_id,
      plan: sub.plan,
      amount: 0,
      status: "canceled",
      billing_cycle: null,
      label_credits: null,
      failure_reason: null,
      invoice_url: null,
      created_at: sub.updated_at ?? sub.created_at,
    })),
  ];

  return NextResponse.json({
    admin,
    generatedAt: now.toISOString(),
    identity: {
      primary: "email",
      fallback: "auth_user_id",
      note: "Admin views resolve Supabase auth UUIDs to email for day-to-day billing and analytics. UUIDs remain stored for referential safety.",
    },
    metrics: {
      totalRevenue,
      mrr,
      arr: mrr * 12,
      activeSubscribers: activeSubscribers.length,
      freeUsers,
      paidUsers,
      totalUsers,
      trialUsers,
      churnRate,
      conversionRate,
      retentionRate,
      revenueGrowth,
      arpu,
      ltv,
      failedPayments: failedPayments.length,
      renewalsDue: renewals.length,
      newUsersToday,
      newUsersMonth,
      activeUsers,
      labelsProcessed: totalLabelsProcessed,
      labelsThisMonth: currentMonthUsage.reduce((sum, row) => sum + Math.max(0, Number(row.label_count) || 0), 0),
    },
    revenue: {
      planWiseRevenue,
      daily: [...dailyRevenue.entries()].map(([date, value]) => ({ date, value })),
    },
    users: {
      growth: [...dailyUsers.entries()].map(([date, value]) => ({ date, value })),
      planMix: planCounts,
    },
    usage: {
      dailyLabels: [...dailyLabels.entries()].map(([date, labels]) => ({ date, labels })),
      topCustomers: [...labelsByUser.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([userId, labels]) => ({ user: displayUser(userId), userId, labels })),
      mostUsedFeatures: [...featureUsage.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([feature, count]) => ({ feature, count })),
    },
    billing: {
      failedPayments: failedPayments.slice(0, 8).map((payment) => ({
        user: displayUser(payment.user_id),
        plan: payment.plan,
        amount: payment.amount ?? 0,
        reason: payment.failure_reason ?? "payment_failed",
        createdAt: payment.created_at,
      })),
      renewals,
      refundsOrCancellations: refundsOrCancellations.slice(0, 8).map((event) => ({
        user: displayUser(event.user_id),
        plan: event.plan,
        status: event.status,
        amount: event.amount ?? 0,
        createdAt: event.created_at,
      })),
    },
    recentActivity: usage.slice(0, 10).map((row) => ({
      user: displayUser(row.user_id),
      userId: row.user_id,
      action: row.action ?? "usage",
      labels: row.label_count ?? 0,
      createdAt: row.created_at,
    })),
  });
}
