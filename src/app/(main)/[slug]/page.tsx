import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import {
  SEO_LANDING_PAGES,
  getSeoLandingPage,
  seoLandingCanonical,
} from "@/lib/seo/landing-pages";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SeoPageParams = { slug: string } | Promise<{ slug: string }>;

async function readSlug(params: SeoPageParams) {
  const resolved = await params;
  return decodeURIComponent(resolved.slug ?? "").trim();
}

export function generateStaticParams() {
  return SEO_LANDING_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: SeoPageParams }): Promise<Metadata> {
  const slug = await readSlug(params);
  const page = getSeoLandingPage(slug);
  if (!page) return { title: "Page not found", robots: { index: false, follow: false } };
  const canonical = seoLandingCanonical(page.slug);
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: "Tulmin",
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
    },
  };
}

export default async function SeoLandingPage({ params }: { params: SeoPageParams }) {
  const slug = await readSlug(params);
  const page = getSeoLandingPage(slug);
  if (!page) notFound();

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/90 p-6 shadow-elevate-sm sm:p-8 lg:p-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">{page.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {page.h1}
          </h1>
          <p className="mt-5 text-base leading-8 text-muted-foreground sm:text-lg">
            {page.intro}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/export-labels"
              className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-full px-6")}
            >
              Run Labels Now
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/blog"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 rounded-full px-6")}
            >
              Read Dispatch Guides
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {page.sections.map((section) => (
          <article
            key={section.h2}
            className="rounded-[1.5rem] border border-border/60 bg-card/80 p-5 shadow-elevate-xs"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{section.h2}</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
            <ul className="mt-5 space-y-2">
              {section.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-sm font-medium text-foreground">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {bullet}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-[1.5rem] border border-border/60 bg-card/80 p-5 shadow-elevate-xs">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Frequently asked questions about {page.primaryKeyword}
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {page.faqs.map((faq) => (
            <div key={faq.q} className="rounded-2xl border border-border/55 bg-background/55 p-4">
              <h3 className="font-semibold text-foreground">{faq.q}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
