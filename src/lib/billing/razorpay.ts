import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptBillingSecret } from "@/lib/admin/billing-settings";

export type RazorpayBillingConfig = {
  mode: "test" | "live";
  checkoutEnabled: boolean;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status?: string;
};

export async function getRazorpayBillingConfig(sb: SupabaseClient): Promise<RazorpayBillingConfig | null> {
  const result = await sb
    .from("tulmin_billing_settings")
    .select(
      "mode,checkout_enabled,razorpay_key_id,razorpay_key_secret_encrypted,razorpay_webhook_secret_encrypted"
    )
    .eq("id", true)
    .maybeSingle();

  if (result.error || !result.data) return null;
  const row = result.data as {
    mode?: "test" | "live";
    checkout_enabled?: boolean;
    razorpay_key_id?: string | null;
    razorpay_key_secret_encrypted?: string | null;
    razorpay_webhook_secret_encrypted?: string | null;
  };
  return {
    mode: row.mode ?? "test",
    checkoutEnabled: Boolean(row.checkout_enabled),
    keyId: row.razorpay_key_id ?? "",
    keySecret: decryptBillingSecret(row.razorpay_key_secret_encrypted),
    webhookSecret: decryptBillingSecret(row.razorpay_webhook_secret_encrypted),
  };
}

export function verifyRazorpayPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}) {
  if (!input.secret || !input.signature) return false;
  const expected = createHmac("sha256", input.secret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  return expected === input.signature;
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null, secret: string) {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

export async function createRazorpayOrder(input: {
  keyId: string;
  keySecret: string;
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrderResponse> {
  if (!input.keyId || !input.keySecret) {
    throw new Error("Razorpay keys are not configured.");
  }
  const auth = Buffer.from(`${input.keyId}:${input.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.max(100, Math.floor(input.amountPaise)),
      currency: input.currency ?? "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
    }),
  });
  const json = (await res.json().catch(() => ({}))) as RazorpayOrderResponse & { error?: { description?: string } };
  if (!res.ok) {
    throw new Error(json.error?.description || "Could not create Razorpay order.");
  }
  return json;
}
