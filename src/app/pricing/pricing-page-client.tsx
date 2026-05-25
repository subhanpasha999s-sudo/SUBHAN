"use client";

import * as React from "react";

import { AlertCircle } from "lucide-react";
import { toast as notify } from "sonner";

import { PricingCards } from "@/components/billing/pricing-cards";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { trackEvent } from "@/lib/analytics/posthog-client";
import type { BillingCycle, TulminPlanId } from "@/lib/billing/plans";
import { useSubscriptionEntitlement } from "@/lib/billing/use-subscription";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/auth-context";

type RazorpayCheckoutFailure = {
  error?: {
    description?: string;
    reason?: string;
  };
};

type RazorpayCheckoutResponse = {
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id?: string;
  subscription_id?: string;
  prefill?: {
    email?: string;
    name?: string;
  };
  handler: (response: RazorpayCheckoutResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayCheckoutInstance = {
  open: () => void;
  on?: (event: "payment.failed", handler: (response: RazorpayCheckoutFailure) => void) => void;
};

let razorpayScriptPromise: Promise<boolean> | null = null;

function getRazorpayConstructor() {
  return (window as Window & {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }).Razorpay;
}

function warmRazorpayConnection() {
  if (typeof document === "undefined") return;
  for (const rel of ["preconnect", "dns-prefetch"] as const) {
    const selector = `link[rel="${rel}"][href="https://checkout.razorpay.com"]`;
    if (document.head.querySelector(selector)) continue;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = "https://checkout.razorpay.com";
    if (rel === "preconnect") link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (getRazorpayConstructor()) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;
  warmRazorpayConnection();
  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      razorpayScriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

export function PricingPageClient() {
  const { user } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  const { entitlement, refresh: refreshEntitlement } = useSubscriptionEntitlement(user?.id);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const [checkoutTarget, setCheckoutTarget] = React.useState<{
    plan: TulminPlanId;
    cycle: BillingCycle;
  } | null>(null);

  React.useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    warmRazorpayConnection();
    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(() => void loadRazorpayScript(), { timeout: 2500 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(() => void loadRazorpayScript(), 800);
    return () => window.clearTimeout(timer);
  }, []);

  async function startBillingCheckout(plan: TulminPlanId, cycle: BillingCycle) {
    setCheckoutError(null);
    if (!user?.id) {
      setCheckoutError("Sign in before starting checkout.");
      openOptionalSignIn();
      return;
    }

    const sb = getSupabaseBrowser();
    const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) {
      setCheckoutError("Your login session is missing. Sign in again before checkout.");
      openOptionalSignIn();
      return;
    }

    setCheckoutBusy(true);
    setCheckoutTarget({ plan, cycle });
    try {
      const scriptReadyPromise = loadRazorpayScript();
      const checkout = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "plan",
          plan,
          cycle,
          browser: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            platform: navigator.platform,
            screen: `${window.screen.width}x${window.screen.height}x${window.devicePixelRatio}`,
          },
        }),
      });
      const order = (await checkout.json().catch(() => ({}))) as {
        ok?: boolean;
        keyId?: string;
        orderId?: string;
        subscriptionId?: string;
        amount?: number;
        currency?: string;
        description?: string;
        error?: string;
      };
      if (!checkout.ok || !order.ok || !order.keyId || (!order.orderId && !order.subscriptionId) || !order.amount) {
        throw new Error(order.error || "Could not start checkout.");
      }

      const scriptReady = await scriptReadyPromise;
      const Razorpay = getRazorpayConstructor();
      if (!scriptReady || !Razorpay) throw new Error("Could not load Razorpay checkout.");

      const razorpay = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency ?? "INR",
        name: "Tulmin AI",
        description: order.description ?? "Tulmin AI billing",
        ...(order.orderId ? { order_id: order.orderId } : {}),
        ...(order.subscriptionId ? { subscription_id: order.subscriptionId } : {}),
        prefill: {
          email: user.email ?? "",
          name: user.user_metadata?.full_name ? String(user.user_metadata.full_name) : "",
        },
        handler: async (response) => {
          try {
            const verified = await fetch("/api/billing/verify", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                subscriptionId: response.razorpay_subscription_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            const json = await verified.json().catch(() => ({}));
            if (!verified.ok) throw new Error(json.error || "Payment verification failed.");
            await refreshEntitlement();
            notify.success("Plan upgraded", {
              description: "Your workspace is ready to continue.",
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Please contact support if money was debited.";
            setCheckoutError(`Payment verification failed: ${message}`);
            notify.error("Payment verification failed", { description: message });
          } finally {
            setCheckoutBusy(false);
            setCheckoutTarget(null);
          }
        },
        modal: {
          ondismiss: () => {
            setCheckoutBusy(false);
            setCheckoutTarget(null);
            notify.info("Checkout cancelled", {
              description: "No payment was taken.",
            });
          },
        },
      });
      razorpay.on?.("payment.failed", (response) => {
        const message =
          response.error?.description ||
          response.error?.reason ||
          "Razorpay could not complete this payment.";
        setCheckoutError(message);
        setCheckoutBusy(false);
        setCheckoutTarget(null);
        notify.error("Payment failed", { description: message });
      });
      razorpay.open();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      setCheckoutError(message);
      notify.error("Checkout could not start", {
        description: message,
      });
      setCheckoutBusy(false);
      setCheckoutTarget(null);
    }
  }

  return (
    <>
      {checkoutError ? (
        <div
          role="alert"
          className="fixed inset-x-4 top-20 z-20 mx-auto flex max-w-2xl gap-3 rounded-[1.1rem] border border-rose-400/25 bg-rose-500/15 p-4 text-sm leading-6 text-rose-50 shadow-2xl backdrop-blur"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-300" aria-hidden />
          <div>
            <p className="font-semibold text-rose-100">Checkout did not start</p>
            <p className="mt-1 text-rose-50/85">{checkoutError}</p>
          </div>
        </div>
      ) : null}
      <PricingCards
        currentPlan={entitlement.plan}
        busyPlan={checkoutTarget?.plan ?? null}
        busyCycle={checkoutTarget?.cycle ?? null}
        disabled={checkoutBusy}
        onChoosePlan={(plan, cycle) => {
          trackEvent("billing_pricing_page_plan_selected", {
            plan,
            cycle,
            current_plan: entitlement.plan,
          });
          void startBillingCheckout(plan, cycle);
        }}
      />
    </>
  );
}
