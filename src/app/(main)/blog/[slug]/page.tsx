import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  BLOG_GLOBAL_CTA,
  blogCanonical,
  blogUrlPath,
  getAllBlogPosts,
  getBlogPostBySlug,
  getRelatedBlogPosts,
} from "@/lib/blog/posts";
import { getSiteUrl } from "@/lib/seo/site-url";

export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getBlogPostBySlug(params.slug);
  if (!post) {
    return {
      title: "Blog article not found",
      robots: { index: false, follow: false },
    };
  }

  const canonical = blogCanonical(post.slug);
  return {
    title: `${post.title} | Tulmin Blog`,
    description: post.description,
    alternates: { canonical },
    keywords: post.keywords,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: canonical,
      siteName: "Tulmin",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default function BlogDetailPage({ params }: { params: { slug: string } }) {
  const post = getBlogPostBySlug(params.slug);
  if (!post) notFound();

  const related = getRelatedBlogPosts(post.slug, post.category, 3);
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedOn,
    author: { "@type": "Organization", name: "Tulmin" },
    publisher: { "@type": "Organization", name: "Tulmin" },
    mainEntityOfPage: blogCanonical(post.slug),
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <article className="space-y-6 sm:space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <nav className="sticky top-[56px] z-20 rounded-xl border border-border/60 bg-background/90 px-3 py-2 backdrop-blur-md sm:top-[60px]">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <Link href="/export-labels" className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">
            Home
          </Link>
          <Link href="/blog" className="rounded-md px-2 py-1 text-foreground">
            Blog
          </Link>
          <Link href="/login" className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">
            Login
          </Link>
          <Link href="/export-labels" className="ml-auto rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground">
            Start Free
          </Link>
        </div>
      </nav>

      <header className="rounded-2xl border border-border/60 bg-card/90 p-6 shadow-elevate-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{post.category}</p>
        <h1 className="mt-3 max-w-4xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {post.title}
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          {post.description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{post.readTime}</span>
          <span aria-hidden>•</span>
          <time dateTime={post.publishedOn}>{post.publishedOn}</time>
          {post.trending ? (
            <>
              <span aria-hidden>•</span>
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-orange-600 dark:text-orange-300">
                Trending
              </span>
            </>
          ) : null}
        </div>
      </header>

      <section className="space-y-4 rounded-2xl border border-border/60 bg-card/90 p-6 shadow-elevate-sm sm:p-8">
        {post.sections.map((section, idx) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {idx + 1}. {section.heading}
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/90 p-6 shadow-elevate-sm sm:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">FAQ</h2>
        <div className="mt-4 space-y-3">
          {post.faqs.map((faq) => (
            <details key={faq.q} className="rounded-xl border border-border/70 bg-background/60 p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
                {faq.q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-primary/35 bg-primary/[0.08] p-6 ring-1 ring-primary/20 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Conclusion</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{BLOG_GLOBAL_CTA}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/export-labels"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            {post.ctaLabel ?? "Start Using Tulmin"}
          </Link>
          <Link
            href="/blog"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-semibold text-foreground"
          >
            Explore Blogs
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/90 p-6 shadow-elevate-sm sm:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Related articles</h2>
          <Link href="/blog" className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <Link
              key={item.slug}
              href={blogUrlPath(item.slug)}
              className="rounded-xl border border-border/65 bg-background/60 p-4 transition hover:border-primary/35"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{item.category}</p>
              <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{item.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card/90 p-5 text-sm text-muted-foreground">
        Internal links:{" "}
        <Link href="/export-labels" className="font-medium text-primary hover:underline">
          Meesho label tool
        </Link>{" "}
        ·{" "}
        <Link href="/mapping" className="font-medium text-primary hover:underline">
          SKU mapping
        </Link>{" "}
        ·{" "}
        <Link href={`${getSiteUrl()}/blog`} className="font-medium text-primary hover:underline">
          all Tulmin blogs
        </Link>
      </section>
    </article>
  );
}
