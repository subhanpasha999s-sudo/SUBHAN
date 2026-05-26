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

type RazorpaySubscriptionResponse = {
  id: string;
  status?: string;
  plan_id?: string;
  short_url?: string;
  start_at?: number;
  current_start?: number;
  current_end?: number;
  charge_at?: number;
  end_at?: number;
};

export function getRazorpayEnvConfig(): RazorpayBillingConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !keySecret) return null;

  return {
    mode: keyId.includes("_live_") ? "live" : "test",
    checkoutEnabled: process.env.RAZORPAY_CHECKOUT_ENABLED !== "false",
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  };
}

export async function getRazorpayBillingConfig(sb: SupabaseClient): Promise<RazorpayBillingConfig | null> {
  const envConfig = getRazorpayEnvConfig();
  const result = await sb
    .from("tulmin_billing_settings")
    .select(
      "mode,checkout_enabled,razorpay_key_id,razorpay_key_secret_encrypted,razorpay_webhook_secret_encrypted"
    )
    .eq("id", true)
    .maybeSingle();

  if (result.error || !result.data) return envConfig;
  const row = result.data as {
    mode?: "test" | "live";
    checkout_enabled?: boolean;
    razorpay_key_id?: string | null;
    razorpay_key_secret_encrypted?: string | null;
    razorpay_webhook_secret_encrypted?: string | null;
  };
  return {
    mode: row.mode ?? "test",
    checkoutEnabled: Boolean(row.checkout_enabled) || Boolean(envConfig?.checkoutEnabled),
    keyId: row.razorpay_key_id || envConfig?.keyId || "",
    keySecret: decryptBillingSecret(row.razorpay_key_secret_encrypted) || envConfig?.keySecret || "",
    webhookSecret: decryptBillingSecret(row.razorpay_webhook_secret_encrypted) || envConfig?.webhookSecret || "",
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

export function verifyRazorpaySubscriptionSignature(input: {
  subscriptionId: string;
  paymentId: string;
  signature: string;
  secret: string;
}) {
  if (!input.secret || !input.signature) return false;
  const expected = createHmac("sha256", input.secret)
    .update(`${input.paymentId}|${input.subscriptionId}`)
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

export async function createRazorpaySubscription(input: {
  keyId: string;
  keySecret: string;
  planId: string;
  totalCount: number;
  quantity?: number;
  customerNotify?: boolean;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscriptionResponse> {
  if (!input.keyId || !input.keySecret) {
    throw new Error("Razorpay keys are not configured.");
  }
  if (!input.planId) {
    throw new Error("Razorpay subscription plan ID is not configured.");
  }

  const auth = Buffer.from(`${input.keyId}:${input.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: input.planId,
      total_count: Math.max(1, Math.floor(input.totalCount)),
      quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
      customer_notify: input.customerNotify === true ? 1 : 0,
      notes: input.notes ?? {},
    }),
  });

  const json = (await res.json().catch(() => ({}))) as RazorpaySubscriptionResponse & {
    error?: { description?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.description || "Could not create Razorpay subscription.");
  }
  return json;
}

export async function getRazorpaySubscription(input: {
  keyId: string;
  keySecret: string;
  subscriptionId: string;
}): Promise<RazorpaySubscriptionResponse | null> {
  if (!input.keyId || !input.keySecret || !input.subscriptionId) return null;
  const auth = Buffer.from(`${input.keyId}:${input.keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${input.subscriptionId}`, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as RazorpaySubscriptionResponse | null;
}
