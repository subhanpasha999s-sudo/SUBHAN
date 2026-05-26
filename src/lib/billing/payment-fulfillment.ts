import type { SupabaseClient } from "@supabase/supabase-js";

import type { BillingCycle, TulminPlanId } from "@/lib/billing/plans";

export type BillingIntentType = "plan" | "topup";

export type BillingIntentMetadata = {
  type: BillingIntentType;
  userId: string;
  plan?: TulminPlanId;
  cycle?: BillingCycle | "topup";
  labelCredits?: number;
};

export function periodEndForCycle(cycle: BillingCycle | "topup" | undefined, from = new Date()) {
  const next = new Date(from);
  if (cycle === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

function unixSecondsToIso(value?: number | null) {
  if (!value || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function missingColumn(error: { message?: string } | null | undefined, column: string) {
  return Boolean(error?.message?.includes(column));
}

export async function fulfilBillingPayment(
  sb: SupabaseClient,
  input: {
    userId: string;
    paymentEventId?: number | null;
    providerOrderId?: string | null;
    providerPaymentId?: string | null;
    providerInvoiceId?: string | null;
    providerSubscriptionId?: string | null;
    userEmail?: string | null;
    plan?: TulminPlanId | null;
    cycle?: BillingCycle | "topup" | null;
    labelCredits?: number | null;
    invoiceUrl?: string | null;
    currentPeriodStart?: string | number | null;
    currentPeriodEnd?: string | number | null;
    rawEvent?: unknown;
  }
) {
  const now = new Date().toISOString();
  const labelCredits = Math.max(0, Math.floor(Number(input.labelCredits) || 0));
  const cycle = input.cycle ?? null;
  let paymentClaimed = false;

  if (input.paymentEventId) {
    const claimed = await sb
      .from("tulmin_payment_events")
      .update({
        status: "fulfilling",
        updated_at: now,
      })
      .eq("id", input.paymentEventId)
      .neq("status", "paid")
      .neq("status", "fulfilling")
      .select("id")
      .maybeSingle();
    if (claimed.error || !claimed.data) return;
    paymentClaimed = true;
  }

  if (input.plan && input.plan !== "free") {
    const currentPeriodStart =
      typeof input.currentPeriodStart === "number"
        ? unixSecondsToIso(input.currentPeriodStart)
        : input.currentPeriodStart;
    const currentPeriodEnd =
      typeof input.currentPeriodEnd === "number"
        ? unixSecondsToIso(input.currentPeriodEnd)
        : input.currentPeriodEnd;
    const subscriptionRow = {
      user_id: input.userId,
      user_email: input.userEmail?.toLowerCase() ?? null,
      plan: input.plan,
      status: "active",
      current_period_start: currentPeriodStart || now,
      current_period_end: currentPeriodEnd || periodEndForCycle(cycle === "yearly" ? "yearly" : "monthly"),
      provider: "razorpay",
      provider_subscription_id: input.providerSubscriptionId ?? undefined,
      updated_at: now,
    };
    const subscription = await sb
      .from("tulmin_user_subscriptions")
      .upsert(subscriptionRow, { onConflict: "user_id" });
    if (missingColumn(subscription.error, "user_email")) {
      const { user_email: _userEmail, ...fallbackRow } = subscriptionRow;
      await sb.from("tulmin_user_subscriptions").upsert(fallbackRow, { onConflict: "user_id" });
    }
  }

  if (labelCredits > 0) {
    const creditGrantRow = {
      user_id: input.userId,
      user_email: input.userEmail?.toLowerCase() ?? null,
      label_count: labelCredits,
      reason: input.plan ? "plan_bonus" : "topup_payment",
      payment_event_id: input.paymentEventId ?? null,
      expires_at: periodEndForCycle("monthly"),
      metadata: {
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        cycle,
      },
    };
    let creditGrant = await sb.from("tulmin_label_credit_grants").insert(creditGrantRow);
    if (missingColumn(creditGrant.error, "user_email")) {
      const { user_email: _userEmail, ...fallbackRow } = creditGrantRow;
      creditGrant = await sb.from("tulmin_label_credit_grants").insert(fallbackRow);
    }
    if (creditGrant.error && creditGrant.error.code !== "23505") {
      if (paymentClaimed && input.paymentEventId) {
        await sb
          .from("tulmin_payment_events")
          .update({
            status: "failed",
            failure_reason: creditGrant.error.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.paymentEventId);
      }
      return;
    }
  }

  const paymentPatch: Record<string, unknown> = {
    status: "paid",
    updated_at: now,
  };
  if (input.providerPaymentId) paymentPatch.provider_payment_id = input.providerPaymentId;
  if (input.providerInvoiceId) paymentPatch.provider_invoice_id = input.providerInvoiceId;
  if (input.providerSubscriptionId) paymentPatch.provider_subscription_id = input.providerSubscriptionId;
  if (input.invoiceUrl) paymentPatch.invoice_url = input.invoiceUrl;
  if (input.rawEvent) paymentPatch.raw_event = input.rawEvent;

  if (input.paymentEventId) {
    await sb.from("tulmin_payment_events").update(paymentPatch).eq("id", input.paymentEventId);
  } else if (input.providerOrderId) {
    await sb
      .from("tulmin_payment_events")
      .update(paymentPatch)
      .eq("provider", "razorpay")
      .eq("provider_order_id", input.providerOrderId);
  }
}
