import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  BLOG_GLOBAL_CTA,
  blogCanonical,
  blogUrlPath,
  getAllBlogPosts,
} from "@/lib/blog/posts";
import { getLiveBlogPostBySlug, getLiveRelatedBlogPosts } from "@/lib/blog/live-posts";
import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getAllBlogPosts().map((post) => ({ slug: post.slug }));
}

type BlogSlugParams = { slug: string } | Promise<{ slug: string }>;

async function readSlug(params: BlogSlugParams) {
  const resolved = await params;
  return decodeURIComponent(resolved.slug ?? "").trim();
}

export async function generateMetadata({ params }: { params: BlogSlugParams }): Promise<Metadata> {
  const slug = await readSlug(params);
  const post = await getLiveBlogPostBySlug(slug);
  if (!post) {
    return {
      title: "Blog article not found",
      robots: { index: false, follow: false },
    };
  }

  const canonical = blogCanonical(post.slug);
  return {
    title: post.seoTitle || post.metaTitle || `${post.title} | Tulmin Blog`,
    description: post.metaDescription || post.description,
    alternates: { canonical },
    keywords: post.keywords,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: canonical,
      siteName: "Tulmin",
      images: post.ogImage || post.featuredImage || post.coverImage ? [{ url: post.ogImage || post.featuredImage || post.coverImage || "" }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: post.ogImage || post.featuredImage || post.coverImage ? [post.ogImage || post.featuredImage || post.coverImage || ""] : undefined,
    },
  };
}

function isSafeContentUrl(value: string) {
  return value.startsWith("/") || value.startsWith("https://") || value.startsWith("http://") || value.startsWith("data:image/");
}

function renderInlineLinks(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text))) {
    const [raw, label, href] = match;
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (isSafeContentUrl(href)) {
      parts.push(
        <Link key={`${keyPrefix}-${match.index}`} href={href} className="font-medium text-primary hover:underline">
          {label}
        </Link>,
      );
    } else {
      parts.push(raw);
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderSectionBody(body: string, keyPrefix: string) {
  const lines = body.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList(index: number) {
    if (!listItems.length || !listType) return;
    const Tag = listType;
    nodes.push(
      <Tag key={`${keyPrefix}-list-${index}`} className="my-3 space-y-1 pl-5 text-[15px] leading-relaxed text-muted-foreground">
        {listItems.map((item, itemIndex) => (
          <li key={`${keyPrefix}-list-${index}-${itemIndex}`}>
            {renderInlineLinks(item, `${keyPrefix}-li-${index}-${itemIndex}`)}
          </li>
        ))}
      </Tag>,
    );
    listItems = [];
    listType = null;
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(index);
      return;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (image && isSafeContentUrl(image[2])) {
      flushList(index);
      nodes.push(
        <Image
          key={`${keyPrefix}-image-${index}`}
          src={image[2]}
          alt={image[1]}
          width={1200}
          height={675}
          unoptimized
          className="my-4 aspect-[16/9] w-full rounded-2xl border border-border/60 object-cover"
        />,
      );
      return;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType && listType !== nextType) flushList(index);
      listType = nextType;
      listItems.push((unordered ?? ordered)?.[1] ?? trimmed);
      return;
    }

    flushList(index);
    nodes.push(
      <p key={`${keyPrefix}-p-${index}`} className="text-[15px] leading-relaxed text-muted-foreground">
        {renderInlineLinks(trimmed, `${keyPrefix}-p-${index}`)}
      </p>,
    );
  });

  flushList(lines.length);
  return nodes;
}

export default async function BlogDetailPage({ params }: { params: BlogSlugParams }) {
  const slug = await readSlug(params);
  const post = await getLiveBlogPostBySlug(slug);
  if (!post) notFound();

  const related = await getLiveRelatedBlogPosts(post.slug, post.category, 3);
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedOn,
    author: { "@type": "Organization", name: "Tulmin" },
    publisher: { "@type": "Organization", name: "Tulmin" },
    mainEntityOfPage: blogCanonical(post.slug),
    image: post.ogImage || post.featuredImage || post.coverImage || undefined,
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
        {post.featuredImage || post.coverImage ? (
          <div
            className="mb-6 aspect-[16/7] rounded-2xl bg-cover bg-center ring-1 ring-border/60"
            style={{ backgroundImage: `url(${post.featuredImage || post.coverImage})` }}
            aria-hidden
          />
        ) : null}
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
            <div className="space-y-2">{renderSectionBody(section.body, `${post.slug}-${idx}`)}</div>
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
