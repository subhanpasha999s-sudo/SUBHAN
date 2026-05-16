import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Clock3,
  FileText,
  Layers2,
  PackageCheck,
  Sparkles,
  Truck,
} from "lucide-react";

import {
  BLOG_GLOBAL_CTA,
  blogCanonical,
  blogUrlPath,
  getAllBlogPosts,
} from "@/lib/blog/posts";
import { getLiveBlogPostBySlug, getLiveRelatedBlogPosts } from "@/lib/blog/live-posts";
import { getSiteUrl } from "@/lib/seo/site-url";
import { cn } from "@/lib/utils";

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

function sectionAnchor(heading: string, index: number) {
  const slug = heading
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `section-${index + 1}`;
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
      <Tag key={`${keyPrefix}-list-${index}`} className="my-5 space-y-2 pl-5 text-[15px] leading-7 text-muted-foreground marker:text-primary/80">
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
          className="my-6 aspect-[16/9] w-full rounded-2xl border border-border/60 object-cover shadow-elevate-xs"
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
      <p key={`${keyPrefix}-p-${index}`} className="text-[15px] leading-8 text-muted-foreground sm:text-base">
        {renderInlineLinks(trimmed, `${keyPrefix}-p-${index}`)}
      </p>,
    );
  });

  flushList(lines.length);
  return nodes;
}

