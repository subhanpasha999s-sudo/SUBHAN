import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { PricingCards } from "@/components/billing/pricing-cards";
import { TulminBrand } from "@/components/brand/tulmin-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tulmin AI Pricing | Free, Starter, Pro, and Business Plans",
  description:
    "Choose a Tulmin AI plan for Meesho, Flipkart, and Amazon label filtering, auto-crop, SKU/QTY sorting, courier filters, and dispatch exports.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#050506] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(101,91,255,0.2),transparent_42%)]" />
      <div className="relative mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Tulmin home">
            <TulminBrand
              markClassName="size-10"
              titleClassName="text-[15px] text-white"
              subtitleClassName="text-[11px] text-white/48"
              subtitle="Dispatch AI"
              priority
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-10 rounded-full border-white/12 bg-white/[0.04] px-4 text-white hover:bg-white/[0.08]"
              )}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Home
            </Link>
            <Link
              href="/export-labels"
              className={cn(buttonVariants({ size: "lg" }), "h-10 rounded-full px-4")}
            >
              Start run
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </header>

        <div className="py-8">
          <PricingCards currentPlan="free" />
        </div>
      </div>
    </main>
  );
}
