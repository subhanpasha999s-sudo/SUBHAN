"use client";

import * as React from "react";

import { ArrowRight, Check, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TULMIN_PLANS,
  YEARLY_SAVINGS_PERCENT,
  formatPlanPrice,
  planLabelLimitText,
  planCycleCaption,
  type BillingCycle,
  type TulminPlanId,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

type PricingCardsProps = {
  currentPlan?: TulminPlanId;
  reason?: string;
  onChoosePlan?: (plan: TulminPlanId) => void;
  compact?: boolean;
};

export function PricingCards({
  currentPlan = "free",
  reason,
  onChoosePlan,
  compact = false,
}: PricingCardsProps) {
  const [cycle, setCycle] = React.useState<BillingCycle>("monthly");

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[radial-gradient(circle_at_8%_0%,hsl(var(--primary)/0.22),transparent_34%),radial-gradient(circle_at_94%_12%,rgba(251,191,36,0.13),transparent_28%),linear-gradient(180deg,hsl(var(--card)/0.98),hsl(var(--muted)/0.2))] p-5 shadow-[0_24px_80px_-46px_rgb(37_99_235/0.85)] ring-1 ring-white/[0.04]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles className="size-3.5" aria-hidden />
              Tulmin AI plans
            </p>
            <h2 className="mt-4 max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Start free. Upgrade when your label work needs more speed.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Filter, auto-crop, match Amazon invoices, and export clean dispatch files with usage limits that are clear before you pay.
            </p>
          </div>
          <div className="space-y-3">
            <div className="inline-flex rounded-2xl border border-border/60 bg-background/70 p-1 shadow-inner">
              {(["monthly", "yearly"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "h-9 rounded-xl px-4 text-xs font-bold capitalize transition-all duration-200",
                    cycle === option
                      ? "bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_rgb(96_165_250/0.95)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setCycle(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="size-4" aria-hidden />
              SAVE {YEARLY_SAVINGS_PERCENT}% yearly
            </div>
          </div>
        </div>
        {reason ? (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-100">
            {reason}
          </div>
        ) : null}
      </div>

      <div className={cn("grid gap-4", compact && "gap-3")}>
        {TULMIN_PLANS.map((plan) => {
          const active = plan.id === currentPlan;
          const paid = plan.id !== "free";
          return (
            <article
              key={plan.id}
              className={cn(
                "group relative overflow-hidden rounded-[1.6rem] border bg-[linear-gradient(180deg,hsl(var(--card)/0.96),hsl(var(--muted)/0.18))] p-5 shadow-[0_18px_54px_-42px_rgb(15_23_42/0.7)] ring-1 ring-white/[0.035] transition-all duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-[0_24px_70px_-48px_rgb(96_165_250/0.75)] sm:p-6",
                plan.highlighted
                  ? "border-primary/45 ring-1 ring-primary/25"
                  : "border-border/70",
                active && "border-emerald-400/45 ring-1 ring-emerald-400/20"
              )}
            >
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              {plan.badge ? (
                <div className="absolute right-4 top-4 rounded-full border border-primary/25 bg-primary/12 px-2.5 py-1 text-[11px] font-bold text-primary">
                  {plan.badge}
                </div>
              ) : null}
              <div className="grid gap-5 lg:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.3fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-muted-foreground">{plan.name}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
                    {paid && cycle === "yearly" ? (
                      <span className="pb-1 text-sm font-semibold text-muted-foreground line-through">
                        ₹{plan.monthlyPrice.toLocaleString("en-IN")}/month
                      </span>
                    ) : null}
                    <span className="text-3xl font-semibold tracking-tight text-foreground">
                      {formatPlanPrice(plan, cycle)}
                    </span>
                    <span className="pb-1 text-sm font-medium text-muted-foreground">
                      / {planCycleCaption(plan, cycle)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-primary">
                    {planLabelLimitText(plan)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{plan.dailyFit}</p>
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-foreground">{plan.tagline}</p>
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm text-foreground/90">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex min-w-[12rem] flex-col gap-2 lg:items-end">
                  {paid && cycle === "yearly" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-200">
                      <Zap className="size-3.5" aria-hidden />
                      SAVE {YEARLY_SAVINGS_PERCENT}%
                    </span>
                  ) : null}
                  <Button
                    className="h-11 w-full rounded-2xl lg:w-[12rem]"
                    variant={plan.highlighted ? "default" : "outline"}
                    disabled={active}
                    onClick={() => onChoosePlan?.(plan.id)}
                  >
                    {active ? "Current Plan" : plan.cta}
                    {!active ? <ArrowRight className="size-4" aria-hidden /> : null}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
