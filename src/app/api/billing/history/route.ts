import { NextResponse, type NextRequest } from "next/server";

import {
  getServerEntitlement,
  requestFingerprint,
  requireBillingUser,
} from "@/lib/billing/server";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

export async function GET(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth.response;
  const service = getSupabaseServiceRole() ?? auth.sb;
  const browser = Object.fromEntries(req.nextUrl.searchParams.entries());
  const fp = requestFingerprint(req, browser);
  const entitlement = await getServerEntitlement(service, auth.user.id, fp.deviceHash);

  const [payments, credits, subscription] = await Promise.all([
    service
      .from("tulmin_payment_events")
      .select(
        "id,plan,amount,currency,status,billing_cycle,label_credits,provider_payment_id,provider_order_id,invoice_url,failure_reason,created_at"
      )
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("tulmin_label_credit_grants")
      .select("id,label_count,used_label_count,reason,expires_at,created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("tulmin_user_subscriptions")
      .select("plan,status,current_period_start,current_period_end,provider_subscription_id")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    entitlement,
    subscription: subscription.error ? null : subscription.data ?? null,
    payments: payments.error ? [] : payments.data ?? [],
    credits: credits.error ? [] : credits.data ?? [],
  });
}
