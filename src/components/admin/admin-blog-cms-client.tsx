"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Eye,
  ImagePlus,
  Loader2,
  LogOut,
  Plus,
  Save,
  Search,
  Send,
  Sparkles,
  BarChart3,
  LockKeyhole,
  Trash2,
} from "lucide-react";
import { toast as notify } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import {
  BLOG_CATEGORIES,
  type BlogCategory,
  type BlogPost,
} from "@/lib/blog/posts";
import { cn } from "@/lib/utils";

type AdminBlogCmsClientProps = {
  publicPosts: BlogPost[];
};

type BlogEditorPost = BlogPost & {
  status: "draft" | "published";
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  scheduledFor?: string;
  tagSlugs?: string[];
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
  metaTitle: "",
  metaDescription: "",
  ogImage: "",
  scheduledFor: "",
  tagSlugs: [],
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
  const supabase = getSupabaseBrowser();
  let token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!token) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (token) break;
    }
  }
  const response = await fetch("/api/admin/blogs", {
    method: payload ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Blog backend request failed.");
  return data;
}

function fieldLabel(text: string) {
  return <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{text}</Label>;
}

export function AdminBlogCmsClient({ publicPosts }: AdminBlogCmsClientProps) {
  const supabase = React.useMemo(() => getSupabaseBrowser(), []);
  const [authState, setAuthState] = React.useState<"checking" | "ready" | "blocked">("checking");
  const [adminRole, setAdminRole] = React.useState<"super_admin" | "editor" | null>(null);
  const [post, setPost] = React.useState<BlogEditorPost>(() => emptyPost());
  const [posts, setPosts] = React.useState<BlogPost[]>(publicPosts);
  const [managedSlugs, setManagedSlugs] = React.useState<Set<string>>(new Set());
  const [keywordText, setKeywordText] = React.useState("");
  const [tagText, setTagText] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "delete" | null>(null);
  const [auditCount, setAuditCount] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "draft" | "published">("all");
  const [autoSaveState, setAutoSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastAutoSaveKey = React.useRef("");

  const selectedIsManaged = managedSlugs.has(post.slug);
  const filteredPosts = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return posts.filter((item) => {
      const status = item.status === "draft" ? "draft" : "published";
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      const matchesQuery =
        !term ||
        item.title.toLowerCase().includes(term) ||
        item.slug.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term);
      return matchesStatus && matchesQuery;
    });
  }, [posts, query, statusFilter]);

  React.useEffect(() => {
    requestLocalBackend<{
      admin: { role: "super_admin" | "editor"; email: string };
      posts: BlogPost[];
      deletedSlugs: string[];
      auditLog: unknown[];
    }>()
      .then((data) => {
        setAuthState("ready");
        setAdminRole(data.admin.role);
        setPosts((current) => [
          ...data.posts,
          ...current.filter((item) => !data.posts.some((managed) => managed.slug === item.slug)),
        ]);
        setManagedSlugs(new Set(data.posts.map((item) => item.slug)));
        setAuditCount(data.auditLog.length);
      })
      .catch((error) => {
        setAuthState("blocked");
        notify.error(error.message);
      });
  }, []);

  function updatePost(patch: Partial<BlogEditorPost>) {
    setPost((current) => ({ ...current, ...patch }));
  }

  const buildCleanPost = React.useCallback((status: "draft" | "published" = post.status): BlogEditorPost => {
    const slug = post.slug.trim() || slugify(post.title);
    return {
      ...post,
      slug,
      status,
      title: post.title.trim(),
      description: post.description.trim(),
      readTime: post.readTime.trim() || "5 min read",
      ctaLabel: post.ctaLabel?.trim() || "Start Using Tulmin",
      seoTitle: post.metaTitle?.trim() || post.title.trim(),
      featuredImage: post.coverImage,
      metaTitle: post.metaTitle?.trim() || post.title.trim(),
      metaDescription: post.metaDescription?.trim() || post.description.trim(),
      ogImage: post.ogImage?.trim() || post.coverImage,
      tagSlugs: textToKeywords(tagText),
      keywords: textToKeywords(keywordText),
      sections: post.sections.filter((section) => section.heading.trim() || section.body.trim()),
      faqs: post.faqs.filter((faq) => faq.q.trim() || faq.a.trim()),
    };
  }, [keywordText, post, tagText]);

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
      metaTitle: (nextPost as BlogEditorPost).metaTitle ?? nextPost.title,
      metaDescription: (nextPost as BlogEditorPost).metaDescription ?? nextPost.description,
      ogImage: (nextPost as BlogEditorPost).ogImage ?? nextPost.coverImage ?? "",
      scheduledFor: (nextPost as BlogEditorPost).scheduledFor ?? "",
      tagSlugs: (nextPost as BlogEditorPost).tagSlugs ?? [],
      sections: nextPost.sections.length ? nextPost.sections : emptyPost().sections,
      faqs: nextPost.faqs.length ? nextPost.faqs : emptyPost().faqs,
    };
    setPost(editorPost);
    setKeywordText(keywordsToText(editorPost.keywords));
    setTagText(keywordsToText(editorPost.tagSlugs ?? []));
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
    const cleanPost = buildCleanPost(status);
    if (!cleanPost.title || !cleanPost.slug) {
      notify.error("Add a title before saving.");
      return;
    }
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
      lastAutoSaveKey.current = JSON.stringify(cleanPost);
      setAutoSaveState("saved");
      notify.success(status === "published" ? "Blog published in Admin CMS." : "Draft saved in Admin CMS.");
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
        action: adminRole === "super_admin" ? "delete" : "unpublish",
        slug,
      });
      setPosts((current) =>
        adminRole === "super_admin"
          ? current.filter((item) => item.slug !== slug)
          : current.map((item) => (item.slug === slug ? { ...item, status: "draft" } : item)),
      );
      setManagedSlugs(new Set(data.posts.map((item) => item.slug)));
      if (post.slug === slug) {
        setPost(emptyPost());
        setKeywordText("");
      }
      notify.success(adminRole === "super_admin" ? "Blog deleted." : "Blog unpublished.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
      await supabase?.auth.signOut();
      notify.success("Admin logged out.");
      window.location.href = "/admin/login";
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Logout failed.");
    }
  }

  React.useEffect(() => {
    if (authState !== "ready" || busy || post.status !== "draft") return;
    const cleanPost = buildCleanPost("draft");
    const canAutoSave =
      cleanPost.title.length >= 4 &&
      cleanPost.description.length >= 20 &&
      cleanPost.sections.some((section) => section.heading || section.body);
    if (!canAutoSave) {
      setAutoSaveState("idle");
      return;
    }

    const key = JSON.stringify(cleanPost);
    if (key === lastAutoSaveKey.current) return;

    const timer = window.setTimeout(async () => {
      setAutoSaveState("saving");
      try {
        const data = await requestLocalBackend<{ posts: BlogPost[] }>({
          action: "save",
          post: cleanPost,
        });
        setPosts((current) => [
          cleanPost,
          ...current.filter((item) => item.slug !== cleanPost.slug),
        ]);
        setManagedSlugs(new Set(data.posts.map((item) => item.slug)));
        lastAutoSaveKey.current = key;
        setAutoSaveState("saved");
      } catch {
        setAutoSaveState("error");
      }
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [authState, buildCleanPost, busy, post.status]);

  if (authState === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050914] text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4">
          <Loader2 className="size-5 animate-spin text-blue-200" />
          <span className="text-sm font-medium">Verifying admin session...</span>
        </div>
      </main>
    );
  }

  if (authState === "blocked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050914] px-4 text-white">
        <section className="max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center shadow-[0_24px_80px_-40px_rgba(37,99,235,0.8)]">
          <LockKeyhole className="mx-auto size-10 text-blue-200" />
          <h1 className="mt-4 text-2xl font-semibold">Admin access required</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This CMS is separate from the Tulmin customer SaaS. Only allowlisted
            super admins and editors can manage blogs.
          </p>
          <a
            href="/admin/login"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Go to Admin Login
          </a>
          <Link href="/blog" className="mt-4 block text-xs font-semibold text-slate-500 hover:text-slate-300">
            Return to public blogs
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="dark min-h-screen space-y-6 bg-[#050914] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] shadow-[0_24px_80px_-44px_rgba(37,99,235,0.8)] backdrop-blur-xl">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-5 sm:p-7">
            <Badge className="rounded-full bg-blue-400/12 px-3 py-1 text-blue-200 hover:bg-blue-400/12">
              Tulmin Admin CMS · {adminRole}
            </Badge>
            <h1 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Internal blog publishing workspace.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-[15px]">
              Separate from the customer SaaS. Create drafts, manage SEO, schedule
              publishing, review analytics, and send approved content live instantly.
            </p>
          </div>
          <div className="border-t border-white/10 bg-black/20 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <Button
              type="button"
              variant="outline"
              className="mb-4 h-10 w-full rounded-xl border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
              onClick={() => void logout()}
            >
              <LogOut className="size-4" />
              Logout admin
            </Button>
            <div className="grid gap-3 text-sm">
              {[
                ["Read-only users", "Normal SaaS users can only read blogs."],
                ["RBAC", "super_admin and editor roles gate every API call."],
                ["Audit", `${auditCount} recorded CMS events.`],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-blue-200" />
                  <div>
                    <p className="font-semibold text-white">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["Published", posts.filter((item) => item.status !== "draft").length, "Live SEO pages"],
          ["Drafts", posts.filter((item) => item.status === "draft").length, "Private editorial work"],
          ["Analytics", auditCount, "Audit and content events"],
        ].map(([label, value, helper]) => (
          <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <BarChart3 className="size-4 text-blue-200" />
            </div>
            <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{helper}</p>
          </div>
        ))}
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

          <section className="grid gap-4 rounded-2xl border border-border/60 bg-background/45 p-4 md:grid-cols-2">
            <div className="space-y-2">
              {fieldLabel("SEO meta title")}
              <Input
                value={post.metaTitle ?? ""}
                onChange={(event) => updatePost({ metaTitle: event.target.value })}
                placeholder="SEO title shown in Google"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              {fieldLabel("OG image URL / uploaded image")}
              <Input
                value={post.ogImage ?? ""}
                onChange={(event) => updatePost({ ogImage: event.target.value })}
                placeholder="Used for social sharing"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              {fieldLabel("SEO meta description")}
              <textarea
                value={post.metaDescription ?? ""}
                onChange={(event) => updatePost({ metaDescription: event.target.value })}
                rows={2}
                placeholder="150-160 character search result description."
                className="min-h-[78px] w-full rounded-xl border border-input/85 bg-background/70 px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </div>
          </section>

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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              {fieldLabel("Schedule publishing")}
              <Input
                type="datetime-local"
                value={post.scheduledFor ?? ""}
                onChange={(event) => updatePost({ scheduledFor: event.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              {fieldLabel("Tags")}
              <Input
                value={tagText}
                onChange={(event) => setTagText(event.target.value)}
                placeholder="meesho, labels, warehouse"
                className="h-11 rounded-xl"
              />
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
                <p className="mt-1 text-xs text-muted-foreground">Add headings and body text. Body supports paragraphs, lists, links, and image markdown.</p>
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
                    placeholder={"Write this section body...\n- Add bullet points\n[Link text](https://example.com)\n![Image alt](https://example.com/image.jpg)"}
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
          <section className="space-y-4 rounded-2xl border border-border/60 bg-card/92 p-4 shadow-elevate-sm sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Publish controls</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Local to live flow</h2>
            </div>
            <div className="grid gap-2">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-200">
                Publish, edit, unpublish, and delete actions update the live website immediately.
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/55 px-3 py-2 text-xs">
                <span className="font-semibold text-foreground">Autosave</span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 font-semibold",
                  autoSaveState === "saving" && "bg-blue-500/10 text-blue-600 dark:text-blue-300",
                  autoSaveState === "saved" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
                  autoSaveState === "error" && "bg-red-500/10 text-red-600 dark:text-red-300",
                  autoSaveState === "idle" && "bg-muted text-muted-foreground",
                )}>
                  {autoSaveState === "saving" ? "Saving..." : autoSaveState === "saved" ? "Saved" : autoSaveState === "error" ? "Needs manual save" : "Ready"}
                </span>
              </div>
              <Button type="button" className="min-h-11 rounded-xl py-2" disabled={busy !== null} onClick={() => savePost("draft")}>
                {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save draft
              </Button>
              <Button type="button" variant="secondary" className="min-h-11 rounded-xl py-2" disabled={busy !== null} onClick={() => savePost("published")}>
                {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Publish locally
              </Button>
              <Link
                href={post.slug ? `/blog/${post.slug}` : "/blog"}
                target="_blank"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-center text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                <Eye className="size-4" />
                Preview public page
              </Link>
              <Button type="button" variant="outline" className="min-h-11 rounded-xl py-2" disabled={busy !== null || !post.slug} onClick={() => deletePost()}>
                {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete selected blog
              </Button>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/55 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Selected blog</p>
              <p className="mt-1 break-words">{post.slug || "No slug yet"}</p>
              <p className="mt-2">
                {selectedIsManaged ? "Editable managed post." : "Static/template post until saved."}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card/92 p-4 shadow-elevate-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Existing blogs</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{posts.length} articles</h2>
              </div>
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <div className="mb-4 grid gap-2">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, slug, category"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="h-10 rounded-xl border border-input/85 bg-background/70 px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <option value="all">All statuses</option>
                <option value="published">Published only</option>
                <option value="draft">Drafts only</option>
              </select>
            </div>
            <div className="space-y-2">
              {filteredPosts.map((item) => (
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
              {filteredPosts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/80 p-4 text-center text-sm text-muted-foreground">
                  No blogs match this search.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-primary/25 bg-primary/[0.07] p-4 ring-1 ring-primary/10">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                For best SaaS polish, write a focused title, one practical subtitle, 5-7 useful
                sections, 2-4 FAQs, then publish to update the live website instantly.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card/92 p-4 shadow-elevate-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Preview</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Reader snapshot</h2>
              </div>
              <Badge variant={post.status === "published" ? "default" : "outline"} className="rounded-full">
                {post.status === "published" ? "Published" : "Draft"}
              </Badge>
            </div>
            <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{post.category}</p>
              <h3 className="mt-2 text-lg font-semibold leading-tight text-foreground">
                {post.title || "Untitled blog"}
              </h3>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {post.description || "Add a short meta description to preview the article card."}
              </p>
              {post.sections[0]?.heading ? (
                <p className="mt-4 text-sm font-semibold text-foreground">{post.sections[0].heading}</p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
