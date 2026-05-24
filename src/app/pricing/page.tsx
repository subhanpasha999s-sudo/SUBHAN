import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";

import { PricingCards } from "@/components/billing/pricing-cards";

export const metadata: Metadata = {
  title: "Tulmin AI Pricing | Free, Starter, Pro, and Business Plans",
  description:
    "Choose a Tulmin AI plan for Meesho, Flipkart, and Amazon label filtering, auto-crop, SKU/QTY sorting, courier filters, and dispatch exports.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <Link
        href="/"
        aria-label="Close pricing"
        className="fixed right-5 top-5 z-10 grid size-11 place-items-center rounded-xl border border-white/12 bg-white/[0.035] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <X className="size-5" aria-hidden />
      </Link>
      <PricingCards currentPlan="free" />
    </main>
  );
}
