/** Default entry route after generic auth or anonymous visits. */
export const AUTH_DASHBOARD_PATH = "/";

/**
 * Visiting `/login?signin=1` shows the legacy full-page sign-in form.
 * All other `/login` visits redirect into the app; use the header icon OTP modal instead.
 */
export const SIGNIN_FLOW_QUERY_PARAM = "signin";

/** localStorage key: `"otp"` | `"password"` */
export const LAST_AUTH_METHOD_KEY = "lable.auth.last-method";

/** sessionStorage key: last non-auth page to return users to after sign-in. */
export const AUTH_RETURN_PATH_KEY = "tulmin.auth.return-path";

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
  if (!isReturnableAuthPath(raw)) return fallback;
  return raw || fallback;
}

export function isReturnableAuthPath(path: string) {
  const pathname = path.split(/[?#]/)[0] || "/";
  return !(
    pathname.startsWith("/login") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api")
  );
}

export function currentBrowserPath() {
  if (typeof window === "undefined") return "";
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return safeInternalNextPath(path, "");
}

export function rememberAuthReturnPath(path = currentBrowserPath()) {
  if (typeof window === "undefined") return;
  const safePath = safeInternalNextPath(path, "");
  if (!safePath) return;
  try {
    sessionStorage.setItem(AUTH_RETURN_PATH_KEY, safePath);
  } catch {
    /* private mode */
  }
}

export function getRememberedAuthReturnPath(fallback = AUTH_DASHBOARD_PATH) {
  if (typeof window === "undefined") return fallback;
  try {
    return safeInternalNextPath(sessionStorage.getItem(AUTH_RETURN_PATH_KEY), fallback);
  } catch {
    return fallback;
  }
}

export function getAuthReturnPath(fallback = AUTH_DASHBOARD_PATH) {
  if (typeof window === "undefined") return fallback;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (safeInternalNextPath(current, "")) return current;
  return getRememberedAuthReturnPath(fallback);
}

export function authLoginHref(mode?: "signin" | "signup", returnTo = getAuthReturnPath()) {
  const params = new URLSearchParams({ [SIGNIN_FLOW_QUERY_PARAM]: "1" });
  if (mode === "signup") params.set("mode", "signup");
  params.set("next", safeInternalNextPath(returnTo, AUTH_DASHBOARD_PATH));
  return `/login?${params.toString()}`;
}

/**
 * Passed to `signInWithOtp({ options: { emailRedirectTo } })` so email-code messages
 * bounce back to wherever the app is actually hosted (not only Supabase “Site URL”).
 * Redirect host must still be listed under Supabase → Authentication → Redirect URLs.
 */
export function getOtpEmailRedirectUrl(returnTo = getAuthReturnPath()): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${authLoginHref("signin", returnTo)}`;
}
