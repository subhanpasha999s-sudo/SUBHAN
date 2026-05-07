import type { Metadata } from "next";
import Link from "next/link";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";
import { getPublicContactEmail } from "@/lib/brand/tulmin";
import { getSiteUrl } from "@/lib/seo/site-url";

const SUPPORT = getPublicContactEmail();

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for Tulmin.",
  alternates: { canonical: `${getSiteUrl()}/terms` },
};

export default function TermsPage() {
  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Labels", href: "/export-labels" },
          { label: "Terms" },
        ]}
        title="Terms of service"
        description="By using Tulmin, you agree to these guardrails — a tooling product, not a marketplace."
      />
      <WorkspaceSurfaceCard padding="p-6 sm:p-8">
        <article className="space-y-5 text-[15px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">The service</h2>
            <p>
              Tulmin is provided “as-is” at no charge unless we publish a separate commercial plan.
              Features may evolve, pause, or require maintenance — retain exports of mapping data you rely on.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Your responsibilities</h2>
            <p>
              You are responsible for complying with courier, marketplace, and legal obligations tied
              to the labels or data you process. Validate samples before high-volume runs.
              You must not misuse hosted APIs (scraping unrelated data, disrupting other users).
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">No warranties</h2>
            <p>
              Labels that look correct in previews may still violate carrier specs or fulfillment rules
              in edge cases — Tulmin does not promise zero-defect extracts for every seller PDF variation.
              Maximum liability aligns with supplying a gratis utility: discontinue use if it does not
              fit your reliability bar.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Contact</h2>
            <p>
              Tulmin:{" "}
              <a
                href={`mailto:${SUPPORT}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {SUPPORT}
              </a>
            </p>
          </section>
          <p className="border-t border-border pt-5 text-[13px]">
            See{" "}
            <Link href="/privacy" className="font-medium text-primary underline-offset-2 hover:underline">
              Privacy
            </Link>{" "}
            for how Tulmin handles data. Update your deployment copy before binding corporate customers — we
            are not attorneys.
          </p>
        </article>
      </WorkspaceSurfaceCard>
    </>
  );
}
