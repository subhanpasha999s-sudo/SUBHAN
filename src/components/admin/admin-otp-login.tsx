"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast as notify } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";

const otpLength = 6;

export function AdminOtpLogin() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [step, setStep] = React.useState<"email" | "otp">("email");
  const [busy, setBusy] = React.useState(false);

  async function sendOtp(event: React.FormEvent) {
    event.preventDefault();
    const adminEmail = email.trim().toLowerCase();
    if (!adminEmail) {
      notify.error("Enter your admin email.");
      return;
    }
    if (!supabase) {
      notify.error("Supabase auth is not configured.");
      return;
    }

    setBusy(true);
    try {
      const eligible = await fetch("/api/admin/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail }),
      });
      const eligibility = (await eligible.json().catch(() => ({}))) as { allowed?: boolean; error?: string };
      if (!eligible.ok || !eligibility.allowed) {
        notify.error(eligibility.error || "This email is not allowed to access Tulmin Admin.");
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: adminEmail,
        options: { shouldCreateUser: true },
      });
      if (error) {
        notify.error(error.message);
        return;
      }
      setStep("otp");
      setOtp("");
      notify.success("Admin code sent.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    const code = otp.replace(/\D/g, "");
    if (code.length !== otpLength || !supabase) {
      notify.error(`Enter the ${otpLength}-digit admin code.`);
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: "email",
      });
      if (error) {
        notify.error(error.message);
        return;
      }

      const token = data.session?.access_token;
      if (!token) {
        notify.error("Admin session was not created. Send a fresh code and try again.");
        return;
      }

      const session = await fetch("/api/admin/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await session.json().catch(() => ({}))) as { error?: string };
      if (!session.ok) {
        notify.error(result.error || "Could not start admin session.");
        return;
      }

      router.replace("/admin/analytics");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8fd] px-4 py-8 text-slate-950 dark:bg-[#070b12] dark:text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="max-w-2xl">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[#335cff]/10 ring-1 ring-[#335cff]/20 dark:bg-white/10 dark:ring-white/15">
            <ShieldCheck className="size-6 text-[#335cff] dark:text-sky-200" />
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-[#335cff] dark:text-sky-200/80">
            Tulmin Admin Console
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Private control center for Tulmin operations.
          </h1>
          <p className="mt-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
            This area is separate from the seller AI workspace. Only allowlisted
            Tulmin admins can view analytics, manage MRR and billing, and publish content.
          </p>
        </section>

        <form
          onSubmit={step === "email" ? sendOtp : verifyOtp}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-42px_rgba(37,99,235,0.45)] dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_24px_80px_-42px_rgba(37,99,235,0.85)]"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[#335cff]/10 text-[#335cff] ring-1 ring-[#335cff]/20 dark:bg-sky-400/12 dark:text-sky-200 dark:ring-sky-300/20">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Admin sign in</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Email OTP, server allowlist required</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@tulmin.com"
              disabled={busy || step === "otp"}
              className="h-12 rounded-xl border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-500"
            />
            {step === "otp" ? (
              <Input
                inputMode="numeric"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, otpLength))}
                placeholder="6-digit code"
                disabled={busy}
                className="h-12 rounded-xl border-slate-200 bg-slate-50 text-center font-mono text-lg tracking-[0.35em] text-slate-950 placeholder:tracking-normal placeholder:text-slate-400 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-500"
              />
            ) : null}
          </div>

          <Button type="submit" className="mt-6 h-12 w-full rounded-xl" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {step === "email" ? "Send Admin Code" : "Open Blog CMS"}
          </Button>

          {step === "otp" ? (
            <button
              type="button"
              className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
              onClick={() => {
                setStep("email");
                setOtp("");
              }}
            >
              Use another email
            </button>
          ) : null}
        </form>
      </div>
    </main>
  );
}
