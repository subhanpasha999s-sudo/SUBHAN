"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Loader2 } from "lucide-react";
import { toast as notify } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/supabase/auth-context";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { trackEvent } from "@/lib/analytics/posthog-client";
import {
  AUTH_DASHBOARD_PATH,
  EMAIL_OTP_LENGTH,
  getOtpEmailRedirectUrl,
  LAST_AUTH_METHOD_KEY,
  SIGNIN_FLOW_QUERY_PARAM,
  safeInternalNextPath,
} from "@/lib/auth/constants";
import { getOtpSendErrorMessage } from "@/lib/auth/otp-errors";
import { markSignupTourPending } from "@/lib/auth/signup-tour";
import { OtpSixInput } from "@/components/auth/otp-six-input";
import { AuthShell } from "@/components/auth/premium/auth-shell";
import { FadeIn } from "@/components/auth/premium/motion";
import { SocialAuthButtons } from "@/components/auth/premium/social-buttons";
import { TULMIN_CONTACT_EMAIL } from "@/lib/brand/tulmin";
import { cn } from "@/lib/utils";

/**
 * Full-page `/login` is only for OAuth / magic-link return paths and forced
 * `?signin=1`. Workspace entry is modal-based — plain `/login` and `/login?next=`
 * bounce to the public landing page so users see the product first by default.
 */
function shouldStayOnLoginPage(searchParams: URLSearchParams): boolean {
  const signin = searchParams.get(SIGNIN_FLOW_QUERY_PARAM);
  if (signin === "1" || signin === "true") return true;

  if (searchParams.get("code")) return true;
  if (searchParams.get("error")) return true;
  if (searchParams.get("token_hash")) return true;

  const type = searchParams.get("type");
  if (
    type === "recovery" ||
    type === "signup" ||
    type === "email_change" ||
    type === "magiclink"
  ) {
    return true;
  }

  if (typeof window !== "undefined") {
    const h = window.location.hash.slice(1);
    if (/(^|&)access_token=/.test(h) || /(^|&)error=/.test(h)) return true;
  }

  return false;
}

type AuthMethod = "otp" | "password";

function readLastMethod(): AuthMethod {
  if (typeof window === "undefined") return "otp";
  try {
    const v = localStorage.getItem(LAST_AUTH_METHOD_KEY);
    return v === "password" ? "password" : "otp";
  } catch {
    return "otp";
  }
}

