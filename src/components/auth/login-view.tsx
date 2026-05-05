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
  getOtpEmailRedirectUrl,
  LAST_AUTH_METHOD_KEY,
  SIGNIN_FLOW_QUERY_PARAM,
  safeInternalNextPath,
} from "@/lib/auth/constants";
import { OtpSixInput } from "@/components/auth/otp-six-input";
import { cn } from "@/lib/utils";

/**
 * Full-page `/login` is only for OAuth / magic-link return paths and forced
 * `?signin=1`. Workspace entry is modal-based — plain `/login` and `/login?next=`
 * bounce into the app so users never hit this gate by default.
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

  React.useEffect(() => {
    setTab(readLastMethod());
  }, []);

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
              Add{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                .env.local
              </code>
              , then restart the dev server.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link
              href={AUTH_DASHBOARD_PATH}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Continue to workspace
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
    <div className="mx-auto flex w-full max-w-[420px] flex-col px-4 py-14 sm:py-20">
      <Card className="overflow-hidden border-border shadow-lg shadow-black/[0.04] dark:shadow-black/25">
        <CardHeader className="space-y-1 border-b border-border bg-card px-6 pb-5 pt-8 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/10 text-base font-bold text-primary">
            L
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">
            Sign in to Label
          </CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            Label PDFs and SKU Mapping—runs locally until you sync.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 px-6 pb-8 pt-6">
          <Tabs
            value={tab}
            onValueChange={handleTabChange}
            className="gap-5"
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-0 rounded-lg p-1">
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
              <PasswordLoginPanel redirectTo={nextPath} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="mt-7 text-center text-[13px] leading-relaxed text-muted-foreground">
        <Link
          href={nextPath}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Skip sign-in for now
        </Link>
        <span aria-hidden className="mx-2 opacity-40">
          ·
        </span>
        <span>Opens the workspace locally until you export or sync.</span>
      </p>
    </div>
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
        trackEvent("auth_login_failed", {
          method: "otp",
          action: isResend ? "resend_code" : "send_code",
          reason: error.message,
        });
        notify.error(error.message);
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
    if (code.length !== 6) {
      notify.error("Enter the six-digit code.");
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
          {step === 1 ? "Email code sign-in" : "Enter your code"}
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {step === 1
            ? "We email you a six-digit code—no password."
            : `Code sent to ${email.trim()}`}
        </p>
        {step === 2 && redirectOrigin ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Enter the six-digit code here. If only a link works in mail, Supabase must list{" "}
            <code className="rounded bg-muted px-1 py-px font-mono text-[10px]">
              {redirectOrigin}
            </code>{" "}
            under Authentication → Redirect URLs.
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
              "Email code"
            )}
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={verifyOtp}>
          <OtpSixInput
            value={otp}
            onChange={setOtp}
            disabled={verifyBusy}
          />
          <Button type="submit" className="min-h-11 w-full font-semibold" disabled={verifyBusy}>
            {verifyBusy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Verifying…
              </>
            ) : (
              "Verify & continue"
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
              Use a different email
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

function PasswordLoginPanel({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const sb = getSupabaseBrowser()!;
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

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
          {mode === "signin" ? "Password sign-in" : "Create an account"}
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {mode === "signin"
            ? "Use the email tied to your workspace."
            : "Pick email and password—we may ask you to confirm via email."}
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
            "Create account"
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
