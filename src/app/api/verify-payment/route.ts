import { NextResponse, type NextRequest } from "next/server";

import { getRazorpayEnvConfig, verifyRazorpayPaymentSignature } from "@/lib/billing/razorpay";
import { requireBillingUser } from "@/lib/billing/server";

type VerifyPaymentBody = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as VerifyPaymentBody;
  const orderId = body.razorpay_order_id?.trim() ?? "";
  const paymentId = body.razorpay_payment_id?.trim() ?? "";
  const signature = body.razorpay_signature?.trim() ?? "";

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "Missing Razorpay verification fields." }, { status: 400 });
  }

  const config = getRazorpayEnvConfig();
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
    return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
