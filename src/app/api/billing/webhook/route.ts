import { NextResponse, type NextRequest } from "next/server";

import { fulfilBillingPayment } from "@/lib/billing/payment-fulfillment";
import { getRazorpayBillingConfig, verifyRazorpayWebhookSignature } from "@/lib/billing/razorpay";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type RazorpayWebhook = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        subscription_id?: string;
        invoice_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        error_description?: string;
        notes?: Record<string, string>;
      };
    };
  };
};

export async function POST(req: NextRequest) {
  const service = getSupabaseServiceRole();
  if (!service) return NextResponse.json({ error: "Service role is not configured." }, { status: 503 });

  const rawBody = await req.text();
  const config = await getRazorpayBillingConfig(service);
  if (!config?.webhookSecret) {
    return NextResponse.json({ error: "Razorpay webhook secret is not configured." }, { status: 503 });
  }
  const signature = req.headers.get("x-razorpay-signature");
  if (!verifyRazorpayWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as RazorpayWebhook;
  const providerEventId = req.headers.get("x-razorpay-event-id") || `${event.event ?? "event"}:${Date.now()}`;
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id ?? "";
  const subscriptionId = payment?.subscription_id ?? "";
  const paymentId = payment?.id ?? "";
  const notes = payment?.notes ?? {};
  const userId = notes.userId;
  const userEmail = notes.userEmail?.trim().toLowerCase() || null;

  if ((!orderId && !subscriptionId) || !paymentId || !userId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let existingQuery = service
    .from("tulmin_payment_events")
    .select("id,user_id,plan,billing_cycle,label_credits,provider_order_id,provider_subscription_id,status")
    .eq("provider", "razorpay");
  existingQuery = subscriptionId
    ? existingQuery.eq("provider_subscription_id", subscriptionId)
    : existingQuery.eq("provider_order_id", orderId);
  const existing = await existingQuery.maybeSingle();

  if (event.event === "payment.failed") {
    const failurePayload = {
      user_id: existing.data?.user_id ?? userId,
      provider: "razorpay",
      provider_event_id: providerEventId,
      provider_order_id: orderId || null,
      provider_subscription_id: subscriptionId || null,
      provider_payment_id: paymentId,
      amount: Math.round((Number(payment?.amount) || 0) / 100),
      currency: payment?.currency ?? "INR",
      status: "failed",
      failure_reason: payment?.error_description ?? "payment_failed",
      raw_event: event,
      updated_at: new Date().toISOString(),
    };
    if (existing.data?.id) {
      await service.from("tulmin_payment_events").update(failurePayload).eq("id", existing.data.id);
    } else {
      await service.from("tulmin_payment_events").insert(failurePayload);
    }
    return NextResponse.json({ ok: true });
  }

  if (event.event !== "payment.captured" && payment?.status !== "captured") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const row = existing.data as
    | {
        id: number;
        user_id: string;
        plan?: "free" | "starter" | "pro" | "business" | null;
        billing_cycle?: "monthly" | "yearly" | "topup" | null;
        label_credits?: number | null;
        provider_order_id?: string | null;
        provider_subscription_id?: string | null;
        status?: string | null;
      }
    | null;

  if (!row) {
    const inserted = await service
      .from("tulmin_payment_events")
      .insert({
        user_id: userId,
        provider: "razorpay",
        provider_event_id: providerEventId,
        provider_order_id: orderId || null,
        provider_subscription_id: subscriptionId || null,
        provider_payment_id: paymentId,
        provider_invoice_id: payment?.invoice_id ?? null,
        plan: notes.plan || null,
        amount: Math.round((Number(payment?.amount) || 0) / 100),
        currency: payment?.currency ?? "INR",
        status: "created",
        billing_cycle: notes.cycle || null,
        label_credits: Math.max(0, Math.floor(Number(notes.labelCredits) || 0)),
        raw_event: event,
        metadata: { webhookCreated: true },
      })
      .select("id,user_id,plan,billing_cycle,label_credits,provider_order_id,provider_subscription_id")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      return NextResponse.json({ error: inserted.error?.message ?? "Could not save payment." }, { status: 500 });
    }
    await fulfilBillingPayment(service, {
      userId,
      userEmail,
      paymentEventId: inserted.data.id,
      providerOrderId: orderId,
      providerSubscriptionId: subscriptionId || inserted.data.provider_subscription_id,
      providerPaymentId: paymentId,
      providerInvoiceId: payment?.invoice_id ?? null,
      plan: inserted.data.plan,
      cycle: inserted.data.billing_cycle,
      labelCredits: inserted.data.label_credits,
      rawEvent: event,
    });
    return NextResponse.json({ ok: true });
  }

  if (row.status === "paid") return NextResponse.json({ ok: true, duplicate: true });
  await service
    .from("tulmin_payment_events")
    .update({
      provider_event_id: providerEventId,
      raw_event: event,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  await fulfilBillingPayment(service, {
    userId: row.user_id,
    userEmail,
    paymentEventId: row.id,
    providerOrderId: row.provider_order_id,
    providerSubscriptionId: row.provider_subscription_id,
    providerPaymentId: paymentId,
    providerInvoiceId: payment?.invoice_id ?? null,
    plan: row.plan,
    cycle: row.billing_cycle,
    labelCredits: row.label_credits,
    rawEvent: event,
  });

  return NextResponse.json({ ok: true });
}
