import { NextResponse } from "next/server";

import { TULMIN_PLANS, type TulminPlan } from "@/lib/billing/plans";
import { getSupabaseRouteHandler } from "@/lib/supabase/server-admin";

const PLAN_CACHE_TTL_MS = 30_000;

let cachedPayload: { plans: readonly TulminPlan[]; cachedAt: number } | null = null;

function normalizePublicPlan(plan: TulminPlan): TulminPlan {
  if (plan.id !== "free") return plan;
  return {
    ...plan,
    monthlyPrice: 0,
    yearlyMonthlyEquivalent: 0,
    yearlyTotal: 0,
  };
}

export async function GET() {
  if (cachedPayload && Date.now() - cachedPayload.cachedAt < PLAN_CACHE_TTL_MS) {
    return NextResponse.json({ plans: cachedPayload.plans });
  }

  const sb = getSupabaseRouteHandler();
  if (!sb) return NextResponse.json({ plans: TULMIN_PLANS.map(normalizePublicPlan) });

  const result = await sb
    .from("tulmin_plan_settings")
    .select("plan,enabled,monthly_price,yearly_monthly_equivalent,yearly_total,label_limit,daily_limit");

  if (result.error || !result.data?.length) {
    return NextResponse.json({ plans: cachedPayload?.plans ?? TULMIN_PLANS.map(normalizePublicPlan) });
  }
  const byId = new Map(result.data.map((row) => [String(row.plan), row]));
  const plans = TULMIN_PLANS.flatMap((plan) => {
    const dynamic = byId.get(plan.id) as
      | {
          enabled?: boolean | null;
          monthly_price?: number | null;
          yearly_monthly_equivalent?: number | null;
          yearly_total?: number | null;
          label_limit?: number | null;
          daily_limit?: number | null;
        }
      | undefined;
    if (dynamic?.enabled === false && plan.id !== "free") return [];
    if (!dynamic) return [normalizePublicPlan(plan)];
    return [normalizePublicPlan({
      ...plan,
      monthlyPrice: Number(dynamic.monthly_price ?? plan.monthlyPrice),
      yearlyMonthlyEquivalent: Number(dynamic.yearly_monthly_equivalent ?? plan.yearlyMonthlyEquivalent),
      yearlyTotal: Number(dynamic.yearly_total ?? plan.yearlyTotal),
      labelLimit: dynamic.label_limit === undefined ? plan.labelLimit : dynamic.label_limit,
      dailyLabelLimit: dynamic.daily_limit === undefined ? plan.dailyLabelLimit : dynamic.daily_limit,
    })];
  });
  cachedPayload = { plans, cachedAt: Date.now() };
  return NextResponse.json({ plans });
}
