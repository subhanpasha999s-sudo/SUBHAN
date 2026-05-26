"use client";

import * as React from "react";

import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  Cloud,
  CreditCard,
  FileDown,
  IndianRupee,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  WorkspaceFormPageStack,
  WorkspaceSurfaceCard,
} from "@/components/layout/workspace-layout";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/supabase/auth-context";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import type { SubscriptionEntitlement } from "@/lib/billing/use-subscription";
import {
  TULMIN_PLAN_BY_ID,
  nextPlanRecommendation,
  planCycleCaption,
  planLabelLimitText,
  type TulminPlanId,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";
import { toast as notify } from "sonner";

type BillingHistory = {
  entitlement: SubscriptionEntitlement;
  subscription: {
    plan?: string | null;
    status?: string | null;
    current_period_end?: string | null;
  } | null;
  payments: {
    id: number;
    plan: string | null;
    amount: number;
    currency: string;
    status: string;
    billing_cycle: string | null;
    invoice_url: string | null;
    failure_reason: string | null;
    created_at: string | null;
  }[];
};

function initials(name: string, email?: string | null) {
  const source = name.trim() || email?.trim() || "Tulmin";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatDate(value: string | undefined) {
  if (!value) return "Recently";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function normalizePlanId(plan?: string | null): TulminPlanId {
  return plan === "starter" || plan === "pro" || plan === "business" ? plan : "free";
}

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function AccountMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="rounded-2xl border border-border/55 bg-background/55 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
            tone === "success" &&
              "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-200",
            tone === "warning" &&
              "bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-200",
            tone === "default" &&
              "bg-primary/10 text-primary ring-primary/20",
          )}
        >
          <Icon className="size-4" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AccountPageClient() {
  const [, rerun] = React.useReducer((x) => x + 1, 0);
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  const [signOutBusy, setSignOutBusy] = React.useState(false);
  const [profileBusy, setProfileBusy] = React.useState(false);
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [passwordBusy, setPasswordBusy] = React.useState(false);
  const [profile, setProfile] = React.useState({
    fullName: "",
    company: "",
  });
  const [newEmail, setNewEmail] = React.useState("");
  const [passwordForm, setPasswordForm] = React.useState({
    next: "",
    confirm: "",
  });
  const [billing, setBilling] = React.useState<BillingHistory | null>(null);
  const [billingBusy, setBillingBusy] = React.useState(false);
  const activePlanId = normalizePlanId(billing?.entitlement.plan);
  const activePlan = TULMIN_PLAN_BY_ID[activePlanId];
  const nextPlan = nextPlanRecommendation(activePlanId);
  const subscriptionStatus = billing?.subscription?.status ?? billing?.entitlement.status ?? "free";
  const paidPayments = billing?.payments.filter((payment) => payment.status === "paid") ?? [];
  const latestPaidPayment = paidPayments[0];

  React.useEffect(() => {
    const md = user?.user_metadata ?? {};
    setProfile({
      fullName: typeof md.full_name === "string" ? md.full_name : "",
      company: typeof md.company === "string" ? md.company : "",
    });
  }, [user]);

  React.useEffect(() => {
    let alive = true;
    async function loadBilling() {
      if (!user?.id) {
        setBilling(null);
        return;
      }
      const sb = getSupabaseBrowser();
      if (!sb) return;
      setBillingBusy(true);
      try {
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/billing/history", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as BillingHistory | null;
        if (alive && res.ok && json) setBilling(json);
      } finally {
        if (alive) setBillingBusy(false);
      }
    }
    void loadBilling();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  async function signOut() {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setSignOutBusy(true);
    try {
      const { error } = await sb.auth.signOut();
      if (error) notify.error(error.message);
      else notify.success("Signed out.");
    } finally {
      setSignOutBusy(false);
    }
  }

  async function saveProfile() {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    setProfileBusy(true);
    try {
      const { error } = await sb.auth.updateUser({
        data: {
          full_name: profile.fullName.trim(),
          company: profile.company.trim(),
        },
      });
      if (error) {
        notify.error(error.message);
        return;
      }
      notify.success("Profile updated");
      rerun();
    } finally {
      setProfileBusy(false);
    }
  }

  async function changeEmail() {
    const sb = getSupabaseBrowser();
    const next = newEmail.trim();
    if (!sb || !user || !next) return;
    setEmailBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ email: next });
      if (error) {
        notify.error(error.message);
        return;
      }
      notify.success("Confirmation email sent", {
        description: "Open your inbox and approve the email change.",
      });
      setNewEmail("");
    } finally {
      setEmailBusy(false);
    }
  }

  async function changePassword() {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    const next = passwordForm.next.trim();
    const confirm = passwordForm.confirm.trim();
    if (next.length < 8) {
      notify.error("Password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      notify.error("Passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) {
        notify.error(error.message);
        return;
      }
      notify.success("Password updated");
      setPasswordForm({ next: "", confirm: "" });
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Labels", href: "/export-labels" },
          { label: "Account" },
        ]}
        title="Account"
        description="Manage your Tulmin identity, workspace access, and sign-in security."
        badges={<Badge variant="outline" className="border-border/65 bg-muted/35 px-2.5 py-0.5 text-xs font-normal text-muted-foreground">Account workspace</Badge>}
      />

      <WorkspaceFormPageStack>
        {!authReady ? (
          <WorkspaceSurfaceCard padding="p-6 sm:p-8">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading account…
            </p>
          </WorkspaceSurfaceCard>
        ) : !user ? (
          <WorkspaceSurfaceCard
            padding="p-6 sm:p-8"
            className="overflow-hidden border-border/30 bg-card/90 shadow-elevate-sm ring-1 ring-black/[0.03]"
          >
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
                  <UserRound className="size-7" strokeWidth={1.7} aria-hidden />
                </div>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                  Create your Tulmin workspace
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Sign in to sync SKU maps, protect dispatch workflows, and keep your account available from any browser.
                </p>
              </div>
              <div className="rounded-2xl border border-border/55 bg-background/55 p-4">
                <div className="space-y-3 text-sm">
                  <AccountMetric icon={Cloud} label="Workspace" value="Cloud sync ready" />
                  <AccountMetric icon={ShieldCheck} label="Access" value="Email protected" />
                </div>
                <Button
                  type="button"
                  onClick={openOptionalSignIn}
                  className="mt-4 h-11 w-full font-semibold"
                >
                  Sign in or create account
                </Button>
              </div>
            </div>
          </WorkspaceSurfaceCard>
        ) : (
          <>
            <WorkspaceSurfaceCard
              padding="p-0"
              className="overflow-hidden border-border/30 bg-card/90 shadow-elevate-sm ring-1 ring-black/[0.03]"
            >
              <div className="relative overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
                <div className="pointer-events-none absolute right-[-8rem] top-[-9rem] h-72 w-72 rounded-full bg-primary/14 blur-3xl" />
                <div className="pointer-events-none absolute bottom-[-10rem] left-[-7rem] h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-primary via-sky-500 to-indigo-500 text-lg font-bold text-primary-foreground shadow-[0_20px_55px_-26px_rgb(59_130_246/0.95)] ring-1 ring-white/20 sm:size-20 sm:text-xl">
                      {initials(profile.fullName, user.email)}
                    </div>
                    <div className="min-w-0 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                          {profile.fullName.trim() || "Tulmin operator"}
                        </h2>
                        <Badge className="bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-200">
                          Verified
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-muted-foreground">
                        {user.email ?? user.id}
                      </p>
                      {profile.company.trim() ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted/45 px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/45">
                          <Building2 className="size-3.5" strokeWidth={1.7} aria-hidden />
                          {profile.company.trim()}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={signOutBusy}
                    onClick={() => void signOut()}
                  >
                    {signOutBusy ? (
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    ) : (
                      <LogOut className="mr-2 size-4" aria-hidden />
                    )}
                    Sign out
                  </Button>
                </div>
                <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
                  <AccountMetric icon={Cloud} label="Workspace" value="Cloud synced" tone="success" />
                  <AccountMetric icon={ShieldCheck} label="Security" value="Protected account" tone="success" />
                  <AccountMetric icon={BadgeCheck} label="Member since" value={formatDate(user.created_at)} />
                </div>
              </div>
            </WorkspaceSurfaceCard>

            <WorkspaceSurfaceCard
              padding="p-5 sm:p-6"
              className="border-border/30 bg-card/90 shadow-elevate-sm ring-1 ring-black/[0.03]"
            >
              <div className="flex flex-col gap-4 border-b border-border/55 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">
                    Billing
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Plan, usage, renewal, payments, and invoices in one place.
                  </p>
                </div>
                <Link href="/pricing" className={cn(buttonVariants(), "w-full sm:w-auto")}>
                  Change plan
                </Link>
              </div>

              {billingBusy && !billing ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-2xl border border-border/55 bg-muted/35" />
                  ))}
                </div>
              ) : billing ? (
                <>
                  <div className="mt-5 overflow-hidden rounded-3xl border border-border/55 bg-background/45">
                    <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={cn(
                              "px-2.5 py-1 text-xs font-bold",
                              activePlanId === "free"
                                ? "bg-amber-500/12 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-200"
                                : "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-200",
                            )}
                          >
                            {activePlan.name} Plan
                          </Badge>
                          <Badge variant="outline" className="border-border/65 bg-muted/35 px-2.5 py-1 text-xs">
                            {titleCase(subscriptionStatus)}
                          </Badge>
                        </div>
                        <h4 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                          {activePlan.name} subscription
                        </h4>
                        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                          {activePlan.tagline}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                          <span className="rounded-full bg-muted/45 px-3 py-1 ring-1 ring-border/45">
                            {planLabelLimitText(activePlan)}
                          </span>
                          <span className="rounded-full bg-muted/45 px-3 py-1 ring-1 ring-border/45">
                            {activePlan.dailyFit}
                          </span>
                          <span className="rounded-full bg-muted/45 px-3 py-1 ring-1 ring-border/45">
                            {planCycleCaption(activePlan, latestPaidPayment?.billing_cycle === "yearly" ? "yearly" : "monthly")}
                          </span>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:min-w-56">
                        <Link href="/pricing" className={cn(buttonVariants(), "w-full")}>
                          <Sparkles className="size-4" aria-hidden />
                          {activePlanId === "business" ? "Manage plan" : `Upgrade to ${nextPlan.name}`}
                        </Link>
                        <p className="text-center text-xs text-muted-foreground">
                          Compare all plans anytime.
                        </p>
                      </div>
                    </div>
                    <div className="grid border-t border-border/55 sm:grid-cols-4">
                      <AccountMetric
                        icon={PackageCheck}
                        label="Plan"
                        value={activePlan.name}
                        tone={activePlanId === "free" ? "warning" : "success"}
                      />
                      <AccountMetric
                        icon={Cloud}
                        label="Usage left"
                        value={
                          billing.entitlement.labelsRemaining == null
                            ? "Unlimited"
                            : billing.entitlement.labelsRemaining.toLocaleString("en-IN")
                        }
                        tone="success"
                      />
                      <AccountMetric
                        icon={BadgeCheck}
                        label="Renewal"
                        value={billing.subscription?.current_period_end ? formatDate(billing.subscription.current_period_end) : "Not scheduled"}
                      />
                      <AccountMetric
                        icon={IndianRupee}
                        label="Last payment"
                        value={latestPaidPayment ? money(latestPaidPayment.amount) : "No payment"}
                      />
                    </div>
                  </div>
                  <div className="mt-5 overflow-hidden rounded-2xl border border-border/55">
                    {billing.payments.length > 0 ? (
                      billing.payments.slice(0, 5).map((payment) => (
                        <div
                          key={payment.id}
                          className="grid gap-3 border-b border-border/55 bg-background/45 p-4 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {payment.plan ?? "Usage"} · {payment.status}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {payment.created_at ? formatDate(payment.created_at) : "No date"}
                              {payment.failure_reason ? ` · ${payment.failure_reason}` : ""}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-foreground">{money(payment.amount)}</p>
                          {payment.invoice_url ? (
                            <a
                              href={payment.invoice_url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl")}
                            >
                                <FileDown className="size-3.5" aria-hidden />
                                Invoice
                            </a>
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground">No invoice</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="bg-background/45 p-4 text-sm text-muted-foreground">
                        No payment history yet.
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </WorkspaceSurfaceCard>

            <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <WorkspaceSurfaceCard
                padding="p-5 sm:p-6"
                className="border-border/30 bg-card/90 shadow-elevate-sm ring-1 ring-black/[0.03]"
              >
                <div className="mb-5 flex items-start justify-between gap-4 border-b border-border/55 pb-4">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      Profile details
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Personalize how this workspace identifies you.
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <UserRound className="size-5" strokeWidth={1.7} aria-hidden />
                  </span>
                </div>

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="account-profile-full-name">Full name</Label>
                    <Input
                      id="account-profile-full-name"
                      value={profile.fullName}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, fullName: e.target.value }))
                      }
                      placeholder="Your full name"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-profile-company">Company</Label>
                    <Input
                      id="account-profile-company"
                      value={profile.company}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, company: e.target.value }))
                      }
                      placeholder="Your company name"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-profile-email">Email</Label>
                    <Input
                      id="account-profile-email"
                      value={user.email ?? ""}
                      readOnly
                      disabled
                      className="min-h-11"
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <Button
                    type="button"
                    className="min-w-32 w-full font-semibold sm:w-auto"
                    disabled={profileBusy}
                    onClick={() => void saveProfile()}
                  >
                    {profileBusy ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                        Saving…
                      </>
                    ) : (
                      "Save profile"
                    )}
                  </Button>
                </div>
              </WorkspaceSurfaceCard>

              <WorkspaceSurfaceCard
                padding="p-5 sm:p-6"
                className="border-border/30 bg-card/90 shadow-elevate-sm ring-1 ring-black/[0.03]"
              >
                <div className="mb-5 flex items-start justify-between gap-4 border-b border-border/55 pb-4">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      Sign-in &amp; security
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Keep account access current and protected.
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-200">
                    <LockKeyhole className="size-5" strokeWidth={1.7} aria-hidden />
                  </span>
                </div>

                <section className="space-y-3 rounded-2xl border border-border/55 bg-background/45 p-4">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-primary" strokeWidth={1.8} aria-hidden />
                    <p className="text-sm font-semibold text-foreground">Change email</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="account-change-email">New email</Label>
                    <Input
                      id="account-change-email"
                      type="email"
                      autoComplete="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="min-h-11"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={emailBusy || !newEmail.trim()}
                    onClick={() => void changeEmail()}
                    >
                      {emailBusy ? "Sending…" : "Send email change confirmation"}
                    </Button>
                </section>

                <section className="mt-4 space-y-3 rounded-2xl border border-border/55 bg-background/45 p-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-4 text-primary" strokeWidth={1.8} aria-hidden />
                    <p className="text-sm font-semibold text-foreground">Change password</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="account-new-password">New password</Label>
                      <Input
                        id="account-new-password"
                        type="password"
                        value={passwordForm.next}
                        onChange={(e) =>
                          setPasswordForm((f) => ({ ...f, next: e.target.value }))
                        }
                        className="min-h-11"
                        minLength={8}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account-confirm-password">Confirm password</Label>
                      <Input
                        id="account-confirm-password"
                        type="password"
                        value={passwordForm.confirm}
                        onChange={(e) =>
                          setPasswordForm((f) => ({ ...f, confirm: e.target.value }))
                        }
                        className="min-h-11"
                        minLength={8}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={
                      passwordBusy ||
                      !passwordForm.next.trim() ||
                      !passwordForm.confirm.trim()
                    }
                    onClick={() => void changePassword()}
                  >
                    {passwordBusy ? "Updating…" : "Update password"}
                  </Button>
                </section>
              </WorkspaceSurfaceCard>
            </div>
          </>
        )}
      </WorkspaceFormPageStack>
    </>
  );
}
