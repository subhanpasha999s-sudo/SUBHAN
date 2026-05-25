"use client";

import * as React from "react";

import Link from "next/link";
import { BarChart3, CreditCard, Gift, KeyRound, Loader2, LockKeyhole, Mail, Save } from "lucide-react";
import { toast as notify } from "sonner";

import { AdminNav } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";
import type { AdminBillingPlanSetting, AdminBillingSettings } from "@/lib/admin/billing-settings";

type BillingPayload = {
  settings: AdminBillingSettings;
  plans: AdminBillingPlanSetting[];
};

function money(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "h-10 rounded-md border border-white/10 bg-black/25 px-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-600 focus:border-[#7d8cff]/60";
}

export function AdminBillingDashboard() {
  const [data, setData] = React.useState<BillingPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [secretForm, setSecretForm] = React.useState({
    razorpayKeySecret: "",
    razorpayWebhookSecret: "",
  });
  const [grantForm, setGrantForm] = React.useState({
    userId: "",
    userEmail: "",
    labelCount: 500,
    reason: "support_bonus",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/billing", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load billing.");
      setData(json as BillingPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load billing.";
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...data.settings,
            ...secretForm,
          },
          plans: data.plans,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save billing.");
      setData(json as BillingPayload);
      setSecretForm({ razorpayKeySecret: "", razorpayWebhookSecret: "" });
      notify.success("Billing settings saved");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Could not save billing.");
    } finally {
      setSaving(false);
    }
  }

  async function grantCredits() {
    if (!grantForm.userEmail.trim() || grantForm.labelCount <= 0) {
      notify.error("Add a user email and label count.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant_credits",
          grant: grantForm,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add credits.");
      setData(json as BillingPayload);
      setGrantForm({ userId: "", userEmail: "", labelCount: 500, reason: "support_bonus" });
      notify.success("Bonus labels added");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Could not add credits.");
    } finally {
      setSaving(false);
    }
  }

  function updatePlan(plan: AdminBillingPlanSetting["plan"], patch: Partial<AdminBillingPlanSetting>) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            plans: prev.plans.map((p) => (p.plan === plan ? { ...p, ...patch } : p)),
          }
        : prev
    );
  }

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="border-b border-white/10 bg-[#0b0f17]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8fa8ff]">Tulmin Admin</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">MRR & billing</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav />
            <Button className="h-9 rounded-md" disabled={saving || loading || !data} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Save changes
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold tracking-tight">Billing control</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Connect Razorpay, manage checkout readiness, update plan pricing, and grant usage credits.
          </p>
        </div>
        {loading ? (
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg border border-white/10 bg-white/[0.06]" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-400/20 bg-[#1a0f13] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md border border-red-400/20 bg-red-400/10 text-red-100">
                  <LockKeyhole className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-red-50">{error}</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-red-100/62">
                    Sign in with a super admin account to manage plan pricing, payment settings, and usage credits.
                  </p>
                </div>
              </div>
              <Link
                href="/admin/login"
                className="inline-flex h-9 items-center justify-center rounded-md bg-[#335cff] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#284ae4]"
              >
                Admin login
              </Link>
            </div>
          </div>
        ) : data ? (
          <div className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-lg border border-white/10 bg-[#0f151f] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-md border border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                    <CreditCard className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold">Razorpay account</h2>
                    <p className="text-sm text-slate-500">
                      {data.settings.razorpayKeySecretSaved
                        ? `Secret saved •••• ${data.settings.razorpayKeySecretLast4}`
                        : "No secret saved yet"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  <Field label="Mode">
                    <select
                      className={inputClass()}
                      value={data.settings.mode}
                      onChange={(e) =>
                        setData((prev) =>
                          prev
                            ? { ...prev, settings: { ...prev.settings, mode: e.target.value as "test" | "live" } }
                            : prev
                        )
                      }
                    >
                      <option value="test">Test mode</option>
                      <option value="live">Live mode</option>
                    </select>
                  </Field>
                  <Field label="Razorpay Key ID">
                    <input
                      className={inputClass()}
                      value={data.settings.razorpayKeyId}
                      onChange={(e) =>
                        setData((prev) =>
                          prev ? { ...prev, settings: { ...prev.settings, razorpayKeyId: e.target.value } } : prev
                        )
                      }
                      placeholder="rzp_test_..."
                    />
                  </Field>
                  <Field label="Razorpay Key Secret">
                    <input
                      className={inputClass()}
                      type="password"
                      value={secretForm.razorpayKeySecret}
                      onChange={(e) => setSecretForm((p) => ({ ...p, razorpayKeySecret: e.target.value }))}
                      placeholder={data.settings.razorpayKeySecretSaved ? "Leave blank to keep saved secret" : "Paste secret"}
                    />
                  </Field>
                  <Field label="Webhook Secret">
                    <input
                      className={inputClass()}
                      type="password"
                      value={secretForm.razorpayWebhookSecret}
                      onChange={(e) => setSecretForm((p) => ({ ...p, razorpayWebhookSecret: e.target.value }))}
                      placeholder={data.settings.razorpayWebhookSecretSaved ? "Leave blank to keep saved webhook secret" : "Paste webhook secret"}
                    />
                  </Field>
                  <button
                    type="button"
                    className="flex items-center justify-between rounded-md border border-white/10 bg-black/25 px-3 py-2.5 text-left"
                    onClick={() =>
                      setData((prev) =>
                        prev
                          ? {
                              ...prev,
                              settings: {
                                ...prev.settings,
                                checkoutEnabled: !prev.settings.checkoutEnabled,
                              },
                            }
                          : prev
                      )
                    }
                  >
                      <span>
                        <span className="block text-sm font-semibold">Checkout enabled</span>
                      <span className="text-xs text-slate-500">Turn on only after live keys and webhooks are ready.</span>
                    </span>
                    <span className={data.settings.checkoutEnabled ? "text-emerald-300" : "text-white/35"}>
                      {data.settings.checkoutEnabled ? "On" : "Off"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-[#0f151f] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-md border border-[#7d8cff]/25 bg-[#7d8cff]/12 text-[#bdc5ff]">
                    <KeyRound className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold">Plan pricing</h2>
                    <p className="text-sm text-slate-500">Change prices and attach Razorpay plan IDs anytime.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  {data.plans.map((plan) => (
                    <div key={plan.plan} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold capitalize">{plan.plan}</p>
                          <p className="text-xs text-slate-500">
                            {plan.labelLimit == null ? "Unlimited labels" : `${plan.labelLimit.toLocaleString("en-IN")} labels/month`}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={plan.enabled ? "rounded-md bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-200" : "rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold text-slate-500"}
                          onClick={() => updatePlan(plan.plan, { enabled: !plan.enabled })}
                        >
                          {plan.enabled ? "Enabled" : "Disabled"}
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <input
                          className={inputClass()}
                          type="number"
                          value={plan.monthlyPrice}
                          onChange={(e) => updatePlan(plan.plan, { monthlyPrice: Number(e.target.value) })}
                          aria-label={`${plan.plan} monthly price`}
                        />
                        <input
                          className={inputClass()}
                          value={plan.razorpayMonthlyPlanId}
                          onChange={(e) => updatePlan(plan.plan, { razorpayMonthlyPlanId: e.target.value })}
                          placeholder="Razorpay monthly plan ID"
                        />
                        <input
                          className={inputClass()}
                          type="number"
                          value={plan.yearlyMonthlyEquivalent}
                          onChange={(e) => updatePlan(plan.plan, { yearlyMonthlyEquivalent: Number(e.target.value) })}
                          aria-label={`${plan.plan} yearly monthly equivalent`}
                          placeholder="Yearly monthly equivalent"
                        />
                        <input
                          className={inputClass()}
                          type="number"
                          value={plan.yearlyTotal}
                          onChange={(e) => updatePlan(plan.plan, { yearlyTotal: Number(e.target.value) })}
                          aria-label={`${plan.plan} yearly total`}
                        />
                        <input
                          className={inputClass()}
                          value={plan.razorpayYearlyPlanId}
                          onChange={(e) => updatePlan(plan.plan, { razorpayYearlyPlanId: e.target.value })}
                          placeholder="Razorpay yearly plan ID"
                        />
                        <input
                          className={inputClass()}
                          type="number"
                          value={plan.labelLimit ?? ""}
                          onChange={(e) =>
                            updatePlan(plan.plan, {
                              labelLimit: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder="Monthly label limit, blank = unlimited"
                        />
                        <input
                          className={inputClass()}
                          type="number"
                          value={plan.dailyLimit ?? ""}
                          onChange={(e) =>
                            updatePlan(plan.plan, {
                              dailyLimit: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder="Daily label limit, blank = none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#0f151f] p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-md border border-amber-300/20 bg-amber-300/10 text-amber-100">
                  <Gift className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-base font-semibold">Add bonus usage</h2>
                  <p className="text-sm text-slate-500">Give a seller extra label credits by email without changing their plan.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_10rem_14rem_auto] lg:items-end">
                <Field label="User email">
                  <input
                    className={inputClass()}
                    type="email"
                    value={grantForm.userEmail}
                    onChange={(e) => setGrantForm((p) => ({ ...p, userEmail: e.target.value }))}
                    placeholder="seller@example.com"
                  />
                </Field>
                <Field label="Labels">
                  <input
                    className={inputClass()}
                    type="number"
                    value={grantForm.labelCount}
                    onChange={(e) => setGrantForm((p) => ({ ...p, labelCount: Number(e.target.value) }))}
                  />
                </Field>
                <Field label="Reason">
                  <input
                    className={inputClass()}
                    value={grantForm.reason}
                    onChange={(e) => setGrantForm((p) => ({ ...p, reason: e.target.value }))}
                    placeholder="support_bonus"
                  />
                </Field>
                <Button className="h-10 rounded-md" disabled={saving} onClick={() => void grantCredits()}>
                  <Mail className="size-4" aria-hidden />
                  Add credits
                </Button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Email is the admin-facing identifier. Supabase UUIDs stay behind the scenes for database relations.
              </p>
            </section>

            <section className="rounded-lg border border-white/10 bg-[#0f151f] p-4">
              <div className="flex items-center gap-3">
                <BarChart3 className="size-5 text-[#bdc5ff]" aria-hidden />
                <h2 className="text-base font-semibold">Secure billing architecture</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  "Secrets stay server-side and encrypted before storage.",
                  "Plan prices can be changed without redeploying the public UI.",
                  "Payment events have a dedicated table for webhooks and revenue tracking.",
                ].map((item) => (
                  <div key={item} className="rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-400">
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
