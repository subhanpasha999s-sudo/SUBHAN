"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast as notify } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpSixInput } from "@/components/auth/otp-six-input";
import { EMAIL_OTP_LENGTH } from "@/lib/auth/constants";
import { getOtpSendErrorMessage } from "@/lib/auth/otp-errors";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";

async function waitForAdminSession() {
  const supabase = getSupabaseBrowser();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const session = (await supabase?.auth.getSession())?.data.session;
    if (session?.access_token) return session.access_token;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  return null;
}

export function AdminLoginClient() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [sendBusy, setSendBusy] = React.useState(false);
  const [verifyBusy, setVerifyBusy] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);

  React.useEffect(() => {
    if (step !== "code") return;
    const timer = window.setTimeout(() => {
      document.getElementById("admin-otp-0")?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [step]);

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function sendOtp(event?: React.FormEvent, isResend = false) {
    event?.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      notify.error("Enter your admin email.");
      return;
    }
    if (!supabase) {
      notify.error("Admin auth is not configured.");
      return;
    }
    setSendBusy(true);
    try {
      const emailRedirectTo =
        typeof window === "undefined" ? undefined : `${window.location.origin}/admin/blogs`;
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: false,
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      });
      if (error) {
        notify.error(getOtpSendErrorMessage(error.message));
        return;
      }
      setStep("code");
      setOtp("");
      setResendCooldown(30);
      notify.success(isResend ? "New admin code sent." : "Check your email for the admin code.");
    } finally {
      setSendBusy(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    const code = otp.replace(/\D/g, "");
    if (code.length !== EMAIL_OTP_LENGTH) {
      notify.error(`Enter the ${EMAIL_OTP_LENGTH}-digit code.`);
      return;
    }
    if (!supabase) {
      notify.error("Admin auth is not configured.");
      return;
    }
    setVerifyBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: trimmed,
        token: code,
        type: "email",
      });
      if (error) {
        notify.error(error.message);
        return;
      }
      const token = data.session?.access_token ?? (await waitForAdminSession());
      if (!token) {
        notify.error("OTP verified, but the browser session was not created. Please resend the code and try again.");
        return;
      }
      const response = await fetch("/api/admin/blogs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const adminCheck = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        notify.error(adminCheck.error || "This email is not allowed to access Tulmin Admin.");
        return;
      }
      notify.success("Admin session started.");
      router.replace("/admin/blogs");
      router.refresh();
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050914] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(96,165,250,0.18),transparent_34%),radial-gradient(circle_at_82%_10%,rgba(45,212,191,0.12),transparent_30%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_420px]">
        <section>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <ShieldCheck className="size-6 text-blue-200" />
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-blue-200/80">
            Tulmin Internal CMS
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Secure publishing workspace for Tulmin content teams.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">
            Customer SaaS users never see this surface. Admins manage drafts, SEO,
            publishing, and analytics from a separate internal system.
          </p>
        </section>

        <form
          onSubmit={step === "email" ? (event) => void sendOtp(event, false) : verifyOtp}
          className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-[0_24px_80px_-40px_rgba(37,99,235,0.8)] backdrop-blur-xl"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/20">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Admin sign in</h2>
              <p className="text-xs text-slate-400">Allowed roles: super_admin, editor</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@tulmin.com"
              disabled={step === "code" || sendBusy || verifyBusy}
              className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
            />
            {step === "code" ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="mb-3 text-center text-xs leading-5 text-slate-400">
                  Enter the {EMAIL_OTP_LENGTH}-digit code sent to {email.trim()}.
                </p>
                <OtpSixInput
                  idPrefix="admin-otp"
                  value={otp}
                  onChange={setOtp}
                  disabled={verifyBusy}
                  length={EMAIL_OTP_LENGTH}
                />
              </div>
            ) : null}
          </div>

          <Button type="submit" className="mt-6 h-12 w-full rounded-2xl" disabled={sendBusy || verifyBusy}>
            {sendBusy || verifyBusy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {step === "email" ? "Send Admin Code" : "Verify and Enter Admin CMS"}
          </Button>

          {step === "code" ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                }}
              >
                Use another email
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-1 font-semibold text-blue-200 transition hover:bg-white/10 disabled:text-slate-600"
                disabled={sendBusy || resendCooldown > 0}
                onClick={() => void sendOtp(undefined, true)}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>
          ) : null}

          <p className="mt-5 text-xs leading-6 text-slate-500">
            Access is verified again on every admin API request. If your email is
            not allowlisted in server env, login will not grant CMS permissions.
          </p>
        </form>
      </div>
    </main>
  );
}
