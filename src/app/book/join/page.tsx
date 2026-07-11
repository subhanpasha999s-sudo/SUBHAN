"use client";
/**
 * Join a workspace (staff onboarding) — OTP-verified end to end:
 *   1. the staff member enters THEIR email → we send a one-time code,
 *   2. they enter the 6-digit code → their account is verified + signed in,
 *   3. they redeem the owner's invite code → workspace loads with their role.
 * The server (accept_org_invite) additionally refuses unverified accounts,
 * so this flow can't be skipped by other login paths.
 */
import { useEffect, useState } from "react";
import { KeyRound, MailCheck, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Button, Card, cn } from "@/book/components/ui";
import { isBookAuthed, joinWithInviteCode } from "@/book/lib/bookStateRemote";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";

const OTP_LENGTH = 6;

export default function JoinWorkspacePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  // OTP sign-in state
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<1 | 2>(1);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState<string | null>(null);
  // invite state
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void isBookAuthed().then(setAuthed);
    const pre = new URLSearchParams(window.location.search).get("code");
    if (pre) setCode(pre);
  }, []);

  async function sendOtp() {
    const sb = getSupabaseBrowser();
    const em = email.trim();
    if (!sb || !em) return;
    setOtpBusy(true); setOtpErr(null);
    const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true } });
    setOtpBusy(false);
    if (error) { setOtpErr(error.message); return; }
    setOtpStep(2); setOtp("");
  }

  async function verifyOtp() {
    const sb = getSupabaseBrowser();
    const token = otp.replace(/\D/g, "");
    if (!sb || token.length !== OTP_LENGTH) { setOtpErr(`Enter the ${OTP_LENGTH}-digit code.`); return; }
    setOtpBusy(true); setOtpErr(null);
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    setOtpBusy(false);
    if (error) { setOtpErr(error.message); return; }
    setAuthed(true);
  }

  async function join() {
    setBusy(true); setErr(null);
    const res = await joinWithInviteCode(code);
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? "Could not join."); return; }
    setDone(true);
    window.setTimeout(() => window.location.assign("/book/dashboard"), 1200);
  }

  const input = "h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm outline-none focus:border-primary";

  return (
    <Guard section="join">
      <PageHeader title="Join a workspace" sub="Verify your email with a one-time code, then redeem your invite" />
      <div className="mx-auto max-w-md space-y-4">

        {/* Step 1 — OTP-verified sign-in */}
        <Card className={cn("p-6", authed && "opacity-70")}>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            {authed ? <ShieldCheck className="h-4 w-4 text-success" /> : <MailCheck className="h-4 w-4 text-primary" />}
            {authed ? "Signed in & verified" : "Step 1 — verify your email (OTP)"}
          </div>
          {!authed && otpStep === 1 && (
            <>
              <p className="mb-3 text-xs text-muted-foreground">Use YOUR email — this becomes your staff login. We&apos;ll send a one-time code.</p>
              <div className="flex gap-2">
                <input className={input} type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) sendOtp(); }} />
                <Button onClick={sendOtp} disabled={!email.trim() || otpBusy}>Send code</Button>
              </div>
            </>
          )}
          {!authed && otpStep === 2 && (
            <>
              <p className="mb-3 text-xs text-muted-foreground">Enter the {OTP_LENGTH}-digit code sent to <span className="font-medium text-foreground">{email.trim()}</span>.</p>
              <div className="flex gap-2">
                <input className={cn(input, "text-center font-mono tracking-[0.4em]")} inputMode="numeric" maxLength={OTP_LENGTH}
                  placeholder="••••••" value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") verifyOtp(); }} />
                <Button onClick={verifyOtp} disabled={otpBusy}>Verify</Button>
              </div>
              <button onClick={sendOtp} disabled={otpBusy} className="mt-2 text-xs text-primary hover:underline">Resend code</button>
            </>
          )}
          {otpErr && !authed && <p className="mt-2 text-xs text-danger">{otpErr}</p>}
          {authed && <p className="text-xs text-muted-foreground">Your account is verified — redeem the invite below.</p>}
        </Card>

        {/* Step 2 — redeem the invite */}
        <Card className={cn("p-6", !authed && "opacity-60")}>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-primary" /> Step 2 — redeem the invite code
          </div>
          {done ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="font-medium">You&apos;re in! Loading the shared workspace…</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input className={cn(input, "font-mono")} placeholder="join-xxxxxxxxxxxx" value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && code.trim() && authed) join(); }} />
                <Button onClick={join} disabled={!code.trim() || busy || !authed}>Join</Button>
              </div>
              {err && <p className="mt-2 text-xs text-danger">{err}</p>}
              {!authed && <p className="mt-2 text-xs text-muted-foreground">Unlocks after email verification above.</p>}
            </>
          )}
        </Card>
      </div>
    </Guard>
  );
}
