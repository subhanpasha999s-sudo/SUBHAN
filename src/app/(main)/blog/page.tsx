import type { Metadata } from "next";
import Link from "next/link";

import { getSiteUrl } from "@/lib/seo/site-url";

const posts = [
  {
    href: "/blog/meesho-label-crop-online",
    title: "Meesho label crop online: PDF, A4, 4x6, print, and invoice workflow",
    description:
      "A practical guide for Meesho sellers who need a label crop tool, label cutter, label cropper, or print-ready PDF workflow.",
  },
  {
    href: "/blog/marketplace-label-workflow-meesho-flipkart-amazon",
    title: "Meesho, Flipkart, and Amazon label workflow for ecommerce dispatch teams",
    description:
      "How marketplace sellers can organize shipping labels, SKU mapping, courier sorting, and daily dispatch without manual PDF chaos.",
  },
] as const;

export const metadata: Metadata = {
  title: "Tulmin Blog · Meesho label crop, print, and marketplace dispatch guides",
  description:
    "Read Tulmin guides for Meesho label crop, Meesho label print, label size, PDF export, and marketplace dispatch workflows for Meesho, Flipkart, and Amazon sellers.",
  alternates: { canonical: `${getSiteUrl()}/blog` },
};

export default function BlogIndexPage() {
  return (
    <main className="space-y-5">
      <header className="rounded-xl border border-border bg-card p-6 shadow-layer-card sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Tulmin seller guides
        </p>
        <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Meesho label crop, label print, and ecommerce dispatch guides
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Learn how to crop Meesho labels, prepare A4 or 4x6 print workflows, organize SKU-wise
          dispatch, and compare marketplace label operations across Meesho, Flipkart, and Amazon.
        </p>
      </header>

      <section className="grid gap-4">
        {posts.map((post) => (
          <Link
            key={post.href}
            href={post.href}
            className="rounded-xl border border-border bg-card p-5 shadow-layer-card transition hover:border-primary/40 hover:bg-muted/20"
          >
            <h2 className="text-lg font-semibold text-foreground">{post.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{post.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
