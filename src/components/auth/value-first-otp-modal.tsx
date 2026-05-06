"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Loader2 } from "lucide-react";
import { toast as notify } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpSixInput } from "@/components/auth/otp-six-input";
import { SocialAuthButtons } from "@/components/auth/premium/social-buttons";
import { getOtpEmailRedirectUrl } from "@/lib/auth/constants";
import type { ValueFirstGateIntent } from "@/lib/auth/value-first-gate-types";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

const COPY: Record<
  ValueFirstGateIntent,
  { title: string; description: string }
> = {
  "save-sku-mapping": {
    title: "Sign in to save to cloud",
    description:
      "We email a secure one-time code—then your SKU map is written to your private workspace so it persists long term and syncs wherever you sign in.",
  },
  "optional-signin": {
    title: "Create your workspace",
    description:
      "One verified email backs up your SKU map in the cloud, keeps exports consistent across browsers, and stays free—pick this whenever you’re ready.",
  },
};

function resetForms(args: {
  setEmail: (s: string) => void;
  setOtp: (s: string) => void;
  setStep: (s: 1 | 2) => void;
}) {
  args.setEmail("");
  args.setOtp("");
  args.setStep(1);
}

export function ValueFirstOtpModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: ValueFirstGateIntent | null;
  /** Fired after session is verified; modal is already closing. Run pending continuation. */
  onVerifiedContinue: () => void | Promise<void>;
}) {
  const { open, onOpenChange, intent, onVerifiedContinue } = props;
  const router = useRouter();
  const sb = React.useMemo(() => getSupabaseBrowser(), []);

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

  const copyIntent: ValueFirstGateIntent = intent ?? "optional-signin";
  const copy = COPY[copyIntent];
  const authRedirectTo = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/export-labels`;
  }, []);

  React.useEffect(() => {
    if (!open) {
      resetForms({ setEmail, setOtp, setStep });
    }
  }, [open]);

  React.useEffect(() => {
    if (step !== 2) return;
    const id = window.setTimeout(() => {
      document.getElementById("value-first-otp-0")?.focus();
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
      notify.error("Enter a valid email.");
      return;
    }
    if (!sb) {
      notify.error("Supabase is not configured.", {
        description: "Add NEXT_PUBLIC_SUPABASE_* keys in Settings.",
      });
      return;
    }
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
        notify.error(error.message);
        return;
      }
      setStep(2);
      setOtp("");
      notify.success(isResend ? "New code sent." : "Check your inbox for a code.");
      setResendCooldown(30);
    } finally {
      setSendBusy(false);
    }
  }

  async function verifyContinue(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = email.trim();
    const code = otp.replace(/\D/g, "");
    if (!sb) return;
    if (code.length !== 6) {
      notify.error("Enter the six-digit code.");
      return;
    }
    setVerifyBusy(true);
    try {
      const { error } = await sb.auth.verifyOtp({
        email: trimmed,
        token: code,
        type: "email",
      });
      if (error) {
        notify.error(error.message);
        return;
      }
      notify.success("You’re signed in.");
      await Promise.resolve(onVerifiedContinue());
      onOpenChange(false);
    } finally {
      setVerifyBusy(false);
    }
  }

  function openFullAuth(target: "/login?signin=1" | "/login?signin=1&mode=signup") {
    onOpenChange(false);
    // Let dialog close first so auth page does not appear behind the modal.
    window.setTimeout(() => {
      router.push(target);
    }, 30);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-t-xl border-border p-0 sm:max-w-[420px] sm:rounded-xl sm:border"
        showCloseButton
      >
        <div className="border-b border-border bg-card px-6 pb-4 pt-6 text-center sm:text-left">
          <DialogHeader className="gap-2 space-y-2">
            <DialogTitle className="text-lg font-semibold tracking-tight sm:text-xl">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
              {copy.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {!sb ? (
          <div className="space-y-4 px-6 py-5">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Secure sign-in is temporarily unavailable in this environment. Open the full auth page
              to continue.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => openFullAuth("/login?signin=1")}
                className={cn(buttonVariants(), "min-h-10 flex-1 font-semibold")}
              >
                Open login
              </button>
              <button
                type="button"
                onClick={() => openFullAuth("/login?signin=1&mode=signup")}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "min-h-10 flex-1 font-semibold"
                )}
              >
                Create account
              </button>
            </div>
          </div>
        ) : step === 1 ? (
          <form
            className="space-y-4 px-6 py-5"
            onSubmit={(ev) => {
              ev.preventDefault();
              void sendOtp(false);
            }}
          >
            <SocialAuthButtons redirectTo={authRedirectTo} />
            <div className="relative py-1">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
              <div className="relative flex justify-center">
                <span className="rounded-full bg-card px-2.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                  or use email code
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value-first-email">Email</Label>
              <Input
                id="value-first-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                disabled={sendBusy}
                className="min-h-11"
              />
            </div>
            <Button
              type="submit"
              className="min-h-11 w-full font-semibold"
              disabled={sendBusy}
            >
              {sendBusy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                "Email code"
              )}
            </Button>
            <div className="flex items-center justify-between gap-3 pt-1 text-[12px] text-muted-foreground">
              <button
                type="button"
                onClick={() => openFullAuth("/login?signin=1")}
                className="font-medium underline-offset-2 hover:underline"
              >
                Login with password
              </button>
              <button
                type="button"
                onClick={() => openFullAuth("/login?signin=1&mode=signup")}
                className="font-medium underline-offset-2 hover:underline"
              >
                Create account
              </button>
            </div>
          </form>
        ) : (
          <form className="space-y-5 px-6 py-5" onSubmit={(ev) => void verifyContinue(ev)}>
            <div className="space-y-2">
              <p className="text-[13px] text-muted-foreground">
                Code sent to{" "}
                <span className="font-medium text-foreground">{email.trim()}</span>
              </p>
              {redirectOrigin ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Use the <span className="font-medium text-foreground">six-digit code</span> here.
                  If the email has a link that won’t open, add{" "}
                  <code className="rounded bg-muted px-1 py-px font-mono text-[10px]">
                    {redirectOrigin}
                  </code>{" "}
                  to Supabase → Authentication → Redirect URLs (and match Site URL when possible).
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label className="text-center text-sm font-medium sm:block">
                Six-digit code
              </Label>
              <OtpSixInput
                idPrefix="value-first-otp"
                value={otp}
                onChange={setOtp}
                disabled={verifyBusy}
              />
            </div>
            <Button
              type="submit"
              className="min-h-11 w-full font-semibold"
              disabled={verifyBusy}
            >
              {verifyBusy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Verifying…
                </>
              ) : (
                "Verify & continue"
              )}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
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
                className="min-h-11"
                disabled={sendBusy || resendCooldown > 0}
                onClick={() => void sendOtp(true)}
              >
                {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend code"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
