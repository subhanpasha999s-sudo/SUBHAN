"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useAuth } from "@/lib/supabase/auth-context";
import {
  identifyUser,
  initAnalytics,
  resetAnalyticsUser,
  trackEvent,
  trackPageView,
} from "@/lib/analytics/posthog-client";

export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, authReady } = useAuth();

  React.useEffect(() => {
    initAnalytics();
  }, []);

  React.useEffect(() => {
    if (!pathname) return;
    const q = searchParams?.toString();
    const path = q ? `${pathname}?${q}` : pathname;
    trackPageView(path);
  }, [pathname, searchParams]);

  React.useEffect(() => {
    if (!authReady) return;
    if (user?.id) {
      identifyUser(user.id, { email: user.email ?? undefined });
      trackEvent("auth_user_ready", { method: "session", has_email: Boolean(user.email) });
      return;
    }
    resetAnalyticsUser();
  }, [authReady, user?.id, user?.email]);

  return null;
}
