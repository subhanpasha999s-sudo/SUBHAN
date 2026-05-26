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

const COMPLETE_WORKFLOW_FEATURES = [
  "Auto-crop shipping labels",
  "Auto-crop invoices",
  "Meesho, Flipkart, Amazon filters",
  "Filter by SKU, QTY, payment mode, carrier",
  "SKU-wise and marketplace-wise sorting",
  "One-click SKU file download",
  "PDF and ZIP export",
  "Detect Amazon SKU + QTY and print them on shipping labels",
];

export const TULMIN_PLANS: readonly TulminPlan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyMonthlyEquivalent: 0,
    yearlyTotal: 0,
    labelLimit: 150,
    dailyLabelLimit: null,
    dailyFit: "150 complete workflows/month",
    tagline: "Test Tulmin with real marketplace labels.",
    cta: "Current Plan",
    features: [
      "150 labels/month",
      ...COMPLETE_WORKFLOW_FEATURES,
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
    dailyLabelLimit: null,
    dailyFit: "1,500 complete workflows/month",
    tagline: "Best first paid plan for regular dispatch.",
    cta: "Upgrade to Starter",
    features: [
      "1,500 labels/month",
      ...COMPLETE_WORKFLOW_FEATURES,
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
    dailyFit: "Unlimited complete workflows",
    tagline: "For growing sellers who do not want limits.",
    cta: "Upgrade to Pro",
    badge: "BEST VALUE",
    highlighted: true,
    features: [
      "Unlimited normal use",
      ...COMPLETE_WORKFLOW_FEATURES,
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
    dailyFit: "Unlimited heavy batch workflows",
    tagline: "For high-volume teams and custom needs.",
    cta: "Upgrade to Business",
    badge: "FOR TEAMS",
    features: [
      "Unlimited heavy batch use",
      ...COMPLETE_WORKFLOW_FEATURES,
      "Priority support",
      "Feature enablement on request",
      "Higher batch capacity",
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
  if (plan.id === "free") return "₹0";
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
