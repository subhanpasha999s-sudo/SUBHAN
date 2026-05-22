export type TulminPlanId = "free" | "starter" | "pro" | "business";

export type TulminPlan = {
  id: TulminPlanId;
  name: string;
  price: string;
  period: string;
  labelLimit: number | null;
  dailyFit: string;
  tagline: string;
  cta: string;
  highlighted?: boolean;
  features: string[];
};

export const TULMIN_PLANS: readonly TulminPlan[] = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    period: "forever",
    labelLimit: 150,
    dailyFit: "Try with 150 labels/month",
    tagline: "Experience the workflow before paying.",
    cta: "Start free",
    features: [
      "150 labels every month",
      "Marketplace, SKU, and QTY filters",
      "Single PDF export",
      "Local SKU mapping",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "₹99",
    period: "month",
    labelLimit: 1500,
    dailyFit: "Up to 50 labels/day",
    tagline: "For small sellers who dispatch daily.",
    cta: "Upgrade to Starter",
    features: [
      "1,500 labels every month",
      "SKU, QTY, payment, courier filters",
      "Marketplace-wise filtering",
      "PDF export",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹199",
    period: "month",
    labelLimit: null,
    dailyFit: "Unlimited normal seller use",
    tagline: "The best value for active dispatch teams.",
    cta: "Upgrade to Pro",
    highlighted: true,
    features: [
      "Unlimited label filtering",
      "Auto-crop labels and invoices",
      "ZIP by SKU",
      "Amazon SKU/QTY on shipping labels",
      "Cloud SKU mapping",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "₹499",
    period: "month",
    labelLimit: null,
    dailyFit: "Team and heavy batch use",
    tagline: "For warehouses that need priority workflows.",
    cta: "Talk to sales",
    features: [
      "Team workspace",
      "Bulk heavy processing",
      "Upload history",
      "Multi-user access",
      "Priority support",
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