function persistLastMethod(m: AuthMethod) {
  try {
    localStorage.setItem(LAST_AUTH_METHOD_KEY, m);
  } catch {
    /* private mode */
  }
}

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = React.useMemo(
    () =>
      safeInternalNextPath(searchParams.get("next"), AUTH_DASHBOARD_PATH),
    [searchParams]
  );

  const { user, authReady } = useAuth();

  const sb = React.useMemo(() => getSupabaseBrowser(), []);

  const [tab, setTab] = React.useState<AuthMethod>("otp");
  const preferredPasswordMode = React.useMemo(
    () => (searchParams.get("mode") === "signup" ? "signup" : "signin"),
    [searchParams]
  );

  React.useEffect(() => {
    setTab(readLastMethod());
  }, []);

  React.useEffect(() => {
    if (preferredPasswordMode === "signup") {
      setTab("password");
    }
  }, [preferredPasswordMode]);

  React.useEffect(() => {
    if (!authReady || !user) return;
    router.replace(nextPath);
  }, [authReady, user, router, nextPath]);

  React.useLayoutEffect(() => {
    if (!authReady || user) return;
    if (shouldStayOnLoginPage(searchParams)) return;
    router.replace(nextPath);
  }, [authReady, user, searchParams, router, nextPath]);

  const handleTabChange = (v: string) => {
    const m = v === "password" ? "password" : "otp";
    setTab(m);
    persistLastMethod(m);
  };

  if (!sb) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col px-4 py-16">
        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Sign-in unavailable</CardTitle>
            <CardDescription>
              Sign-in is temporarily unavailable. Try again shortly, or email{" "}
              <a
                href={`mailto:${TULMIN_CONTACT_EMAIL}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {TULMIN_CONTACT_EMAIL}
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href={AUTH_DASHBOARD_PATH}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Continue to Tulmin
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Taking you to the workspace…</p>
      </div>
    );
  }

  return (
    <AuthShell>
      <FadeIn className="w-full">
      <Card className="overflow-hidden border-border/70 bg-card/70 shadow-elevate-md ring-1 ring-border/35 backdrop-blur-xl dark:border-border dark:bg-card/55">
        <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Zoho-style brand panel */}
          <div className="relative hidden flex-col justify-between border-b border-border/70 bg-gradient-to-br from-white via-slate-50 to-sky-50 px-10 py-10 text-slate-950 lg:flex lg:border-b-0 lg:border-r dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-white">
            <div className="absolute inset-0 opacity-70 [background:radial-gradient(900px_circle_at_18%_14%,rgba(56,189,248,0.18),transparent_48%),radial-gradient(700px_circle_at_78%_32%,rgba(99,102,241,0.12),transparent_48%)] dark:opacity-60 dark:[background:radial-gradient(900px_circle_at_18%_14%,rgba(56,189,248,0.20),transparent_48%),radial-gradient(700px_circle_at_78%_32%,rgba(99,102,241,0.16),transparent_48%)]" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-slate-950 text-base font-bold tracking-tight text-white shadow-sm ring-1 ring-black/10 dark:bg-white dark:text-slate-950 dark:ring-white/15">
                  L
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tracking-tight">Tulmin</p>
                  <p className="mt-0.5 text-[12px] text-slate-600 dark:text-white/70">
                    Dispatch clarity for high-volume teams.
                  </p>
                </div>
              </div>

              <h1 className="mt-10 text-balance text-3xl font-semibold tracking-tight">
                Sign in once. Keep every export consistent.
              </h1>
              <p className="mt-4 max-w-[48ch] text-[13px] leading-relaxed text-slate-600 dark:text-white/70">
                Save time on every run with a synced SKU map and a clean label workflow your team can
                rely on—across devices.
              </p>

              <ul className="mt-8 space-y-3 text-[13px] text-slate-700 dark:text-white/80">
                <li className="flex gap-3">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-sky-500/80 dark:bg-sky-300/90" aria-hidden />
                  <span>Reduce repetitive sorting with mapped SKU filters.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-indigo-500/70 dark:bg-indigo-300/90" aria-hidden />
                  <span>Keep packing smooth with grouped exports built for dispatch teams.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500/70 dark:bg-emerald-300/90" aria-hidden />
                  <span>Secure cloud access keeps your workspace available from any browser.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Form panel */}
          <div className="flex flex-col px-5 py-8 sm:px-10 sm:py-10">
            <CardHeader className="space-y-2 border-b border-border/70 px-0 pb-6 pt-0 text-left">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-xl font-semibold tracking-tight">Sign in</CardTitle>
                  <CardDescription className="mt-1 text-[13px] leading-relaxed">
                    Access your workspace securely. Choose email code or password.
                  </CardDescription>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/10 lg:hidden">
                  L
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 px-0 pb-0 pt-6">
              <SocialAuthButtons
                redirectTo={`${typeof window !== "undefined" ? window.location.origin : ""}${nextPath}`}
                signupIntent={preferredPasswordMode === "signup"}
              />
              <div className="relative py-1">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
                <div className="relative flex justify-center">
                  <span className="rounded-full bg-card/80 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground ring-1 ring-border/30 backdrop-blur">
                    or continue with
                  </span>
                </div>
              </div>
              <Tabs value={tab} onValueChange={handleTabChange} className="gap-5">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-0 rounded-lg bg-muted/40 p-1">
                  <TabsTrigger value="otp" className="min-h-11 text-[13px]">
                    Email code
                  </TabsTrigger>
                  <TabsTrigger value="password" className="min-h-11 text-[13px]">
                    Password
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="otp" className="mt-0 flex flex-col gap-0">
                  <OtpLoginPanel redirectTo={nextPath} />
                </TabsContent>

                <TabsContent value="password" className="mt-0 flex flex-col gap-0">
                  <PasswordLoginPanel
                    redirectTo={nextPath}
                    initialMode={preferredPasswordMode}
                  />
                </TabsContent>
              </Tabs>

              <div className="pt-2">
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Secure login protected with enterprise-grade encryption.
                </p>
              </div>
            </CardContent>
          </div>
        </div>
      </Card>
      </FadeIn>
    </AuthShell>
  );
}

function OtpLoginPanel({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const sb = getSupabaseBrowser()!;
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [step, setStep] = React.useState<1 | 2>(1);
  const [sendBusy, setSendBusy] = React.useState(false);
  const [verifyBusy, setVerifyBusy] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [redirectOrigin, setRedirectOrigin] = React.useState("");
  React.useEffect(() => {
    setRedirectOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  React.useEffect(() => {
    if (step !== 2) return;
    const id = window.setTimeout(() => {
      document.getElementById("otp-0")?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [step]);

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [resendCooldown]);

  async function sendOtp(isResend = false) {
    const trimmed = email.trim();
    if (!trimmed) {
      notify.error("Enter your email.");
      return;
    }
    trackEvent("auth_login_attempt", {
      method: "otp",
      action: isResend ? "resend_code" : "send_code",
    });
    setSendBusy(true);
    try {
      const emailRedirectTo = getOtpEmailRedirectUrl();
      const { error } = await sb.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: true,
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      });
      if (error) {
        const message = getOtpSendErrorMessage(error.message);
        trackEvent("auth_login_failed", {
          method: "otp",
          action: isResend ? "resend_code" : "send_code",
          reason: message,
        });
        notify.error(message);
        return;
      }
      trackEvent("auth_otp_code_sent", { resend: isResend });
      setStep(2);
      setOtp("");
      notify.success(isResend ? "New code sent." : "Check your inbox for a code.");
      setResendCooldown(30);
    } finally {
      setSendBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    const code = otp.replace(/\D/g, "");
    if (code.length !== EMAIL_OTP_LENGTH) {
      notify.error(`Enter the ${EMAIL_OTP_LENGTH}-digit code.`);
      return;
    }
    trackEvent("auth_login_attempt", { method: "otp", action: "verify_code" });
    setVerifyBusy(true);
    try {
      const { error } = await sb.auth.verifyOtp({
        email: trimmed,
        token: code,
        type: "email",
      });
      if (error) {
        trackEvent("auth_login_failed", {
          method: "otp",
          action: "verify_code",
          reason: error.message,
        });
        notify.error(error.message);
        return;
      }
      notify.success("You’re signed in.");
      router.replace(redirectTo);
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {step === 1 ? "Passwordless sign-in" : "Enter secure access code"}
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {step === 1
            ? `Get a ${EMAIL_OTP_LENGTH}-digit code by email and access your workspace in seconds.`
            : `Code sent to ${email.trim()}`}
        </p>
        {step === 2 && redirectOrigin ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Enter the {EMAIL_OTP_LENGTH}-digit code from your email to finish signing in.
          </p>
        ) : null}
      </div>

      {step === 1 ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void sendOtp(false);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="otp-email">Work email</Label>
            <Input
              id="otp-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sendBusy}
              className="min-h-11"
            />
          </div>
          <Button type="submit" className="min-h-11 w-full font-semibold" disabled={sendBusy}>
            {sendBusy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              "Send secure code"
            )}
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={verifyOtp}>
          <OtpSixInput
            value={otp}
            onChange={setOtp}
            disabled={verifyBusy}
            length={EMAIL_OTP_LENGTH}
          />
          <Button type="submit" className="min-h-11 w-full font-semibold" disabled={verifyBusy}>
            {verifyBusy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Verifying…
              </>
            ) : (
              "Verify and open workspace"
            )}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              className="interaction-press min-h-11 rounded-md text-center text-sm text-muted-foreground underline-offset-4 hover:bg-muted/50 hover:text-foreground hover:underline"
              onClick={() => {
                setStep(1);
                setOtp("");
              }}
            >
              Use another email
            </button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0"
              disabled={sendBusy || resendCooldown > 0}
              onClick={() => void sendOtp(true)}
            >
              {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend code"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function PasswordLoginPanel({
  redirectTo,
  initialMode,
}: {
  redirectTo: string;
  initialMode: "signin" | "signup";
}) {
  const router = useRouter();
  const sb = getSupabaseBrowser()!;
  const [mode, setMode] = React.useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim();
    if (!em || password.length < 6) {
      notify.error("Enter email and password (six characters minimum).");
      return;
    }
    trackEvent("auth_login_attempt", { method: "password", mode });
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({
          email: em,
          password,
        });
        if (error) {
          trackEvent("auth_login_failed", {
            method: "password",
            mode,
            reason: error.message,
          });
          notify.error(error.message);
          return;
        }
        notify.success("You’re signed in.");
        router.replace(redirectTo);
      } else {
        const { data, error } = await sb.auth.signUp({
          email: em,
          password,
        });
        if (error) {
          trackEvent("auth_login_failed", {
            method: "password",
            mode,
            reason: error.message,
          });
          notify.error(error.message);
          return;
        }
        markSignupTourPending(em);
        if (data.session) {
          trackEvent("auth_signup_success", { method: "password" });
          notify.success("Account ready.");
          router.replace(redirectTo);
          return;
        }
        trackEvent("auth_signup_pending_verification", { method: "password" });
        notify.success("Confirm via email, then sign in.");
        setPassword("");
        setMode("signin");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {mode === "signin" ? "Sign in with password" : "Create secure account"}
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {mode === "signin"
            ? "Use your workspace email to continue with your saved setup."
            : "Create your account once to protect and sync your operations workspace."}
        </p>
      </div>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="pwd-email">Email</Label>
          <Input
            id="pwd-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pwd-password">Password</Label>
          <Input
            id="pwd-password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            minLength={6}
            className="min-h-11"
          />
        </div>
        <Button type="submit" className="min-h-11 w-full font-semibold" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Working…
            </>
          ) : mode === "signin" ? (
            "Sign in"
          ) : (
            "Create workspace account"
          )}
        </Button>
        <button
          type="button"
          className={cn(
            "interaction-press min-h-11 w-full rounded-md text-center text-sm text-muted-foreground underline-offset-4 hover:bg-muted/50 hover:text-foreground hover:underline"
          )}
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
          }}
        >
          {mode === "signin"
            ? "Need an account? Create one"
            : "Have an account? Sign in instead"}
        </button>
      </form>
    </div>
  );
}
