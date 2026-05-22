"use client";

import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TULMIN_PLANS,
  planLabelLimitText,
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
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-primary/20 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--muted)/0.24))] p-5 shadow-[0_18px_60px_-40px_rgb(37_99_235/0.7)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles className="size-3.5" aria-hidden />
              Tulmin AI plans
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Start free. Upgrade when dispatch becomes daily.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Filter, auto-crop, and export marketplace labels without slowing down your packing desk.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300">
            <ShieldCheck className="size-4" aria-hidden />
            Secure usage checks
          </div>
        </div>
        {reason ? (
          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-100">
            {reason}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "grid gap-3",
          compact ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"
        )}
      >
        {TULMIN_PLANS.map((plan) => {
          const active = plan.id === currentPlan;
          return (
            <article
              key={plan.id}
              className={cn(
                "relative overflow-hidden rounded-3xl border bg-card/92 p-5 shadow-[0_16px_44px_-34px_rgb(15_23_42/0.55)] transition-transform duration-200 motion-safe:hover:-translate-y-1",
                plan.highlighted
                  ? "border-primary/45 ring-1 ring-primary/25"
                  : "border-border/70",
                active && "border-emerald-400/45 ring-1 ring-emerald-400/20"
              )}
            >
              {plan.highlighted ? (
                <div className="absolute right-4 top-4 rounded-full border border-primary/25 bg-primary/12 px-2.5 py-1 text-[11px] font-bold text-primary">
                  Best value
                </div>
              ) : null}
              <p className="text-sm font-semibold text-muted-foreground">{plan.name}</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-3xl font-semibold tracking-tight text-foreground">
                  {plan.price}
                </span>
                <span className="pb-1 text-sm font-medium text-muted-foreground">
                  / {plan.period}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-primary">
                {planLabelLimitText(plan)}
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{plan.dailyFit}</p>
              <p className="mt-4 min-h-10 text-sm leading-5 text-muted-foreground">{plan.tagline}</p>
              <ul className="mt-5 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm text-foreground/90">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-5 h-11 w-full rounded-2xl"
                variant={plan.highlighted ? "default" : "outline"}
                disabled={active}
                onClick={() => onChoosePlan?.(plan.id)}
              >
                {active ? "Current plan" : plan.cta}
                {!active ? <ArrowRight className="size-4" aria-hidden /> : null}
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
