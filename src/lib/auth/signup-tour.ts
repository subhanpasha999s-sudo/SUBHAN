"use client";

import type { User } from "@supabase/supabase-js";

const SIGNUP_TOUR_PENDING_KEY = "tulmin.signup-tour.pending-v1";
const SIGNUP_TOUR_GIVEN_PREFIX = "tulmin.signup-tour.given-user:";
const RECENT_SIGNUP_MS = 10 * 60 * 1000;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function givenKey(userId: string) {
  return `${SIGNUP_TOUR_GIVEN_PREFIX}${userId}`;
}

export function markSignupTourPending(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  safeSet(
    SIGNUP_TOUR_PENDING_KEY,
    JSON.stringify({ email: normalized, markedAt: Date.now() }),
  );
}

export function shouldGiveSignupTour(user: User, now = Date.now()) {
  if (safeGet(givenKey(user.id))) return false;

  const email = normalizeEmail(user.email);
  const rawPending = safeGet(SIGNUP_TOUR_PENDING_KEY);
  if (rawPending) {
    try {
      const pending = JSON.parse(rawPending) as {
        email?: unknown;
        markedAt?: unknown;
      };
      if (
        typeof pending.email === "string" &&
        normalizeEmail(pending.email) === email
      ) {
        return true;
      }
    } catch {
      safeRemove(SIGNUP_TOUR_PENDING_KEY);
    }
  }

  const createdAt = Date.parse(user.created_at);
  return Number.isFinite(createdAt) && now - createdAt >= 0 && now - createdAt < RECENT_SIGNUP_MS;
}

export function markSignupTourGiven(user: User) {
  safeSet(givenKey(user.id), String(Date.now()));
  const rawPending = safeGet(SIGNUP_TOUR_PENDING_KEY);
  if (!rawPending) return;
  try {
    const pending = JSON.parse(rawPending) as { email?: unknown };
    if (
      typeof pending.email === "string" &&
      normalizeEmail(pending.email) === normalizeEmail(user.email)
    ) {
      safeRemove(SIGNUP_TOUR_PENDING_KEY);
    }
  } catch {
    safeRemove(SIGNUP_TOUR_PENDING_KEY);
  }
}
