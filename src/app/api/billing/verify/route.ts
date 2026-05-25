import { NextResponse, type NextRequest } from "next/server";

import { fulfilBillingPayment } from "@/lib/billing/payment-fulfillment";
import {
  getRazorpayBillingConfig,
  verifyRazorpayPaymentSignature,
  verifyRazorpaySubscriptionSignature,
} from "@/lib/billing/razorpay";
import { requireBillingUser } from "@/lib/billing/server";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type VerifyBody = {
  orderId?: string;
  subscriptionId?: string;
  paymentId?: string;
  signature?: string;
};

function metadataCheckoutExpiresAt(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("checkoutExpiresAt" in metadata)) return null;
  const value = (metadata as { checkoutExpiresAt?: unknown }).checkoutExpiresAt;
  return typeof value === "string" ? value : null;
}

function checkoutExpired(expiresAt: string | null) {
  return Boolean(expiresAt && Date.now() > new Date(expiresAt).getTime());
}

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as VerifyBody;
  const orderId = body.orderId?.trim() ?? "";
  const subscriptionId = body.subscriptionId?.trim() ?? "";
  const paymentId = body.paymentId?.trim() ?? "";
  const signature = body.signature?.trim() ?? "";
  if ((!orderId && !subscriptionId) || !paymentId || !signature) {
    return NextResponse.json({ error: "Missing Razorpay verification data." }, { status: 400 });
  }

  const service = getSupabaseServiceRole() ?? auth.sb;
  const config = await getRazorpayBillingConfig(service);
  if (!config?.keySecret) {
    return NextResponse.json({ error: "Razorpay verification is not configured." }, { status: 503 });
  }
  const valid = subscriptionId
    ? verifyRazorpaySubscriptionSignature({
        subscriptionId,
        paymentId,
        signature,
        secret: config.keySecret,
      })
    : verifyRazorpayPaymentSignature({
        orderId,
        paymentId,
        signature,
        secret: config.keySecret,
      });
  if (!valid) {
    let failed = service
      .from("tulmin_payment_events")
      .update({
          status: "failed",
          failure_reason: "signature_verification_failed",
          provider_payment_id: paymentId,
          updated_at: new Date().toISOString(),
        })
      .eq("provider", "razorpay")
      .eq("user_id", auth.user.id);
    failed = subscriptionId
      ? failed.eq("provider_subscription_id", subscriptionId)
      : failed.eq("provider_order_id", orderId);
    await failed;
    return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
  }

  let paymentQuery = service
    .from("tulmin_payment_events")
    .select("id,user_id,plan,billing_cycle,label_credits,provider_order_id,provider_subscription_id,status,metadata")
    .eq("provider", "razorpay")
    .eq("user_id", auth.user.id);
  paymentQuery = subscriptionId
    ? paymentQuery.eq("provider_subscription_id", subscriptionId)
    : paymentQuery.eq("provider_order_id", orderId);
  const payment = await paymentQuery
    .maybeSingle();
  if (payment.error || !payment.data) {
    return NextResponse.json({ error: "Payment order was not found." }, { status: 404 });
  }

  const row = payment.data as {
    id: number;
    user_id: string;
    plan?: "free" | "starter" | "pro" | "business" | null;
    billing_cycle?: "monthly" | "yearly" | "topup" | null;
    label_credits?: number | null;
    provider_order_id?: string | null;
    provider_subscription_id?: string | null;
    status?: string | null;
    metadata?: unknown;
  };

  if (row.status !== "paid" && checkoutExpired(metadataCheckoutExpiresAt(row.metadata))) {
    await service
      .from("tulmin_payment_events")
      .update({
        status: "failed",
        failure_reason: "checkout_expired",
        provider_payment_id: paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .neq("status", "paid");
    return NextResponse.json(
      { error: "Checkout expired. Please start a new payment within 5 minutes." },
      { status: 410 }
    );
  }

  await fulfilBillingPayment(service, {
    userId: row.user_id,
    paymentEventId: row.id,
    providerOrderId: row.provider_order_id,
    providerPaymentId: paymentId,
    providerSubscriptionId: row.provider_subscription_id,
    userEmail: auth.user.email ?? null,
    plan: row.plan,
    cycle: row.billing_cycle,
    labelCredits: row.label_credits,
  });

  return NextResponse.json({ ok: true });
}
