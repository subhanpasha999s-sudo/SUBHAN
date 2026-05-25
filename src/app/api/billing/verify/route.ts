import { NextResponse, type NextRequest } from "next/server";

import { fulfilBillingPayment } from "@/lib/billing/payment-fulfillment";
import { getRazorpayBillingConfig, verifyRazorpayPaymentSignature } from "@/lib/billing/razorpay";
import { requireBillingUser } from "@/lib/billing/server";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type VerifyBody = {
  orderId?: string;
  paymentId?: string;
  signature?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as VerifyBody;
  const orderId = body.orderId?.trim() ?? "";
  const paymentId = body.paymentId?.trim() ?? "";
  const signature = body.signature?.trim() ?? "";
  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "Missing Razorpay verification data." }, { status: 400 });
  }

  const service = getSupabaseServiceRole() ?? auth.sb;
  const config = await getRazorpayBillingConfig(service);
  if (!config?.keySecret) {
    return NextResponse.json({ error: "Razorpay verification is not configured." }, { status: 503 });
  }
  const valid = verifyRazorpayPaymentSignature({
    orderId,
    paymentId,
    signature,
    secret: config.keySecret,
  });
  if (!valid) {
    await service
      .from("tulmin_payment_events")
      .update({
        status: "failed",
        failure_reason: "signature_verification_failed",
        provider_payment_id: paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "razorpay")
      .eq("provider_order_id", orderId)
      .eq("user_id", auth.user.id);
    return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
  }

  const payment = await service
    .from("tulmin_payment_events")
    .select("id,user_id,plan,billing_cycle,label_credits,provider_order_id")
    .eq("provider", "razorpay")
    .eq("provider_order_id", orderId)
    .eq("user_id", auth.user.id)
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
  };

  await fulfilBillingPayment(service, {
    userId: row.user_id,
    paymentEventId: row.id,
    providerOrderId: row.provider_order_id,
    providerPaymentId: paymentId,
    plan: row.plan,
    cycle: row.billing_cycle,
    labelCredits: row.label_credits,
  });

  return NextResponse.json({ ok: true });
}
