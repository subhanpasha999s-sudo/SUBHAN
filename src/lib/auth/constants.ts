/** Default entry route after generic auth or anonymous visits. */
export const AUTH_DASHBOARD_PATH = "/";

/**
 * Visiting `/login?signin=1` shows the legacy full-page sign-in form.
 * All other `/login` visits redirect into the app; use the header icon OTP modal instead.
 */
export const SIGNIN_FLOW_QUERY_PARAM = "signin";

/** localStorage key: `"otp"` | `"password"` */
export const LAST_AUTH_METHOD_KEY = "lable.auth.last-method";

/** Must match Supabase Auth → Email OTP length. */
export const EMAIL_OTP_LENGTH = 6;

/** User opted out of the workspace «save to cloud» prompt (persisted). */
export const SIGNIN_NUDGE_DISMISS_KEY = "lable.workspace-signin-nudge-dismissed";

/** At most one auto-open per browser tab session (until tab closed). */
export const SIGNIN_NUDGE_SESSION_KEY = "lable.workspace-signin-nudge-session";

export function safeInternalNextPath(
  raw: string | null,
  fallback = AUTH_DASHBOARD_PATH
): string {
  if (!raw || typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw.split("?")[0] || fallback;
}

/**
 * Passed to `signInWithOtp({ options: { emailRedirectTo } })` so email-code messages
 * bounce back to wherever the app is actually hosted (not only Supabase “Site URL”).
 * Redirect host must still be listed under Supabase → Authentication → Redirect URLs.
 */
export function getOtpEmailRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${AUTH_DASHBOARD_PATH}`;
}
