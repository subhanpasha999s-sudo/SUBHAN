import type { Metadata } from "next";
import Link from "next/link";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";
import { getPublicContactEmail } from "@/lib/brand/tulmin";
import { getSiteUrl } from "@/lib/seo/site-url";

const SUPPORT = getPublicContactEmail();

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Tulmin handles your PDF and SKU data.",
  alternates: { canonical: `${getSiteUrl()}/privacy` },
};

export default function PrivacyPage() {
  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Labels", href: "/export-labels" },
          { label: "Privacy" },
        ]}
        title="Privacy policy"
        description="How Tulmin treats your data — practical and jargon-light."
      />
      <WorkspaceSurfaceCard padding="p-6 sm:p-8">
        <article className="space-y-5 text-[15px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">What Tulmin does</h2>
            <p>
              Tulmin helps you work with shipment label PDFs and optional SKU mappings. PDF processing
              and mapping preview run in your browser; Tulmin is not a courier or marketplace,
              and is not endorsed by marketplace brands you may integrate with manually.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Data locations</h2>
            <p>
              <strong>Optional sign-in:</strong> If you create an account, SKU map data may be
              stored in our database (hosted with Supabase) under your identity so it syncs across
              devices. Row-level policies are designed so each user only reads and writes their own
              records.
            </p>
            <p>
              <strong>Without sign-in:</strong> Draft SKU maps and uploads may remain on your device
              (browser storage); clearing site data removes them unless you exported a backup
              separately.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">What we avoid</h2>
            <p>
              Tulmin does not sell SKU lists from your workspace. Authentication uses industry-standard email
              verification through our auth provider — Tulmin does not operate its own password store for OTP
              flows.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Retention &amp; deletion</h2>
            <p>
              You can disconnect by signing out locally; authenticated data may persist until removed
              or until you contact us at{" "}
              <a
                href={`mailto:${SUPPORT}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {SUPPORT}
              </a>{" "}
              for deletion, subject to short backup horizons at the database provider.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Questions</h2>
            <p>
              Not legal advice — align Tulmin with contracts you owe your customers and partners. Reach
              Tulmin at{" "}
              <a
                href={`mailto:${SUPPORT}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {SUPPORT}
              </a>
              .
            </p>
          </section>
          <p className="border-t border-border pt-5 text-[13px]">
            Summary: PDF work is primarily client-side; cloud sync requires sign-in and is partitioned per
            account. See the{" "}
            <Link href="/terms" className="font-medium text-primary underline-offset-2 hover:underline">
              Terms
            </Link>{" "}
            next.
          </p>
        </article>
      </WorkspaceSurfaceCard>
    </>
  );
}
