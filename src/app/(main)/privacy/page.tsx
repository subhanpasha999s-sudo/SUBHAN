import type { Metadata } from "next";
import Link from "next/link";

import { ModulePageHeader } from "@/components/layout/module-page-header";
import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";

const SUPPORT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Label handles your PDF and SKU data.",
};

export default function PrivacyPage() {
  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Label PDF", href: "/export-labels" },
          { label: "Privacy" },
        ]}
        title="Privacy policy"
        description="Written for merchants using Label—we keep this practical and jargon-light."
      />
      <WorkspaceSurfaceCard padding="p-6 sm:p-8">
        <article className="space-y-5 text-[15px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">What Label does</h2>
            <p>
              Label helps you work with shipment label PDFs and optional SKU mappings. PDF processing
              and mapping preview run in your browser; we do not operate a courier or marketplace,
              and we are not endorsed by marketplace brands you may integrate with manually.
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
            <h2 className="text-base font-semibold text-foreground">What we intentionally avoid</h2>
            <p>
              We don’t sell SKU lists from your workspace. Authentication uses industry-standard email
              verification through our auth provider—we don’t operate our own password store for OTP
              flows.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Retention & deletion</h2>
            <p>
              You can disconnect by signing out locally; authenticated data may persist until removed
              or until you contact us below for deletion, subject to short backup horizons at the
              database provider.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Questions</h2>
            <p>
              Not legal advice—you should align this product with contracts you owe your customers
              and partners. Reach us{" "}
              {SUPPORT ? (
                <>
                  at{" "}
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
                  by adding <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">NEXT_PUBLIC_CONTACT_EMAIL</code>{" "}
                  in your deployment environment.
                </>
              )}
            </p>
          </section>
          <p className="border-t border-border pt-5 text-[13px]">
            Short version: PDF work is primarily client-side; cloud sync requires sign-in and is
            partitioned per account. Review the{" "}
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
