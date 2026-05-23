import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin/auth";
import { TULMIN_PLAN_BY_ID, type TulminPlanId } from "@/lib/billing/plans";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type SubscriptionRow = {
  user_id: string;
  plan: TulminPlanId;
  status: string | null;
  created_at: string | null;
};

type UsageRow = {
  user_id: string;
  action: string | null;
  label_count: number | null;
  month_key: string | null;
  created_at: string | null;
};

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function planPrice(plan: TulminPlanId) {
  return TULMIN_PLAN_BY_ID[plan]?.monthlyPrice ?? 0;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const sb = getSupabaseServiceRole();
  if (!sb) {
    return NextResponse.json({ error: "Admin analytics database is not configured." }, { status: 503 });
  }

  const currentMonth = monthKey();
  const [{ data: subscriptions }, { data: usageEvents }] = await Promise.all([
    sb
      .from("tulmin_user_subscriptions")
      .select("user_id, plan, status, created_at")
      .limit(20000),
    sb
      .from("tulmin_usage_events")
      .select("user_id, action, label_count, month_key, created_at")
      .order("created_at", { ascending: false })
      .limit(20000),
  ]);

  const subs = (subscriptions ?? []) as SubscriptionRow[];
  const usage = (usageEvents ?? []) as UsageRow[];
  const planCounts: Record<TulminPlanId, number> = {
    free: 0,
    starter: 0,
    pro: 0,
    business: 0,
  };

  for (const sub of subs) {
    if (sub.plan in planCounts) planCounts[sub.plan] += 1;
  }

  const totalLabelsProcessed = usage.reduce((sum, row) => sum + Math.max(0, Number(row.label_count) || 0), 0);
  const currentMonthUsage = usage.filter((row) => row.month_key === currentMonth);
  const uniqueUsers = new Set([...subs.map((s) => s.user_id), ...usage.map((u) => u.user_id)].filter(Boolean));
  const paidUsers = subs.filter((sub) => sub.plan !== "free" && sub.status !== "canceled").length;
  const mrr =
    planCounts.starter * planPrice("starter") +
    planCounts.pro * planPrice("pro") +
    planCounts.business * planPrice("business");

  const labelsByUser = new Map<string, number>();
  for (const row of usage) {
    labelsByUser.set(row.user_id, (labelsByUser.get(row.user_id) ?? 0) + Math.max(0, Number(row.label_count) || 0));
  }

  const topUsers = [...labelsByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([userId, labels]) => ({ userId, labels }));

  const daily = new Map<string, number>();
  for (const row of usage.slice().reverse()) {
    const key = row.created_at ? row.created_at.slice(0, 10) : "unknown";
    daily.set(key, (daily.get(key) ?? 0) + Math.max(0, Number(row.label_count) || 0));
  }

  return NextResponse.json({
    admin,
    generatedAt: new Date().toISOString(),
    users: {
      liveActive: 0,
      total: uniqueUsers.size,
      returning: Math.max(0, uniqueUsers.size - subs.filter((s) => s.created_at?.startsWith(currentMonth)).length),
      paid: paidUsers,
      free: planCounts.free,
      permanent: planCounts.business,
      newSignups: subs.filter((s) => s.created_at?.slice(0, 7) === currentMonth).length,
    },
    usage: {
      totalPdfsUploaded: usage.filter((row) => row.action === "import").length,
      totalLabelsUploaded: totalLabelsProcessed,
      totalLabelsProcessed,
      averageLabelsPerUser: uniqueUsers.size ? Math.round(totalLabelsProcessed / uniqueUsers.size) : 0,
      currentMonthLabels: currentMonthUsage.reduce((sum, row) => sum + Math.max(0, Number(row.label_count) || 0), 0),
      topUsers,
    },
    revenue: {
      revenue: mrr,
      mrr,
      arr: mrr * 12,
      monthlyGrowth: 0,
      conversionRate: uniqueUsers.size ? Math.round((1000 * paidUsers) / uniqueUsers.size) / 10 : 0,
      planWiseRevenue: {
        starter: planCounts.starter * planPrice("starter"),
        pro: planCounts.pro * planPrice("pro"),
        business: planCounts.business * planPrice("business"),
      },
    },
    traffic: {
      totalVisits: 0,
      uniqueVisitors: 0,
      sessionDuration: "Connect analytics",
      mostVisitedPages: ["/", "/export-labels", "/mapping", "/pricing"],
    },
    plans: planCounts,
    chart: [...daily.entries()].slice(-14).map(([date, labels]) => ({ date, labels })),
    recentActivity: usage.slice(0, 10).map((row) => ({
      userId: row.user_id,
      action: row.action ?? "usage",
      labels: row.label_count ?? 0,
      createdAt: row.created_at,
    })),
  });
}
