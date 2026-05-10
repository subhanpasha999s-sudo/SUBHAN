"use client";

import posthog from "posthog-js";

type EventProps = Record<string, string | number | boolean | null | undefined>;

let started = false;

function analyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim());
}

/** Idempotent client init — safe to call from any track/identify path (fixes race with auth listeners). */
function ensureStarted(): boolean {
  if (typeof window === "undefined" || !analyticsEnabled()) return false;
  if (started) return true;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY!.trim();
  const apiHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

  posthog.init(key, {
    api_host: apiHost,
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: "identified_only",
    persistence: "localStorage+cookie",
    loaded: (ph) => {
      if (process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "true") {
        ph.debug();
      }
    },
  });
  started = true;
  return true;
}

export function initAnalytics() {
  ensureStarted();
}

export function trackEvent(name: string, props?: EventProps) {
  if (!ensureStarted()) return;
  posthog.capture(name, props);
}

/**
 * SPA route changes: sends PostHog's `$pageview` (web analytics + paths) plus a Tulmin `page_view` event.
 */
export function trackPageView(path: string) {
  if (!ensureStarted()) return;

  let $current_url: string;
  try {
    $current_url = new URL(path, window.location.origin).href;
  } catch {
    $current_url = `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
  }

  posthog.capture("$pageview", { $current_url });
  posthog.capture("page_view", { path });
}

export function identifyUser(userId: string, props?: EventProps) {
  if (!ensureStarted()) return;
  posthog.identify(userId, props);
}

export function resetAnalyticsUser() {
  if (!analyticsEnabled()) return;
  if (!ensureStarted()) return;
  posthog.reset();
}
