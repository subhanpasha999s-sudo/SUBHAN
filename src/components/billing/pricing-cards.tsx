"use client";

import * as React from "react";

import {
  ArrowRight,
  Boxes,
  Cloud,
  CreditCard,
  FileDown,
  FileText,
  Filter,
  Loader2,
  PackageCheck,
  Scissors,
  Truck,
  Users,
  Zap,
} from "lucide-react";

import { TulminLogoMark } from "@/components/brand/tulmin-logo";
import { Button } from "@/components/ui/button";
import {
  TULMIN_PLANS,
  YEARLY_SAVINGS_PERCENT,
  formatPlanPrice,
  planCycleCaption,
  type BillingCycle,
  type TulminPlan,
  type TulminPlanId,
} from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

type PricingCardsProps = {
  currentPlan?: TulminPlanId;
  reason?: string;
  onChoosePlan?: (plan: TulminPlanId, cycle: BillingCycle) => void | Promise<void>;
  busyPlan?: TulminPlanId | null;
  busyCycle?: BillingCycle | null;
  disabled?: boolean;
  compact?: boolean;
};

const PLAN_COPY: Record<
  TulminPlanId,
  { promise: string; bestFor: string; workflowLimit: string; footer: string }
> = {
  free: {
    promise: "150 labels/month includes 150 complete workflows.",
    bestFor: "Testing Tulmin or very small dispatch",
    workflowLimit: "Full workflow included for every processed label",
    footer: "Start free, then upgrade only when label volume grows.",
  },
  starter: {
    promise: "1,500 labels/month includes 1,500 complete workflows.",
    bestFor: "Regular sellers with steady orders",
    workflowLimit: "Full workflow included for every processed label",
    footer: "Best first paid plan for sellers dispatching every week.",
  },
  pro: {
    promise: "Unlimited labels for normal seller use.",
    bestFor: "Growing sellers who process labels daily",
    workflowLimit: "Unlimited complete workflows for normal use",
    footer: "Choose Pro when you do not want to think about monthly limits.",
  },
  business: {
    promise: "Unlimited heavy batch use with higher support.",
    bestFor: "High-volume sellers and business workflows",
    workflowLimit: "Unlimited complete workflows for heavy batches",
    footer: "Use this for bigger batches, support priority, and requested enablement.",
  },
};

const FEATURE_ICONS = [
  Filter,
  Boxes,
  PackageCheck,
  CreditCard,
  Truck,
  FileDown,
  Scissors,
  FileText,
  Cloud,
  Users,
  Zap,
] as const;

