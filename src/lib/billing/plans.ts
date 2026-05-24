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
    tagline: "Experience the workflow before paying.",
    cta: "Current Plan",
    features: [
      "150 labels/month",
      "Marketplace filters",
      "SKU filters",
      "QTY filters",
      "Single PDF export",
      "Local SKU mapping",
      "Try workflow before upgrading",
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
    tagline: "For small sellers who dispatch daily.",
    cta: "Upgrade to Starter",
    features: [
      "1,500 labels/month",
      "Up to 50 labels/day",
      "SKU filtering",
      "QTY filtering",
      "Payment filtering",
      "Courier filtering",
      "Marketplace-wise filtering",
      "PDF export",
      "Basic upload history",
      "Faster processing",
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
    tagline: "The best value for active dispatch teams.",
    cta: "Upgrade to Pro",
    badge: "BEST VALUE",
    highlighted: true,
    features: [
      "Unlimited normal label filtering",
      "Auto-crop labels",
      "Auto-detect shipping labels",
      "Invoice auto-crop",
      "ZIP export by SKU",
      "Amazon SKU/QTY printing",
      "Cloud SKU mapping",
      "Multi-marketplace support",
      "Priority processing",
      "Better workflow automation",
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
    dailyFit: "Team and heavy batch use",
    tagline: "For warehouses that need priority workflows.",
    cta: "Talk to Sales",
    badge: "FOR TEAMS",
    features: [
      "Unlimited heavy batch processing",
      "Team workspace",
      "Multi-user access",
      "Upload history",
      "Bulk processing",
      "Priority support",
      "Advanced workflow control",
      "Warehouse-friendly workflow",
      "Team dispatch management",
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
