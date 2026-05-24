"use client";

import * as React from "react";

import { ArrowRight, Check, Crown, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TULMIN_PLANS,
  YEARLY_SAVINGS_PERCENT,
  formatPlanPrice,
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
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#050506] px-4 py-6 text-white shadow-[0_30px_120px_-50px_rgb(0_0_0/0.9)] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_50%_0%,rgba(101,91,255,0.22),transparent_35%)]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/70">
            <Sparkles className="size-3.5 text-[#7d8cff]" aria-hidden />
            Tulmin AI billing
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Upgrade your plan
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/62">
            Choose the label processing limit and workflow power your packing desk needs.
          </p>
          {reason ? (
            <div className="mt-4 rounded-2xl border border-amber-300/18 bg-amber-300/10 px-4 py-3 text-left text-sm font-medium text-amber-50">
              {reason}
            </div>
          ) : null}
          <div className="mx-auto mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.08] p-1 shadow-inner">
            {(["monthly", "yearly"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  "h-10 min-w-28 rounded-full px-5 text-sm font-semibold capitalize transition-all duration-200",
                  cycle === option
                    ? "bg-white text-black shadow-[0_14px_34px_-20px_rgb(255_255_255/0.7)]"
                    : "text-white/55 hover:text-white"
                )}
                onClick={() => setCycle(option)}
              >
                {option}
              </button>
            ))}
          </div>
          {cycle === "yearly" ? (
            <p className="mt-2 text-xs font-bold text-emerald-300">
              SAVE {YEARLY_SAVINGS_PERCENT}% with yearly billing
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "mt-7 grid gap-4",
            compact ? "xl:grid-cols-4" : "lg:grid-cols-2 xl:grid-cols-4"
          )}
        >
          {TULMIN_PLANS.map((plan) => {
            const active = plan.id === currentPlan;
            const highlighted = plan.id === "pro";
            const paid = plan.id !== "free";

            return (
              <article
                key={plan.id}
                className={cn(
                  "relative flex min-h-[34rem] flex-col rounded-[1.45rem] border bg-[#202020] p-5 shadow-[0_18px_70px_-54px_rgb(0_0_0/0.9)] transition-all duration-300 motion-safe:hover:-translate-y-1",
                  highlighted
                    ? "border-[#6b63ff]/70 bg-[linear-gradient(145deg,#353164,#202026)] shadow-[0_24px_92px_-55px_rgb(107_99_255/0.85)]"
                    : "border-white/10 hover:border-white/20",
                  active && "ring-1 ring-emerald-300/35"
                )}
              >
                {plan.badge ? (
                  <span className="absolute right-5 top-5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white/72">
                    {plan.badge === "BEST VALUE" ? "Popular" : plan.badge}
                  </span>
                ) : null}
                <h3 className="text-2xl font-semibold tracking-tight">{plan.name}</h3>
                <div className="mt-12">
                  {paid && cycle === "yearly" ? (
                    <p className="mb-1 text-sm font-semibold text-white/42 line-through">
                      ₹{plan.monthlyPrice.toLocaleString("en-IN")} / month
                    </p>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-semibold tracking-tight">
                      {formatPlanPrice(plan, cycle)}
                    </span>
                    <span className="pb-2 text-xs font-medium text-white/55">
                      {planCycleCaption(plan, cycle)}
                    </span>
                  </div>
                  <p className="mt-5 min-h-12 text-base font-semibold leading-6 text-white/92">
                    {plan.tagline}
                  </p>
                </div>

                <Button
                  className={cn(
                    "mt-5 h-12 rounded-full text-sm font-semibold",
                    highlighted
                      ? "bg-[#635bff] text-white hover:bg-[#716aff]"
                      : "bg-white text-black hover:bg-white/90"
                  )}
                  disabled={active}
                  onClick={() => onChoosePlan?.(plan.id)}
                >
                  {active ? "Your current plan" : plan.cta}
                  {!active ? <ArrowRight className="size-4" aria-hidden /> : null}
                </Button>

                <ul className="mt-7 space-y-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm leading-5 text-white/78">
                      {highlighted ? (
                        <Crown className="mt-0.5 size-4 shrink-0 text-white/86" aria-hidden />
                      ) : (
                        <Check className="mt-0.5 size-4 shrink-0 text-white/86" aria-hidden />
                      )}
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-auto pt-8 text-xs leading-5 text-white/45">
                  {plan.id === "free"
                    ? "Try the core workflow before upgrading."
                    : plan.id === "starter"
                      ? "Built for daily sellers who need simple limits."
                      : plan.id === "pro"
                        ? "Best for active sellers who want filtering, crop, and ZIP."
                        : "For teams with heavy batch work and shared dispatch."}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
