import { NextResponse, type NextRequest } from "next/server";

import {
  checkBillingRateLimit,
  requestFingerprint,
  requireBillingUser,
} from "@/lib/billing/server";
import { TULMIN_PLAN_BY_ID, type BillingCycle, type TulminPlanId } from "@/lib/billing/plans";
import {
  createRazorpayOrder,
  createRazorpaySubscription,
  getRazorpayBillingConfig,
} from "@/lib/billing/razorpay";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type CheckoutBody =
  | {
      type: "plan";
      plan: TulminPlanId;
      cycle: BillingCycle;
      browser?: Record<string, unknown>;
    }
  | {
      type: "topup";
      labelCredits: number;
      browser?: Record<string, unknown>;
    };

const TOPUP_PRICE_PER_1000_LABELS = 49;
const ALLOWED_TOPUPS = [500, 1000, 2500, 5000, 10000];

function planAmount(plan: TulminPlanId, cycle: BillingCycle, row?: Record<string, unknown> | null) {
  const fallback = TULMIN_PLAN_BY_ID[plan];
  const monthly = Number(row?.monthly_price ?? fallback.monthlyPrice) || 0;
  const yearly = Number(row?.yearly_total ?? fallback.yearlyTotal) || 0;
  return cycle === "yearly" ? yearly : monthly;
}

function subscriptionTotalCount(cycle: BillingCycle) {
  return cycle === "yearly" ? 10 : 120;
}

function envRazorpayPlanId(plan: TulminPlanId, cycle: BillingCycle) {
  const key = `RAZORPAY_PLAN_${plan.toUpperCase()}_${cycle.toUpperCase()}_ID`;
  return process.env[key]?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Partial<CheckoutBody>;
  const fp = requestFingerprint(req, body.browser);
  const service = getSupabaseServiceRole() ?? auth.sb;
  const rateLimit = await checkBillingRateLimit(
    service,
    `checkout:${auth.user.id}:${fp.deviceHash}`,
    12,
    60_000
  );
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const config = await getRazorpayBillingConfig(service);
  if (!config?.checkoutEnabled || !config.keyId || !config.keySecret) {
    return NextResponse.json(
      { error: "Checkout is not enabled yet. Add Razorpay keys in Admin Billing." },
      { status: 503 }
    );
  }

  let amountRupees = 0;
  let plan: TulminPlanId | null = null;
  let cycle: BillingCycle | "topup" = "monthly";
  let labelCredits = 0;
  let description = "";
  let subscriptionId = "";
  let order: { id: string; amount: number; currency: string } | null = null;

  if (body.type === "plan") {
    plan = body.plan && body.plan in TULMIN_PLAN_BY_ID ? body.plan : null;
    cycle = body.cycle === "yearly" ? "yearly" : "monthly";
    if (!plan || plan === "free") {
      return NextResponse.json({ error: "Choose a paid plan." }, { status: 400 });
    }
    const settings = await service
      .from("tulmin_plan_settings")
      .select("enabled,monthly_price,yearly_total,razorpay_monthly_plan_id,razorpay_yearly_plan_id")
      .eq("plan", plan)
      .maybeSingle();
    if (!settings.error && settings.data && settings.data.enabled === false) {
      return NextResponse.json({ error: "This plan is currently disabled." }, { status: 403 });
    }
    amountRupees = planAmount(plan, cycle, settings.data as Record<string, unknown> | null);
    description = `${TULMIN_PLAN_BY_ID[plan].name} ${cycle} plan`;

    const settingsRow = (settings.data ?? {}) as {
      razorpay_monthly_plan_id?: string | null;
      razorpay_yearly_plan_id?: string | null;
    };
    const razorpayPlanId =
      (cycle === "yearly" ? settingsRow.razorpay_yearly_plan_id : settingsRow.razorpay_monthly_plan_id) ||
      envRazorpayPlanId(plan, cycle);
    if (!razorpayPlanId) {
      return NextResponse.json(
        {
          error:
            "Razorpay subscription plan ID is missing. Add monthly/yearly plan IDs in Admin > MRR & billing.",
        },
        { status: 503 }
      );
    }

    try {
      const subscription = await createRazorpaySubscription({
        keyId: config.keyId,
        keySecret: config.keySecret,
        planId: razorpayPlanId,
        totalCount: subscriptionTotalCount(cycle),
        customerNotify: true,
        notes: {
          userId: auth.user.id,
          type: body.type,
          plan,
          cycle,
        },
      });
      subscriptionId = subscription.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create Razorpay subscription.";
      return NextResponse.json(
        { error: message },
        { status: /auth|authentication|unauthorized/i.test(message) ? 401 : 500 }
      );
    }
  } else if (body.type === "topup") {
    const requested = Math.max(0, Math.floor(Number(body.labelCredits) || 0));
    const closest = ALLOWED_TOPUPS.find((value) => value === requested);
    if (!closest) {
      return NextResponse.json({ error: "Choose a valid label credit pack." }, { status: 400 });
    }
    cycle = "topup";
    labelCredits = closest;
    amountRupees = Math.ceil((closest / 1000) * TOPUP_PRICE_PER_1000_LABELS);
    description = `${closest.toLocaleString("en-IN")} extra labels`;
  } else {
    return NextResponse.json({ error: "Choose a plan or label credit pack." }, { status: 400 });
  }

  if (amountRupees <= 0) {
    return NextResponse.json({ error: "Invalid checkout amount." }, { status: 400 });
  }

  const receipt = `tulmin_${auth.user.id.slice(0, 8)}_${Date.now()}`;
  if (body.type === "topup") {
    try {
      order = await createRazorpayOrder({
        keyId: config.keyId,
        keySecret: config.keySecret,
        amountPaise: amountRupees * 100,
        receipt,
        notes: {
          userId: auth.user.id,
          type: body.type,
          plan: plan ?? "",
          cycle,
          labelCredits: String(labelCredits),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create Razorpay order.";
      return NextResponse.json(
        { error: message },
        { status: /auth|authentication|unauthorized/i.test(message) ? 401 : 500 }
      );
    }
  }

  const payment = await service
    .from("tulmin_payment_events")
    .insert({
      user_id: auth.user.id,
      provider: "razorpay",
      provider_order_id: order?.id ?? null,
      provider_subscription_id: subscriptionId || null,
      plan,
      amount: amountRupees,
      currency: "INR",
      status: "created",
      billing_cycle: cycle,
      label_credits: labelCredits,
      metadata: { description, receipt, mode: config.mode, checkoutKind: body.type === "plan" ? "subscription" : "order" },
    })
    .select("id")
    .maybeSingle();

  if (payment.error) {
    return NextResponse.json({ error: payment.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    keyId: config.keyId,
    orderId: order?.id,
    subscriptionId: subscriptionId || undefined,
    amount: order?.amount ?? amountRupees * 100,
    currency: order?.currency ?? "INR",
    paymentEventId: payment.data?.id,
    description,
    plan,
    cycle,
    labelCredits,
  });
}
