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
        description="Clear service terms focused on practical customer use."
      />
      <WorkspaceSurfaceCard padding="p-6 sm:p-8">
        <article className="space-y-5 text-[15px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">The service</h2>
            <p>
              Tulmin is a label workflow tool. Features may evolve or be updated over time.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Your usage</h2>
            <p>
              You are responsible for complying with courier, marketplace, and legal obligations tied
              to the labels or data you process. You must not misuse hosted APIs or disrupt other users.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Data ownership and control</h2>
            <p>
              Your business data remains your data. You can choose to keep it in cloud sync or delete
              it from Tulmin settings at any time.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Data selling</h2>
            <p>
              Tulmin does not sell customer workspace data.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Contact</h2>
            <p>
              For support, email{" "}
              <a
                href={`mailto:${SUPPORT}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {SUPPORT}
              </a>
            </p>
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Common questions</h2>
            <details className="group rounded-lg border border-border bg-muted/15 p-3">
              <summary className="cursor-pointer list-none font-medium text-foreground">
                Who controls business data?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                You do. Your business data remains yours.
              </p>
            </details>
            <details className="group rounded-lg border border-border bg-muted/15 p-3">
              <summary className="cursor-pointer list-none font-medium text-foreground">
                Can I keep or delete cloud data?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Yes. You can keep cloud sync on, delete cloud data, or request account deletion from settings.
              </p>
            </details>
            <details className="group rounded-lg border border-border bg-muted/15 p-3">
              <summary className="cursor-pointer list-none font-medium text-foreground">
                Does Tulmin sell customer data?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                No. Tulmin does not sell customer workspace data.
              </p>
            </details>
          </section>
          <p className="border-t border-border pt-5 text-[13px]">
            See{" "}
            <Link href="/privacy" className="font-medium text-primary underline-offset-2 hover:underline">
              Privacy
            </Link>{" "}
            for how Tulmin handles data and deletion control.
          </p>
        </article>
      </WorkspaceSurfaceCard>
    </>
  );
}
