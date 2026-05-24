"use client";

import * as React from "react";

import { getBillingBrowserSignals } from "@/lib/billing/device-fingerprint";
import { TULMIN_PLAN_BY_ID, type TulminPlanId } from "@/lib/billing/plans";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";

export type SubscriptionEntitlement = {
  plan: TulminPlanId;
  status: "active" | "trialing" | "free" | "past_due";
  labelsUsed: number;
  labelsLimit: number | null;
  labelsRemaining: number | null;
  dailyLabelsUsed: number;
  dailyLabelsLimit: number | null;
  dailyLabelsRemaining: number | null;
  monthKey: string;
  dayKey: string;
  abuseReview: boolean;
  loaded: boolean;
};

export type UsageReservationResult =
  | {
      ok: true;
      entitlement: SubscriptionEntitlement;
      acceptedLabelCount: number;
      rejectedLabelCount: number;
      partial?: boolean;
      limitReached?: boolean;
      message?: string;
    }
  | {
      ok: false;
      reason: "limit_reached" | "signin_required" | "abuse_review" | "server_unavailable";
      message: string;
      entitlement?: SubscriptionEntitlement;
    };

const DEFAULT_FREE_ENTITLEMENT: SubscriptionEntitlement = {
  plan: "free",
  status: "free",
  labelsUsed: 0,
  labelsLimit: TULMIN_PLAN_BY_ID.free.labelLimit,
  labelsRemaining: TULMIN_PLAN_BY_ID.free.labelLimit,
  dailyLabelsUsed: 0,
  dailyLabelsLimit: TULMIN_PLAN_BY_ID.free.dailyLabelLimit ?? null,
  dailyLabelsRemaining: TULMIN_PLAN_BY_ID.free.dailyLabelLimit ?? null,
  monthKey: "",
  dayKey: "",
  abuseReview: false,
  loaded: false,
};

async function authHeader(): Promise<Record<string, string> | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export function useSubscriptionEntitlement(userId: string | undefined) {
  const [entitlement, setEntitlement] =
    React.useState<SubscriptionEntitlement>(DEFAULT_FREE_ENTITLEMENT);
  const [loading, setLoading] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [upgradeReason, setUpgradeReason] = React.useState<string>("");

  const refresh = React.useCallback(async () => {
    if (!userId) {
      setEntitlement(DEFAULT_FREE_ENTITLEMENT);
      return DEFAULT_FREE_ENTITLEMENT;
    }
    setLoading(true);
    try {
      const headers = await authHeader();
      if (!headers) return DEFAULT_FREE_ENTITLEMENT;
      const qs = new URLSearchParams(getBillingBrowserSignals()).toString();
      const res = await fetch(`/api/billing/entitlement?${qs}`, {
        headers,
        cache: "no-store",
      });
      const data = (await res.json()) as { entitlement?: SubscriptionEntitlement };
      if (res.ok && data.entitlement) {
        setEntitlement({ ...data.entitlement, loaded: true });
        return { ...data.entitlement, loaded: true };
      }
    } catch {
      // Keep the UI usable; reserve calls still enforce server-side when available.
    } finally {
      setLoading(false);
    }
    setEntitlement((prev) => ({ ...prev, loaded: true }));
    return entitlement;
  }, [entitlement, userId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const reserveLabels = React.useCallback(
    async (
      labelCount: number,
      action: "import" | "export" = "import",
      options?: { allowPartial?: boolean }
    ): Promise<UsageReservationResult> => {
      if (!userId) {
        return {
          ok: false,
          reason: "signin_required",
          message: "Sign in to start your free Tulmin AI trial.",
        };
      }

      try {
        const headers = await authHeader();
        if (!headers) {
          return {
            ok: false,
            reason: "signin_required",
            message: "Sign in to continue.",
          };
        }
        const res = await fetch("/api/billing/usage", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            labelCount,
            allowPartial: Boolean(options?.allowPartial),
            browser: getBillingBrowserSignals(),
          }),
        });
        const data = (await res.json()) as UsageReservationResult;
        if (data.ok) {
          setEntitlement({ ...data.entitlement, loaded: true });
          if (data.limitReached && data.message) {
            setUpgradeReason(data.message);
            setUpgradeOpen(true);
          }
        } else {
          if (data.entitlement) setEntitlement({ ...data.entitlement, loaded: true });
          setUpgradeReason(data.message);
          setUpgradeOpen(true);
        }
        return data;
      } catch {
        return {
          ok: false,
          reason: "server_unavailable",
          message: "Could not validate usage right now. Please try again.",
        };
      }
    },
    [userId]
  );

  const promptUpgrade = React.useCallback((reason: string) => {
    setUpgradeReason(reason);
    setUpgradeOpen(true);
  }, []);

  return {
    entitlement,
    loading,
    refresh,
    reserveLabels,
    upgradeOpen,
    setUpgradeOpen,
    upgradeReason,
    promptUpgrade,
  };
}
