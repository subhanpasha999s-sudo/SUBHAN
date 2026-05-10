import type { Metadata } from "next";
import Link from "next/link";

import { getSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Meesho, Flipkart, and Amazon seller label workflow guide",
  description:
    "A practical marketplace dispatch guide for Meesho, Flipkart, and Amazon sellers managing shipping label PDFs, SKU mapping, courier sorting, and daily label print work.",
  alternates: {
    canonical: `${getSiteUrl()}/blog/marketplace-label-workflow-meesho-flipkart-amazon`,
  },
  keywords: [
    "meesho label print",
    "flipkart seller label workflow",
    "amazon seller label workflow",
    "marketplace shipping labels",
    "ecommerce dispatch labels",
    "sku wise label export",
  ],
};

export default function MarketplaceLabelWorkflowPage() {
  return (
    <article className="space-y-5">
      <header className="rounded-xl border border-border bg-card p-6 shadow-layer-card sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Marketplace dispatch workflow
        </p>
        <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Meesho, Flipkart, and Amazon label workflow for ecommerce sellers
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Marketplace sellers on Meesho, Flipkart, and Amazon often face the same operational
          problem: too many shipping label PDFs, too many SKUs, and too much manual label sorting
          before dispatch.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-6 shadow-layer-card">
        <h2 className="text-xl font-semibold text-foreground">Why label workflow matters</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A fast ecommerce dispatch process depends on clean label print batches. Sellers need to
          identify the right SKU, separate courier partner work, avoid duplicate prints, and export
          only the labels that packing teams need. Tulmin currently focuses on Meesho label PDFs,
          while these same workflow ideas also help Flipkart and Amazon sellers plan better label
          operations.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: "Meesho",
            body: "Use Tulmin for Meesho label crop, label print, SKU-wise export, courier filtering, and quantity sorting.",
          },
          {
            title: "Flipkart",
            body: "Flipkart sellers can use the same dispatch thinking: group labels by SKU, courier, and packing priority before printing.",
          },
          {
            title: "Amazon",
            body: "Amazon sellers managing bulk label downloads also benefit from SKU mapping, print batches, and daily export discipline.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border bg-card p-5 shadow-layer-card">
            <h3 className="font-semibold text-foreground">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-layer-card">
        <h2 className="text-xl font-semibold text-foreground">Use Tulmin for Meesho first</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          If your current pain is Meesho label crop online, Meesho label crop PDF, Meesho label
          print, or quick label export for dispatch, the live Tulmin label workspace is the best
          place to start.
        </p>
        <Link
          href="/export-labels"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/92"
        >
          Open Tulmin label workspace
        </Link>
      </section>
    </article>
  );
}
