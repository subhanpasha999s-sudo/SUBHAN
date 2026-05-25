import { NextResponse, type NextRequest } from "next/server";

import { createRazorpayOrder, getRazorpayEnvConfig } from "@/lib/billing/razorpay";
import { requireBillingUser } from "@/lib/billing/server";

type CreateOrderBody = {
  amount?: number;
  currency?: string;
  receipt?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;

  const config = getRazorpayEnvConfig();
  if (!config?.keyId || !config.keySecret) {
    return NextResponse.json({ error: "Razorpay credentials are not configured." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as CreateOrderBody;
  const amount = Math.floor(Number(body.amount) || 0);
  if (amount < 100) {
    return NextResponse.json({ error: "Amount must be at least 100 paise." }, { status: 400 });
  }

  const currency = (body.currency || "INR").trim().toUpperCase();
  const receipt =
    body.receipt?.trim() || `tulmin_std_${auth.user.id.slice(0, 8)}_${Date.now()}`;

  try {
    const order = await createRazorpayOrder({
      keyId: config.keyId,
      keySecret: config.keySecret,
      amountPaise: amount,
      currency,
      receipt,
      notes: {
        userId: auth.user.id,
        source: "standard_checkout",
      },
    });

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create Razorpay order.",
      },
      { status: 500 }
    );
  }
}
