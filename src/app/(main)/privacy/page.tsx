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
        description="Simple privacy terms focused on customer control."
      />
      <WorkspaceSurfaceCard padding="p-6 sm:p-8">
        <article className="space-y-5 text-[15px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">What Tulmin processes</h2>
            <p>
              Tulmin helps you process shipment label PDFs and optional SKU mappings. Most PDF
              parsing and filtering run in your browser.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Where data stays</h2>
            <p>
              <strong>Without sign-in:</strong> Data stays on your device (browser storage).
            </p>
            <p>
              <strong>With sign-in:</strong> You can choose to store SKU mapping data in cloud sync
              so it is available across devices.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Your control</h2>
            <p>
              You decide whether to keep data in the cloud or delete it. You can clear local data,
              remove cloud mapping data, or request account deletion from Tulmin settings.
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
              For help with privacy or deletion requests, email{" "}
              <a
                href={`mailto:${SUPPORT}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {SUPPORT}
              </a>
              .
            </p>
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Common questions</h2>
            <details className="group rounded-lg border border-border bg-muted/15 p-3">
              <summary className="cursor-pointer list-none font-medium text-foreground">
                Can I keep data only on my device?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Yes. If you do not sign in, Tulmin keeps your working data in browser storage on this device.
              </p>
            </details>
            <details className="group rounded-lg border border-border bg-muted/15 p-3">
              <summary className="cursor-pointer list-none font-medium text-foreground">
                Can I delete cloud data anytime?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Yes. In settings, you can delete cloud mapping data or request account deletion.
              </p>
            </details>
            <details className="group rounded-lg border border-border bg-muted/15 p-3">
              <summary className="cursor-pointer list-none font-medium text-foreground">
                Do you sell customer data?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                No. Tulmin does not sell customer workspace data.
              </p>
            </details>
          </section>
          <p className="border-t border-border pt-5 text-[13px]">
            Summary: customer data control is yours. Keep it local, sync to cloud, or delete it.
            See the{" "}
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