export function PricingCards({
  currentPlan = "free",
  reason,
  onChoosePlan,
  busyPlan,
  busyCycle,
  disabled = false,
  compact = false,
}: PricingCardsProps) {
  const [cycle, setCycle] = React.useState<BillingCycle>("monthly");
  const [plans, setPlans] = React.useState<readonly TulminPlan[]>(TULMIN_PLANS);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/billing/plans", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { plans?: TulminPlan[] }) => {
        if (alive && Array.isArray(json.plans) && json.plans.length > 0) setPlans(json.plans);
      })
      .catch(() => {
        // Static defaults keep pricing visible if backend settings are not ready.
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="relative min-h-[calc(100vh-2rem)] overflow-hidden bg-black px-4 py-10 text-white sm:px-6 sm:py-14">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(115,109,255,0.16),transparent_40%)]" />
      <div className="relative mx-auto max-w-[94rem]">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-xs font-semibold text-white/62">
            <TulminLogoMark className="size-4" />
            Same tools in every plan
          </p>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            Choose by label volume, not features
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/62">
            Every Tulmin plan includes the full dispatch workflow. Your plan only controls how many labels you can process each month, plus support and business capacity.
          </p>

          {reason ? (
            <div className="mt-4 rounded-2xl border border-amber-300/18 bg-amber-300/10 px-4 py-3 text-left text-sm font-medium text-amber-50">
              {reason}
            </div>
          ) : null}

          <div className="mx-auto mt-6 inline-flex rounded-full border border-white/10 bg-[#2b2b2b] p-1 shadow-inner">
            {(["monthly", "yearly"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  "h-10 min-w-32 rounded-full px-5 text-sm font-semibold capitalize transition-all duration-200",
                  cycle === option
                    ? "bg-[#1f1f1f] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
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

        <div className={cn("mt-8 grid gap-5", compact ? "xl:grid-cols-4" : "lg:grid-cols-2 xl:grid-cols-4")}>
          {plans.map((plan) => {
            const active = plan.id === currentPlan;
            const highlighted = plan.id === "pro";
            const paid = plan.id !== "free";
            const copy = PLAN_COPY[plan.id];
            const busy = paid && busyPlan === plan.id && busyCycle === cycle;

            return (
              <article
                key={plan.id}
                className={cn(
                  "relative flex min-h-[40rem] flex-col rounded-[1.25rem] border bg-[#202020] p-6 shadow-[0_18px_70px_-54px_rgb(0_0_0/0.9)] transition-all duration-300 motion-safe:hover:-translate-y-1",
                  highlighted
                    ? "border-[#726bff]/80 bg-[linear-gradient(145deg,#34305f,#202026_70%)] shadow-[0_26px_96px_-58px_rgb(107_99_255/0.95)]"
                    : "border-white/[0.14] hover:border-white/25",
                  active && "ring-1 ring-emerald-300/35"
                )}
              >
                {plan.badge ? (
                  <span className="absolute right-5 top-5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white/72">
                    {plan.badge === "BEST VALUE" ? "Popular" : plan.badge}
                  </span>
                ) : null}

                <h3 className="text-[1.65rem] font-semibold tracking-tight">{plan.name}</h3>

                <div className="mt-9">
                  {paid && cycle === "yearly" ? (
                    <p className="mb-1 text-sm font-semibold text-white/42 line-through">
                      ₹{plan.monthlyPrice.toLocaleString("en-IN")} / month
                    </p>
                  ) : null}

                  <div className="flex items-end gap-2">
                    <span className="text-[3.35rem] font-semibold leading-none tracking-tight">
                      {formatPlanPrice(plan, cycle)}
                    </span>
                    <span className="pb-2 text-[12px] font-medium leading-snug text-white/55">
                      {planCycleCaption(plan, cycle)}
                    </span>
                  </div>

                  <p className="mt-5 min-h-14 text-[1rem] font-semibold leading-6 text-white/92">
                    {copy.promise}
                  </p>
                  <p className="mt-2 min-h-9 text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
                    {copy.bestFor}
                  </p>
                </div>

                <Button
                  className={cn(
                    "mt-6 h-12 rounded-full text-sm font-semibold",
                    highlighted
                      ? "bg-[#635bff] text-white shadow-[0_16px_36px_-22px_rgb(99_91_255/0.95)] hover:bg-[#716aff]"
                      : "bg-white text-black hover:bg-white/90"
                  )}
                  disabled={active || disabled || busy}
                  onClick={() => onChoosePlan?.(plan.id, cycle)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {busy ? "Opening checkout..." : active ? "Your current plan" : plan.cta}
                  {!active && !busy ? <ArrowRight className="size-4" aria-hidden /> : null}
                </Button>

                <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-semibold leading-5 text-white/86">
                  {copy.workflowLimit}
                </div>

                <ul className="mt-5 space-y-3">
                  {plan.features.map((feature, index) => {
                    const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length];
                    return (
                      <li key={feature} className="flex gap-3 text-[13px] leading-5 text-white/78">
                        <Icon className="mt-0.5 size-4 shrink-0 text-white/82" aria-hidden />
                        <span>{feature}</span>
                      </li>
                    );
                  })}
                </ul>

                <p className="mt-auto pt-8 text-xs leading-5 text-white/45">
                  {copy.footer}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
