"use client";

import * as React from "react";
import Link from "next/link";

import {
  BLOG_CATEGORIES,
  type BlogPost,
  blogUrlPath,
} from "@/lib/blog/posts";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function matchesSearch(post: BlogPost, q: string) {
  if (!q) return true;
  const query = q.toLowerCase();
  return (
    post.title.toLowerCase().includes(query) ||
    post.description.toLowerCase().includes(query) ||
    post.keywords.some((k) => k.toLowerCase().includes(query))
  );
}

export function BlogIndexClient({ posts }: { posts: BlogPost[] }) {
  const featured = React.useMemo(
    () => posts.find((post) => post.featured) ?? posts[0],
    [posts],
  );
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("All");
  const [page, setPage] = React.useState(1);
  const pageSize = 9;

  const visible = React.useMemo(
    () =>
      posts.filter((post) => {
        const categoryOk = category === "All" || post.category === category;
        return categoryOk && matchesSearch(post, query.trim());
      }),
    [posts, category, query]
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const paged = React.useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page]
  );

  React.useEffect(() => {
    setPage(1);
  }, [query, category]);

  return (
    <main className="space-y-6 sm:space-y-8">
      <header className="overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-6 shadow-elevate-sm ring-1 ring-white/[0.04] sm:p-8">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Tulmin Blog System
          </p>
          <h1 className="max-w-3xl text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Meesho Seller Guides, Label Tools & Growth Tips
          </h1>
          <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Learn how Meesho sellers filter labels by SKU, QTY, and courier partner, reduce wrong
            dispatch mistakes, and save hours with faster warehouse workflows.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/mapping"
              className={buttonVariants({
                size: "lg",
                className: "min-h-11 rounded-xl px-5 font-semibold",
              })}
            >
              Start SKU Mapping
            </Link>
            <a
              href="#blog-grid"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "min-h-11 rounded-xl px-5 font-semibold",
              })}
            >
              Explore Blogs
            </a>
          </div>
        </div>
      </header>

      <section className="sticky top-[56px] z-20 rounded-2xl border border-border/60 bg-card/90 p-4 shadow-elevate-sm backdrop-blur-md sm:top-[60px] sm:p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Navigation</p>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "Home", href: "/" },
            { label: "Features", href: "/#workflow" },
            { label: "Trust", href: "/#trust" },
            { label: "Blog", href: "/blog" },
            { label: "Contact", href: "mailto:info@tulmin.com" },
            { label: "Login", href: "/login" },
            { label: "Start Free", href: "/mapping" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={buttonVariants({
                variant: "ghost",
                className: "h-9 rounded-lg px-3 text-xs font-semibold",
              })}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/90 p-5 shadow-elevate-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Featured article</p>
        {featured ? (
          <Link
            href={blogUrlPath(featured.slug)}
            className="mt-3 block rounded-xl border border-border/65 bg-background/70 p-5 transition hover:border-primary/45 hover:shadow-elevate-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {featured.category}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{featured.readTime}</span>
              {featured.trending ? (
                <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-orange-600 dark:text-orange-300">
                  Trending
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {featured.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              {featured.description}
            </p>
          </Link>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-border/60 bg-card/90 p-5 shadow-elevate-sm sm:p-6">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Meesho blog topics..."
          className="h-11 rounded-xl"
          aria-label="Search blogs"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("All")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
              category === "All"
                ? "bg-primary/12 text-primary ring-primary/35"
                : "bg-muted/45 text-muted-foreground ring-border hover:bg-muted/70 hover:text-foreground"
            )}
          >
            All
          </button>
          {BLOG_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                category === cat
                  ? "bg-primary/12 text-primary ring-primary/35"
                  : "bg-muted/45 text-muted-foreground ring-border hover:bg-muted/70 hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      <section id="blog-grid" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Latest guides</h2>
          <p className="text-xs font-medium text-muted-foreground">
            {visible.length} articles · page {page}/{totalPages}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paged.map((post) => (
            <Link
              key={post.slug}
              href={blogUrlPath(post.slug)}
              className="group rounded-2xl border border-border/60 bg-card/90 p-4 shadow-elevate-xs transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevate-sm"
            >
              {post.coverImage ? (
                <div
                  className="mb-3 h-28 rounded-xl bg-cover bg-center ring-1 ring-border/60"
                  style={{ backgroundImage: `url(${post.coverImage})` }}
                  aria-hidden
                />
              ) : (
                <div className="mb-3 h-28 rounded-xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent ring-1 ring-border/60" />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {post.category}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">{post.readTime}</span>
                {post.trending ? (
                  <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-300">
                    Trending
                  </span>
                ) : null}
              </div>
              <h3 className="mt-3 text-base font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary">
                {post.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{post.description}</p>
            </Link>
          ))}
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg px-3 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg px-3 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
