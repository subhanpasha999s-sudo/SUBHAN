export type TulminPlanId = "free" | "starter" | "pro" | "business";

export type TulminPlan = {
  id: TulminPlanId;
  name: string;
  monthlyPrice: number;
  yearlyMonthlyEquivalent: number;
  yearlyTotal: number;
  labelLimit: number | null;
  dailyLabelLimit?: number | null;
  dailyFit: string;
  tagline: string;
  cta: string;
  badge?: string;
  highlighted?: boolean;
  features: string[];
};

export type BillingCycle = "monthly" | "yearly";

export const YEARLY_SAVINGS_PERCENT = 29;

export const TULMIN_PLANS: readonly TulminPlan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyMonthlyEquivalent: 0,
    yearlyTotal: 0,
    labelLimit: 150,
    dailyLabelLimit: null,
    dailyFit: "Try with 150 labels/month",
    tagline: "Try the complete workflow before paying.",
    cta: "Current Plan",
    features: [
      "150 labels/month",
      "All filters included",
      "Auto-crop included",
      "PDF and ZIP export",
      "Meesho, Flipkart, Amazon",
      "SKU and QTY detection",
      "Local SKU mapping",
      "Upgrade only when volume grows",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 99,
    yearlyMonthlyEquivalent: 70,
    yearlyTotal: 840,
    labelLimit: 1500,
    dailyLabelLimit: 50,
    dailyFit: "Up to 50 labels/day",
    tagline: "Same full workflow with daily paid volume.",
    cta: "Upgrade to Starter",
    features: [
      "1,500 labels/month",
      "Up to 50 labels/day",
      "All marketplace filters",
      "Auto-crop and invoice crop",
      "PDF and ZIP export",
      "Amazon SKU/QTY workflow",
      "Local SKU mapping",
      "Basic upload history",
      "Regular seller support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 199,
    yearlyMonthlyEquivalent: 141,
    yearlyTotal: 1692,
    labelLimit: null,
    dailyLabelLimit: null,
    dailyFit: "Unlimited normal seller use",
    tagline: "Full workflow for active daily sellers.",
    cta: "Upgrade to Pro",
    badge: "BEST VALUE",
    highlighted: true,
    features: [
      "Unlimited normal use",
      "All filters and crop tools",
      "PDF and ZIP export",
      "Meesho, Flipkart, Amazon",
      "Cloud SKU mapping",
      "Upload history",
      "Priority processing",
      "Priority support",
    ],
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 499,
    yearlyMonthlyEquivalent: 354,
    yearlyTotal: 4248,
    labelLimit: null,
    dailyLabelLimit: null,
    dailyFit: "Unlimited heavy batch use",
    tagline: "Full workflow for teams and heavy batches.",
    cta: "Talk to Sales",
    badge: "FOR TEAMS",
    features: [
      "Unlimited heavy batch use",
      "All filters and crop tools",
      "PDF and ZIP export",
      "Meesho, Flipkart, Amazon",
      "Team workspace",
      "Multi-user access",
      "Cloud SKU mapping",
      "Priority support",
      "Team dispatch controls",
    ],
  },
] as const;

export const TULMIN_PLAN_BY_ID = Object.fromEntries(
  TULMIN_PLANS.map((plan) => [plan.id, plan])
) as Record<TulminPlanId, TulminPlan>;

export function planLabelLimitText(plan: TulminPlan): string {
  return plan.labelLimit == null
    ? "Unlimited labels"
    : `${plan.labelLimit.toLocaleString()} labels/month`;
}

export function isPaidPlan(planId: TulminPlanId): boolean {
  return planId !== "free";
}

export function formatPlanPrice(plan: TulminPlan, cycle: BillingCycle): string {
  const amount = cycle === "yearly" ? plan.yearlyMonthlyEquivalent : plan.monthlyPrice;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function planCycleCaption(plan: TulminPlan, cycle: BillingCycle): string {
  if (plan.id === "free") return "forever";
  if (cycle === "yearly") {
    return `per month, billed ₹${plan.yearlyTotal.toLocaleString("en-IN")}/year`;
  }
  return "per month";
}

export function nextPlanRecommendation(planId: TulminPlanId): TulminPlan {
  if (planId === "free") return TULMIN_PLAN_BY_ID.starter;
  if (planId === "starter") return TULMIN_PLAN_BY_ID.pro;
  if (planId === "pro") return TULMIN_PLAN_BY_ID.business;
  return TULMIN_PLAN_BY_ID.business;
}
