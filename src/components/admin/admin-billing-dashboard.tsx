"use client";

import * as React from "react";

import Link from "next/link";
import { ArrowLeft, BarChart3, CreditCard, Gift, KeyRound, Loader2, Save } from "lucide-react";
import { toast as notify } from "sonner";

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
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/42">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "h-11 rounded-2xl border border-white/10 bg-black/25 px-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-white/28 focus:border-[#7d8cff]/60";
}

export function AdminBillingDashboard() {
  const [data, setData] = React.useState<BillingPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [secretForm, setSecretForm] = React.useState({
    razorpayKeySecret: "",
    razorpayWebhookSecret: "",
  });
  const [grantForm, setGrantForm] = React.useState({
    userId: "",
    labelCount: 500,
    reason: "support_bonus",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load billing.");
      setData(json as BillingPayload);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Could not load billing.");
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
    if (!grantForm.userId.trim() || grantForm.labelCount <= 0) {
      notify.error("Add a user ID and label count.");
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
      setGrantForm({ userId: "", labelCount: 500, reason: "support_bonus" });
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
    <main className="min-h-screen bg-[#05070c] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin/analytics" className="inline-flex items-center gap-2 text-sm font-semibold text-white/55 hover:text-white">
              <ArrowLeft className="size-4" aria-hidden />
              Analytics
            </Link>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              Billing control
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Connect Razorpay, manage checkout readiness, and update plan pricing from one secure admin screen.
            </p>
          </div>
          <Button className="h-11 rounded-2xl" disabled={saving || loading || !data} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            Save changes
          </Button>
        </div>

        {loading ? (
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-[1.35rem] border border-white/10 bg-white/[0.06]" />
            ))}
          </div>
        ) : data ? (
          <div className="mt-8 space-y-6">
            <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                    <CreditCard className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">Razorpay account</h2>
                    <p className="text-sm text-white/45">
                      {data.settings.razorpayKeySecretSaved
                        ? `Secret saved •••• ${data.settings.razorpayKeySecretLast4}`
                        : "No secret saved yet"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
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
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left"
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
                      <span className="text-xs text-white/45">Turn on only after live keys and webhooks are ready.</span>
                    </span>
                    <span className={data.settings.checkoutEnabled ? "text-emerald-300" : "text-white/35"}>
                      {data.settings.checkoutEnabled ? "On" : "Off"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl border border-[#7d8cff]/25 bg-[#7d8cff]/12 text-[#bdc5ff]">
                    <KeyRound className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">Plan pricing</h2>
                    <p className="text-sm text-white/45">Change prices and attach Razorpay plan IDs anytime.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  {data.plans.map((plan) => (
                    <div key={plan.plan} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold capitalize">{plan.plan}</p>
                          <p className="text-xs text-white/45">
                            {plan.labelLimit == null ? "Unlimited labels" : `${plan.labelLimit.toLocaleString("en-IN")} labels/month`}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={plan.enabled ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200" : "rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/45"}
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

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-100">
                  <Gift className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Add bonus usage</h2>
                  <p className="text-sm text-white/45">Give a seller extra label credits without changing their plan.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_10rem_14rem_auto] lg:items-end">
                <Field label="User ID">
                  <input
                    className={inputClass()}
                    value={grantForm.userId}
                    onChange={(e) => setGrantForm((p) => ({ ...p, userId: e.target.value }))}
                    placeholder="auth user UUID"
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
                <Button className="h-11 rounded-2xl" disabled={saving} onClick={() => void grantCredits()}>
                  Add credits
                </Button>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5">
              <div className="flex items-center gap-3">
                <BarChart3 className="size-5 text-[#bdc5ff]" aria-hidden />
                <h2 className="text-lg font-semibold">Secure billing architecture</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  "Secrets stay server-side and encrypted before storage.",
                  "Plan prices can be changed without redeploying the public UI.",
                  "Payment events have a dedicated table for webhooks and revenue tracking.",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/62">
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
