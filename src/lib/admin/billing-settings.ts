import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { TULMIN_PLANS, type TulminPlanId } from "@/lib/billing/plans";

export type AdminBillingPlanSetting = {
  plan: TulminPlanId;
  enabled: boolean;
  monthlyPrice: number;
  yearlyMonthlyEquivalent: number;
  yearlyTotal: number;
  labelLimit: number | null;
  dailyLimit: number | null;
  razorpayMonthlyPlanId: string;
  razorpayYearlyPlanId: string;
};

export type AdminBillingSettings = {
  provider: "razorpay";
  mode: "test" | "live";
  checkoutEnabled: boolean;
  razorpayKeyId: string;
  razorpayKeySecretSaved: boolean;
  razorpayKeySecretLast4: string;
  razorpayWebhookSecretSaved: boolean;
  razorpayWebhookSecretLast4: string;
};

export function defaultBillingPlans(): AdminBillingPlanSetting[] {
  return TULMIN_PLANS.map((plan) => ({
    plan: plan.id,
    enabled: true,
    monthlyPrice: plan.monthlyPrice,
    yearlyMonthlyEquivalent: plan.yearlyMonthlyEquivalent,
    yearlyTotal: plan.yearlyTotal,
    labelLimit: plan.labelLimit,
    dailyLimit: plan.dailyLabelLimit ?? null,
    razorpayMonthlyPlanId: "",
    razorpayYearlyPlanId: "",
  }));
}

function encryptionKey() {
  const secret =
    process.env.TULMIN_BILLING_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXTAUTH_SECRET ??
    "";
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

export function encryptBillingSecret(value: string) {
  const key = encryptionKey();
  const clean = value.trim();
  if (!clean) return "";
  if (!key) {
    throw new Error("Set TULMIN_BILLING_SECRET_KEY before saving billing secrets.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptBillingSecret(value: string | null | undefined) {
  const key = encryptionKey();
  if (!value || !key) return "";
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) return "";
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function secretLast4(value: string) {
  const clean = value.trim();
  return clean ? clean.slice(-4) : "";
}
