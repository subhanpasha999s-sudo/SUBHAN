import type { Metadata } from "next";

import { PricingCards } from "@/components/billing/pricing-cards";

export const metadata: Metadata = {
  title: "Tulmin AI Pricing | Free, Starter, Pro, and Business Plans",
  description:
    "Choose a Tulmin AI plan for Meesho, Flipkart, and Amazon label filtering, auto-crop, SKU/QTY sorting, courier filters, and dispatch exports.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PricingCards currentPlan="free" />
    </main>
  );
}
