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

export async function fulfilBillingPayment(
  sb: SupabaseClient,
  input: {
    userId: string;
    paymentEventId?: number | null;
    providerOrderId?: string | null;
    providerPaymentId?: string | null;
    providerInvoiceId?: string | null;
    providerSubscriptionId?: string | null;
    plan?: TulminPlanId | null;
    cycle?: BillingCycle | "topup" | null;
    labelCredits?: number | null;
    invoiceUrl?: string | null;
    rawEvent?: unknown;
  }
) {
  const now = new Date().toISOString();
  const labelCredits = Math.max(0, Math.floor(Number(input.labelCredits) || 0));
  const cycle = input.cycle ?? null;

  if (input.plan && input.plan !== "free") {
    await sb.from("tulmin_user_subscriptions").upsert(
      {
        user_id: input.userId,
        plan: input.plan,
        status: "active",
        current_period_start: now,
        current_period_end: periodEndForCycle(cycle === "yearly" ? "yearly" : "monthly"),
        provider: "razorpay",
        provider_subscription_id: input.providerSubscriptionId ?? undefined,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );
  }

  if (labelCredits > 0) {
    await sb.from("tulmin_label_credit_grants").insert({
      user_id: input.userId,
      label_count: labelCredits,
      reason: input.plan ? "plan_bonus" : "topup_payment",
      payment_event_id: input.paymentEventId ?? null,
      expires_at: periodEndForCycle("monthly"),
      metadata: {
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        cycle,
      },
    });
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
