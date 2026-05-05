"use client";

import posthog from "posthog-js";

type EventProps = Record<string, string | number | boolean | null | undefined>;

let started = false;

function analyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

export function initAnalytics() {
  if (started || typeof window === "undefined" || !analyticsEnabled()) return;
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: "identified_only",
  });
  started = true;
}

export function trackEvent(name: string, props?: EventProps) {
  if (!started || !analyticsEnabled()) return;
  posthog.capture(name, props);
}

export function trackPageView(path: string) {
  trackEvent("page_view", { path });
}

export function identifyUser(userId: string, props?: EventProps) {
  if (!started || !analyticsEnabled()) return;
  posthog.identify(userId, props);
}

export function resetAnalyticsUser() {
  if (!started || !analyticsEnabled()) return;
  posthog.reset();
}
