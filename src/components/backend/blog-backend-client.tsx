"use client";

import * as React from "react";
import Image from "next/image";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  GitBranch,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast as notify } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BLOG_CATEGORIES,
  type BlogCategory,
  type BlogPost,
} from "@/lib/blog/posts";
import { cn } from "@/lib/utils";

type BlogBackendClientProps = {
  initialPosts: BlogPost[];
};

type BlogEditorPost = BlogPost & {
  status: "draft" | "published";
};

const emptyPost = (): BlogEditorPost => ({
  slug: "",
  title: "",
  description: "",
  category: "Label Management",
  readTime: "5 min read",
  publishedOn: new Date().toISOString().slice(0, 10),
  status: "draft",
  coverImage: "",
  trending: false,
  featured: false,
  keywords: [],
  sections: [
    { heading: "Problem introduction", body: "" },
    { heading: "How Tulmin helps", body: "" },
  ],
  faqs: [{ q: "", a: "" }],
  ctaLabel: "Start Using Tulmin",
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function keywordsToText(keywords: string[]) {
  return keywords.join(", ");
}

function textToKeywords(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function requestLocalBackend<T>(payload?: unknown): Promise<T> {
  const response = await fetch("/api/local-blog", {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Blog backend request failed.");
  return data;
}

function fieldLabel(text: string) {
  return <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{text}</Label>;
}

export function BlogBackendClient({ initialPosts }: BlogBackendClientProps) {
  const [post, setPost] = React.useState<BlogEditorPost>(() => emptyPost());
  const [posts, setPosts] = React.useState<BlogPost[]>(initialPosts);
  const [managedSlugs, setManagedSlugs] = React.useState<Set<string>>(new Set());
  const [keywordText, setKeywordText] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "delete" | "push" | null>(null);
  const [gitOutput, setGitOutput] = React.useState("");

  const selectedIsManaged = managedSlugs.has(post.slug);

  React.useEffect(() => {
    requestLocalBackend<{ posts: BlogPost[]; deletedSlugs: string[] }>()
      .then((data) => {
        setManagedSlugs(new Set(data.posts.map((item) => item.slug)));
      })
      .catch((error) => notify.error(error.message));
  }, []);

  function updatePost(patch: Partial<BlogEditorPost>) {
    setPost((current) => ({ ...current, ...patch }));
  }

  function updateSection(index: number, patch: Partial<BlogEditorPost["sections"][number]>) {
    setPost((current) => ({
      ...current,
      sections: current.sections.map((section, idx) =>
        idx === index ? { ...section, ...patch } : section,
      ),
    }));
  }

  function updateFaq(index: number, patch: Partial<BlogEditorPost["faqs"][number]>) {
    setPost((current) => ({
      ...current,
      faqs: current.faqs.map((faq, idx) => (idx === index ? { ...faq, ...patch } : faq)),
    }));
  }

  function loadPost(nextPost: BlogPost) {
    const editorPost: BlogEditorPost = {
      ...emptyPost(),
      ...nextPost,
      status: nextPost.status ?? "published",
      coverImage: nextPost.coverImage ?? "",
      ctaLabel: nextPost.ctaLabel ?? "Start Using Tulmin",
      sections: nextPost.sections.length ? nextPost.sections : emptyPost().sections,
      faqs: nextPost.faqs.length ? nextPost.faqs : emptyPost().faqs,
    };
    setPost(editorPost);
    setKeywordText(keywordsToText(editorPost.keywords));
    notify.info(managedSlugs.has(editorPost.slug) ? "Loaded editable blog." : "Loaded as a template. Save creates a managed version.");
  }

  async function handleImageUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > 750_000) {
      notify.warning("Use an image under 750KB so GitHub deploys stay fast.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updatePost({ coverImage: String(reader.result || "") });
    reader.onerror = () => notify.error("Image upload failed.");
    reader.readAsDataURL(file);
  }

  async function savePost(status: "draft" | "published" = post.status) {
    const slug = post.slug.trim() || slugify(post.title);
    if (!post.title.trim() || !slug) {
      notify.error("Add a title before saving.");
      return;
    }
    const cleanPost: BlogEditorPost = {
      ...post,
      slug,
      status,
      title: post.title.trim(),
      description: post.description.trim(),
      readTime: post.readTime.trim() || "5 min read",
      ctaLabel: post.ctaLabel?.trim() || "Start Using Tulmin",
      keywords: textToKeywords(keywordText),
      sections: post.sections.filter((section) => section.heading.trim() || section.body.trim()),
      faqs: post.faqs.filter((faq) => faq.q.trim() || faq.a.trim()),
    };
    setBusy("save");
    try {
      const data = await requestLocalBackend<{ posts: BlogPost[] }>({
        action: "save",
        post: cleanPost,
      });
      setPost(cleanPost);
      setPosts((current) => [
        cleanPost,
        ...current.filter((item) => item.slug !== cleanPost.slug),
      ]);
      setManagedSlugs(new Set(data.posts.map((item) => item.slug)));
      notify.success(status === "published" ? "Blog published locally." : "Draft saved locally.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deletePost(slug = post.slug) {
    if (!slug) {
      notify.error("Select a blog to delete.");
      return;
    }
    setBusy("delete");
    try {
      const data = await requestLocalBackend<{ posts: BlogPost[]; deletedSlugs: string[] }>({
        action: "delete",
        slug,
      });
      setPosts((current) => current.filter((item) => item.slug !== slug));
      setManagedSlugs(new Set(data.posts.map((item) => item.slug)));
      if (post.slug === slug) {
        setPost(emptyPost());
        setKeywordText("");
      }
      notify.success("Blog removed locally.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  async function pushChanges() {
    setBusy("push");
    setGitOutput("");
    try {
      const data = await requestLocalBackend<{ output: string }>({
        action: "push",
        message: "Update blog content",
      });
      setGitOutput(data.output || "GitHub is already up to date.");
      notify.success("Blog changes pushed to GitHub. Vercel will deploy from main.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Git push failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/92 shadow-elevate-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-5 sm:p-7">
            <Badge className="rounded-full bg-primary/12 px-3 py-1 text-primary hover:bg-primary/12">
              Local content backend
            </Badge>
            <h1 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Write, publish, delete, then push blog updates to GitHub.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              This page is designed for local use. Save content into the SaaS repo, push it to
              GitHub, and Vercel can deploy the new blog without editing code by hand.
            </p>
          </div>
          <div className="border-t border-border/60 bg-background/45 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="grid gap-3 text-sm">
              {[
                ["Draft", "Write safely before publishing."],
                ["Publish", "Show the article on the public blog."],
                ["Push", "Commit JSON changes and push main."],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3 rounded-xl border border-border/55 bg-card/80 p-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-5 rounded-2xl border border-border/60 bg-card/92 p-4 shadow-elevate-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Editor</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Article structure</h2>
            </div>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => {
              setPost(emptyPost());
              setKeywordText("");
            }}>
              <Plus className="size-4" />
              New blog
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              {fieldLabel("Heading title")}
              <Input
                value={post.title}
                onChange={(event) => {
                  const title = event.target.value;
                  updatePost({
                    title,
                    slug: post.slug ? post.slug : slugify(title),
                  });
                }}
                placeholder="Example: Best workflow for Meesho label dispatch"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              {fieldLabel("URL slug")}
              <Input
                value={post.slug}
                onChange={(event) => updatePost({ slug: slugify(event.target.value) })}
                placeholder="best-workflow-for-meesho-label-dispatch"
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            {fieldLabel("Sub title / short description")}
            <textarea
              value={post.description}
              onChange={(event) => updatePost({ description: event.target.value })}
              rows={3}
              placeholder="Write the blog summary shown on cards and SEO descriptions."
              className="min-h-[96px] w-full rounded-xl border border-input/85 bg-background/70 px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              {fieldLabel("Category")}
              <select
                value={post.category}
                onChange={(event) => updatePost({ category: event.target.value as BlogCategory })}
                className="h-11 w-full rounded-xl border border-input/85 bg-background/70 px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                {BLOG_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              {fieldLabel("Read time")}
              <Input value={post.readTime} onChange={(event) => updatePost({ readTime: event.target.value })} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              {fieldLabel("Date")}
              <Input type="date" value={post.publishedOn} onChange={(event) => updatePost({ publishedOn: event.target.value })} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              {fieldLabel("Status")}
              <select
                value={post.status}
                onChange={(event) => updatePost({ status: event.target.value as BlogEditorPost["status"] })}
                className="h-11 w-full rounded-xl border border-input/85 bg-background/70 px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              {fieldLabel("Keywords")}
              <Input
                value={keywordText}
                onChange={(event) => setKeywordText(event.target.value)}
                placeholder="meesho label cropper, sku filter, dispatch workflow"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-background/55 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Checkbox checked={post.featured} onCheckedChange={(checked) => updatePost({ featured: Boolean(checked) })} />
                Featured
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Checkbox checked={post.trending} onCheckedChange={(checked) => updatePost({ trending: Boolean(checked) })} />
                Trending
              </label>
            </div>
          </div>

          <section className="rounded-2xl border border-border/60 bg-background/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Picture upload</p>
                <p className="mt-1 text-xs text-muted-foreground">Use a landscape image under 750KB for clean deploys.</p>
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-xs transition hover:bg-muted">
                <ImagePlus className="size-4" />
                Upload cover
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => handleImageUpload(event.target.files?.[0])} />
              </label>
            </div>
            {post.coverImage ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
                <Image
                  src={post.coverImage}
                  alt=""
                  width={1280}
                  height={560}
                  unoptimized
                  className="aspect-[16/7] w-full object-cover"
                />
              </div>
            ) : (
              <div className="mt-4 flex aspect-[16/7] items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/50 text-sm font-medium text-muted-foreground">
                Cover preview
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Headings and body</p>
                <p className="mt-1 text-xs text-muted-foreground">Add every article section with a clear sub heading and body text.</p>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => updatePost({ sections: [...post.sections, { heading: "", body: "" }] })}>
                <Plus className="size-4" />
                Section
              </Button>
            </div>
            {post.sections.map((section, index) => (
              <div key={index} className="rounded-2xl border border-border/60 bg-background/45 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Section {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={() => updatePost({ sections: post.sections.filter((_, idx) => idx !== index) })}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Remove section</span>
                  </Button>
                </div>
                <div className="space-y-3">
                  <Input value={section.heading} onChange={(event) => updateSection(index, { heading: event.target.value })} placeholder="Sub heading" className="h-11 rounded-xl" />
                  <textarea
                    value={section.body}
                    onChange={(event) => updateSection(index, { body: event.target.value })}
                    rows={4}
                    placeholder="Write this section body..."
                    className="min-h-[120px] w-full rounded-xl border border-input/85 bg-background/70 px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  />
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">FAQ</p>
                <p className="mt-1 text-xs text-muted-foreground">Questions appear on the article page and in SEO schema.</p>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => updatePost({ faqs: [...post.faqs, { q: "", a: "" }] })}>
                <Plus className="size-4" />
                FAQ
              </Button>
            </div>
            {post.faqs.map((faq, index) => (
              <div key={index} className="grid gap-3 rounded-2xl border border-border/60 bg-background/45 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px]">
                <Input value={faq.q} onChange={(event) => updateFaq(index, { q: event.target.value })} placeholder="Question" className="h-11 rounded-xl" />
                <Input value={faq.a} onChange={(event) => updateFaq(index, { a: event.target.value })} placeholder="Answer" className="h-11 rounded-xl" />
                <Button type="button" variant="ghost" size="icon" className="size-9 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => updatePost({ faqs: post.faqs.filter((_, idx) => idx !== index) })}>
                  <Trash2 className="size-4" />
                  <span className="sr-only">Remove FAQ</span>
                </Button>
              </div>
            ))}
          </section>

          <div className="space-y-2">
            {fieldLabel("CTA button label")}
            <Input value={post.ctaLabel ?? ""} onChange={(event) => updatePost({ ctaLabel: event.target.value })} className="h-11 rounded-xl" />
          </div>
        </section>

        <aside className="space-y-5">
          <section className="sticky top-[72px] space-y-4 rounded-2xl border border-border/60 bg-card/92 p-4 shadow-elevate-sm sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Publish controls</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Local to live flow</h2>
            </div>
            <div className="grid gap-2">
              <Button type="button" className="h-11 rounded-xl" disabled={busy !== null} onClick={() => savePost("draft")}>
                {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save draft
              </Button>
              <Button type="button" variant="secondary" className="h-11 rounded-xl" disabled={busy !== null} onClick={() => savePost("published")}>
                {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Publish locally
              </Button>
              <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={busy !== null || !post.slug} onClick={() => deletePost()}>
                {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete selected blog
              </Button>
              <Button type="button" variant="outline" className="h-11 rounded-xl border-primary/35 text-primary hover:bg-primary/10" disabled={busy !== null} onClick={pushChanges}>
                {busy === "push" ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />}
                Push GitHub to Vercel
              </Button>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/55 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Selected blog</p>
              <p className="mt-1 break-words">{post.slug || "No slug yet"}</p>
              <p className="mt-2">
                {selectedIsManaged ? "Editable managed post." : "Static/template post until saved."}
              </p>
            </div>
            {gitOutput ? (
              <pre className="max-h-40 overflow-auto rounded-xl bg-foreground/95 p-3 text-xs text-background">
                {gitOutput}
              </pre>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card/92 p-4 shadow-elevate-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Existing blogs</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{posts.length} articles</h2>
              </div>
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {posts.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => loadPost(item)}
                  className={cn(
                    "w-full rounded-xl border border-border/60 bg-background/55 p-3 text-left transition hover:border-primary/35 hover:bg-primary/5",
                    post.slug === item.slug && "border-primary/45 bg-primary/8",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{item.title}</p>
                    {managedSlugs.has(item.slug) ? (
                      <Badge variant="outline" className="shrink-0 rounded-full text-[10px]">Managed</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{item.publishedOn}</span>
                    <span>{item.category}</span>
                    {item.status === "draft" ? <span>Draft</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-primary/25 bg-primary/[0.07] p-4 ring-1 ring-primary/10">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                For best SaaS polish, write a focused title, one practical subtitle, 5-7 useful
                sections, 2-4 FAQs, then publish locally before pushing.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