function ArticleVisual({
  src,
  title,
  className,
}: {
  src?: string;
  title: string;
  className?: string;
}) {
  if (src) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/55 bg-muted shadow-elevate-sm",
          "aspect-[16/10]",
          className
        )}
      >
        <Image
          src={src}
          alt={title}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 48vw"
          className="object-cover"
          priority
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/55 bg-card shadow-elevate-sm",
        "aspect-[16/10]",
        className
      )}
      aria-hidden
    >
      <div className="flex h-full min-h-[320px] flex-col bg-[linear-gradient(135deg,rgb(95_134_255/0.16),rgb(14_165_233/0.07)_48%,rgb(16_185_129/0.11))] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/45 bg-card/88 p-3 text-foreground shadow-elevate-xs dark:border-white/10 dark:bg-slate-950/70 dark:text-white">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Layers2 className="size-4" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-sm font-semibold">Tulmin workflow</p>
              <p className="text-[11px] text-muted-foreground dark:text-slate-300">Filter · verify · export</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-100">
            Ready
          </span>
        </div>
        <div className="mt-4 grid flex-1 gap-3 sm:grid-cols-[1fr_.72fr]">
          <div className="rounded-2xl border border-border/45 bg-card/80 p-4 text-foreground shadow-elevate-xs dark:border-white/10 dark:bg-slate-950/72 dark:text-white">
            <div className="grid gap-2">
              {[
                ["SKU filter", "24 SKUs"],
                ["Courier", "3 partners"],
                ["QTY check", "128 labels"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-muted/45 px-3 py-2 dark:bg-white/[0.06]">
                  <span className="text-xs text-muted-foreground dark:text-slate-300">{label}</span>
                  <span className="text-sm font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-primary/45 bg-background/45 p-3 dark:bg-transparent">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Dispatch batch</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">Print only the right labels</p>
            </div>
          </div>
          <div className="grid gap-3">
            {[
              [Truck, "Courier split"],
              [PackageCheck, "SKU bundles"],
              [FileText, "Clean PDF"],
            ].map(([Icon, label]) => {
              const VisualIcon = Icon as typeof Truck;
              return (
                <div key={label as string} className="flex items-center gap-3 rounded-2xl border border-border/45 bg-card/80 p-4 text-foreground shadow-elevate-xs dark:border-white/10 dark:bg-slate-950/72 dark:text-white">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-white/[0.08]">
                    <VisualIcon className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="text-sm font-semibold">{label as string}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function BlogDetailPage({ params }: { params: BlogSlugParams }) {
  const slug = await readSlug(params);
  const post = await getLiveBlogPostBySlug(slug);
  if (!post) notFound();

  const related = await getLiveRelatedBlogPosts(post.slug, post.category, 3);
  const mediaUrl = post.featuredImage || post.coverImage || post.ogImage || "";
  const sections = post.sections.map((section, index) => ({
    ...section,
    index,
    anchor: sectionAnchor(section.heading, index),
  }));
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
    <article className="space-y-8 sm:space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <nav className="sticky top-[56px] z-20 rounded-2xl border border-border/55 bg-background/88 p-2 shadow-elevate-xs backdrop-blur-xl sm:top-[60px]">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {[
            ["Home", "/"],
            ["Blog", "/blog"],
            ["Labels", "/export-labels"],
            ["SKU Mapping", "/mapping"],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="rounded-xl px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/export-labels"
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-primary-foreground shadow-[0_12px_28px_-18px_rgb(95_134_255/0.95)]"
          >
            Start Free
            <ArrowRight className="size-3.5" strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </nav>

      <header className="overflow-hidden rounded-[1.75rem] border border-border/55 bg-card/88 shadow-elevate-sm ring-1 ring-white/[0.04]">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,0.96fr)_minmax(390px,0.84fr)]">
          <div className="flex min-h-[360px] flex-col justify-between p-5 sm:p-7 lg:p-8 xl:min-h-[430px] xl:p-10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary ring-1 ring-primary/20">
                  <Sparkles className="size-3.5" strokeWidth={1.8} aria-hidden />
                  {post.category}
                </span>
                {post.trending ? (
                  <span className="rounded-full bg-orange-500/14 px-3 py-1.5 text-xs font-bold text-orange-600 ring-1 ring-orange-500/20 dark:text-orange-200">
                    Trending
                  </span>
                ) : null}
              </div>
              <h1 className="mt-5 max-w-4xl text-balance text-[clamp(2.05rem,7vw,3rem)] font-semibold leading-[1.04] tracking-tight text-foreground sm:text-[clamp(2.45rem,4.4vw,3.4rem)] xl:text-[clamp(3rem,4vw,4.35rem)]">
                {post.title}
              </h1>
              <p className="mt-4 max-w-3xl text-[15px] leading-7 text-muted-foreground sm:text-lg sm:leading-8 xl:text-xl">
                {post.description}
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full bg-muted/45 px-3 py-1.5">
                <Clock3 className="size-4 text-primary" strokeWidth={1.8} aria-hidden />
                {post.readTime}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted/45 px-3 py-1.5">
                <BookOpenText className="size-4 text-primary" strokeWidth={1.8} aria-hidden />
                <time dateTime={post.publishedOn}>{post.publishedOn}</time>
              </span>
            </div>
          </div>
          <div className="p-4 pt-0 xl:p-5 xl:pl-0">
            <ArticleVisual src={mediaUrl} title={post.title} className="xl:my-auto" />
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:sticky lg:top-32 lg:block">
          <div className="rounded-2xl border border-border/55 bg-card/88 p-4 shadow-elevate-xs">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <BookOpenText className="size-4" strokeWidth={1.8} aria-hidden />
              In this article
            </p>
            <div className="mt-4 grid gap-1.5">
              {sections.map((section) => (
                <a
                  key={section.anchor}
                  href={`#${section.anchor}`}
                  className="rounded-xl px-3 py-2 text-sm font-medium leading-snug text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {section.index + 1}. {section.heading}
                </a>
              ))}
            </div>
            <div className="mt-5 rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20">
              <p className="text-sm font-semibold text-foreground">Need this workflow now?</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Open Tulmin and turn your next PDF into dispatch-ready batches.
              </p>
              <Link
                href="/export-labels"
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground"
              >
                Try Labels
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-primary/25 bg-primary/[0.07] p-5 ring-1 ring-primary/15 sm:p-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <CheckCircle2 className="size-5" strokeWidth={1.9} aria-hidden />
              Key takeaway
            </p>
            <p className="mt-3 text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl lg:text-2xl">
              Better label flow is not cosmetic. It reduces wrong dispatch, reprints, and the daily drag of manually sorting bulk PDFs.
            </p>
          </section>

          {sections.map((section) => (
            <section
              key={section.anchor}
              id={section.anchor}
              className="scroll-mt-28 rounded-2xl border border-border/55 bg-card/88 p-4 shadow-elevate-xs sm:p-6 lg:p-7"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/20 sm:size-10 sm:rounded-2xl">
                  {section.index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl lg:text-[1.7rem]">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {renderSectionBody(section.body, `${post.slug}-${section.index}`)}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-[1.75rem] border border-border/55 bg-card/88 shadow-elevate-sm">
        <div className="grid gap-0 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="bg-primary/10 p-6 ring-1 ring-primary/15 sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              Quick answers before you change the workflow.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Short answers for operators who want the practical impact, not fluff.
            </p>
          </div>
          <div className="grid gap-3 p-5 sm:p-6">
            {post.faqs.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-2xl border border-border/65 bg-background/55 p-4 open:bg-muted/20"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-foreground">
                  {faq.q}
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-primary/35 bg-slate-950 text-white shadow-[0_30px_90px_-55px_rgb(15_23_42/0.9)] dark:bg-white dark:text-slate-950">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-sky-200 dark:text-primary">
              <PackageCheck className="size-5" strokeWidth={1.8} aria-hidden />
              Conclusion
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Turn blog advice into a cleaner dispatch batch.
            </h2>
            <p className="mt-3 max-w-4xl text-base leading-7 text-slate-300 dark:text-slate-600">
              {BLOG_GLOBAL_CTA}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link
              href="/export-labels"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-slate-950 shadow-[0_18px_48px_-28px_rgb(255_255_255/0.9)] dark:bg-slate-950 dark:text-white"
            >
              {post.ctaLabel ?? "Start Using Tulmin"}
              <ArrowRight className="ml-2 size-4" strokeWidth={1.8} aria-hidden />
            </Link>
            <Link
              href="/blog"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-white dark:border-slate-300 dark:text-slate-950"
            >
              Explore Blogs
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-border/55 bg-card/88 p-5 shadow-elevate-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Next reads</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Related articles</h2>
          </div>
          <Link href="/blog" className="shrink-0 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:border-primary/45">
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {related.map((item) => {
            const itemImage = item.coverImage || item.featuredImage || item.ogImage || "";
            return (
              <Link
                key={item.slug}
                href={blogUrlPath(item.slug)}
                className="group overflow-hidden rounded-2xl border border-border/65 bg-background/55 transition hover:border-primary/40 hover:shadow-elevate-sm"
              >
                {itemImage ? (
                  <div className="relative aspect-[16/9] bg-muted">
                    <Image
                      src={itemImage}
                      alt={item.title}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-[linear-gradient(135deg,rgb(95_134_255/0.18),rgb(16_185_129/0.10))]">
                    <FileText className="size-10 text-primary" strokeWidth={1.7} aria-hidden />
                  </div>
                )}
                <div className="p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{item.category}</p>
                  <h3 className="mt-2 text-base font-semibold leading-snug text-foreground group-hover:text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border/55 bg-card/80 p-5 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Internal links:</span>{" "}
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
