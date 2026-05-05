import type { Metadata } from "next";
import Link from "next/link";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";

const SUPPORT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for Label.",
};

export default function TermsPage() {
  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Label PDF", href: "/export-labels" },
          { label: "Terms" },
        ]}
        title="Terms of service"
        description="By using Label, you agree to the following sensible guardrails—we’re a small tooling product, not a marketplace."
      />
      <WorkspaceSurfaceCard padding="p-6 sm:p-8">
        <article className="space-y-5 text-[15px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">The service</h2>
            <p>
              Label is provided “as-is” at no charge unless we publish a separate commercial plan.
              Features may evolve, pause, or require maintenance—we’ll try not to strand you overnight,
              but you should retain exports of mapping data you rely on.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Your responsibilities</h2>
            <p>
              You are responsible for complying with courier, marketplace, and legal obligations tied
              to the labels or data you process. Validate samples before committing high-volume runs.
              You must not misuse the hosted APIs (scraping unrelated data, disrupting other users).
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">No warranties</h2>
            <p>
              Labels that look correct in previews may still violate carrier specs or fulfillment rules
              in edge cases—we don’t promise zero-defect extracts for every seller PDF variation.
              Maximum liability aligns with supplying a gratis utility: discontinue use if it doesn’t
              fit your reliability bar.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Contact</h2>
            <p>
              {SUPPORT ? (
                <>
                  <a
                    href={`mailto:${SUPPORT}`}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {SUPPORT}
                  </a>
                  .
                </>
              ) : (
                <>
                  Set <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">NEXT_PUBLIC_CONTACT_EMAIL</code>{" "}
                  for production so customers can reach operators.
                </>
              )}
            </p>
          </section>
          <p className="border-t border-border pt-5 text-[13px]">
            See{" "}
            <Link href="/privacy" className="font-medium text-primary underline-offset-2 hover:underline">
              Privacy
            </Link>{" "}
            for how data is handled. Update your deployment copy before binding corporate customers—we
            are not attorneys.
          </p>
        </article>
      </WorkspaceSurfaceCard>
    </>
  );
}
