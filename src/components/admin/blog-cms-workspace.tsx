"use client";

import * as React from "react";
import {
  Bold,
  Edit3,
  Eye,
  FileText,
  ImagePlus,
  Italic,
  Loader2,
  LogOut,
  Plus,
  Save,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast as notify } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BLOG_CATEGORIES, type BlogCategory } from "@/lib/blog/posts";
import type { BlogCmsPost } from "@/lib/admin/blog-cms";
import { cn } from "@/lib/utils";

type AdminUser = {
  email: string;
  role: "super_admin" | "editor";
};

type BlogForm = Partial<BlogCmsPost> & {
  keywordsText: string;
};

class AdminRequestError extends Error {
  setupRequired: boolean;

  constructor(message: string, setupRequired = false) {
    super(message);
    this.name = "AdminRequestError";
    this.setupRequired = setupRequired;
  }
}

const emptyForm = (): BlogForm => ({
  title: "",
  slug: "",
  description: "",
  category: "Label Management",
  readTime: "5 min read",
  status: "draft",
  featuredImage: "",
  metaTitle: "",
  metaDescription: "",
  keywordsText: "",
  richContent: "",
  featured: false,
  trending: false,
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formFromPost(post: BlogCmsPost): BlogForm {
  return {
    ...post,
    keywordsText: post.keywords.join(", "),
    richContent: post.richContent || post.sections.map((section) => section.body).join("\n\n"),
  };
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    setupRequired?: boolean;
  };
  if (!response.ok) {
    throw new AdminRequestError(data.error || "Admin request failed.", Boolean(data.setupRequired));
  }
  return data;
}

function renderPreview(content: string) {
  const lines = content.split(/\r?\n/);
  return lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={index} className="mt-5 text-lg font-semibold text-slate-100">
          {trimmed.slice(3)}
        </h3>
      );
    }
    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={index} className="mt-6 text-xl font-semibold text-white">
          {trimmed.slice(2)}
        </h2>
      );
    }
    if (/^[-*]\s+/.test(trimmed)) {
      return (
        <p key={index} className="pl-4 text-sm leading-7 text-slate-300 before:mr-2 before:content-['•']">
          {trimmed.replace(/^[-*]\s+/, "")}
        </p>
      );
    }
    return (
      <p key={index} className="text-sm leading-7 text-slate-300">
        {trimmed}
      </p>
    );
  });
}

export function BlogCmsWorkspace() {
  const [authState, setAuthState] = React.useState<"checking" | "ready" | "blocked" | "setup">("checking");
  const [admin, setAdmin] = React.useState<AdminUser | null>(null);
  const [setupError, setSetupError] = React.useState("");
  const [posts, setPosts] = React.useState<BlogCmsPost[]>([]);
  const [form, setForm] = React.useState<BlogForm>(() => emptyForm());
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "draft" | "published">("all");
  const [busy, setBusy] = React.useState<"save" | "publish" | "delete" | "logout" | null>(null);
  const [preview, setPreview] = React.useState(false);

  const selectedSlug = form.slug?.trim() ?? "";
  const filteredPosts = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesStatus = statusFilter === "all" || post.status === statusFilter;
      const matchesQuery =
        !term ||
        post.title.toLowerCase().includes(term) ||
        post.slug.toLowerCase().includes(term) ||
        post.description.toLowerCase().includes(term);
      return matchesStatus && matchesQuery;
    });
  }, [posts, query, statusFilter]);

  const loadBlogs = React.useCallback(async () => {
    try {
      const data = await adminRequest<{ admin: AdminUser; posts: BlogCmsPost[] }>("/api/admin/blogs");
      setAdmin(data.admin);
      setPosts(data.posts);
      setAuthState("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin access required.";
      if (error instanceof AdminRequestError && error.setupRequired) {
        setSetupError(message);
        setAuthState("setup");
      } else {
        setAuthState("blocked");
      }
      notify.error(message);
    }
  }, []);

  React.useEffect(() => {
    void loadBlogs();
  }, [loadBlogs]);

  function patchForm(patch: Partial<BlogForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function createNew() {
    setForm(emptyForm());
    setPreview(false);
  }

  function loadPost(post: BlogCmsPost) {
    setForm(formFromPost(post));
    setPreview(false);
  }

  function insertMarkup(before: string, after = "") {
    const current = form.richContent ?? "";
    patchForm({ richContent: `${current}${current ? "\n" : ""}${before}${after}` });
  }

  async function save(status: "draft" | "published") {
    const post = {
      ...form,
      slug: form.slug?.trim() || slugify(form.title ?? ""),
      status,
    };
    setBusy(status === "published" ? "publish" : "save");
    try {
      const data = await adminRequest<{ post: BlogCmsPost }>("/api/admin/blogs", {
        method: "POST",
        body: JSON.stringify({ post }),
      });
      if (!data.post) throw new Error("Blog save did not return a post.");
      setPosts((current) => [data.post, ...current.filter((item) => item.slug !== data.post.slug)]);
      setForm(formFromPost(data.post));
      notify.success(status === "published" ? "Blog published to frontend." : "Draft saved.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not save blog.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelected() {
    const slug = form.slug?.trim();
    if (!slug) {
      notify.error("Select a blog first.");
      return;
    }
    if (!window.confirm(`Delete ${slug}? This removes it from the admin CMS.`)) return;
    setBusy("delete");
    try {
      await adminRequest("/api/admin/blogs", {
        method: "DELETE",
        body: JSON.stringify({ slug }),
      });
      setPosts((current) => current.filter((post) => post.slug !== slug));
      createNew();
      notify.success("Blog deleted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not delete blog.");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    setBusy("logout");
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
      window.location.href = "/admin/login";
    } finally {
      setBusy(null);
    }
  }

  if (authState === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070b12] text-white">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-4">
          <Loader2 className="size-5 animate-spin text-sky-200" />
          <span className="text-sm font-medium">Verifying admin access...</span>
        </div>
      </main>
    );
  }

  if (authState === "blocked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070b12] px-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center">
          <FileText className="mx-auto size-10 text-sky-200" />
          <h1 className="mt-4 text-2xl font-semibold">Blog admin only</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Sign in with an allowlisted Tulmin admin email to manage drafts and published blogs.
          </p>
          <a
            href="/admin/login"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-sky-400 text-sm font-semibold text-slate-950"
          >
            Go to Admin Login
          </a>
        </section>
      </main>
    );
  }

  if (authState === "setup") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070b12] px-4 text-white">
        <section className="w-full max-w-xl rounded-2xl border border-amber-300/20 bg-white/[0.06] p-6 shadow-[0_24px_80px_-42px_rgba(245,158,11,0.45)]">
          <FileText className="size-10 text-amber-200" />
          <h1 className="mt-4 text-2xl font-semibold">Blog database setup required</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Admin login worked, but the backend still needs one Supabase setup
            step before it can load, save, or publish blogs.
          </p>
          <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
            <p className="font-semibold text-amber-100">Required setup</p>
            <code className="mt-2 block break-words text-xs text-slate-300">
              Run supabase/migrations/006_blog_cms.sql and set SUPABASE_SERVICE_ROLE_KEY in deployment env.
            </code>
          </div>
          {setupError ? (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs leading-5 text-red-100">
              {setupError}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="button" className="h-11 rounded-xl" onClick={() => window.location.reload()}>
              Refresh after migration
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
              onClick={() => void logout()}
            >
              Logout
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070b12] text-slate-100">
      <header className="border-b border-white/10 bg-[#0b111d] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200/75">
              Tulmin Admin
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Blog CMS</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-sky-400/12 px-3 py-1 text-sky-100 hover:bg-sky-400/12">
              {admin?.role} · {admin?.email}
            </Badge>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
              onClick={() => void logout()}
              disabled={busy === "logout"}
            >
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <Button type="button" className="h-11 w-full rounded-xl" onClick={createNew}>
              <Plus className="size-4" />
              Create blog
            </Button>
            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search blogs"
                  className="h-10 rounded-xl border-white/10 bg-black/20 pl-9 text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["all", "draft", "published"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "h-9 rounded-lg text-xs font-semibold capitalize ring-1 transition",
                      statusFilter === status
                        ? "bg-sky-400 text-slate-950 ring-sky-300"
                        : "bg-white/[0.04] text-slate-300 ring-white/10 hover:bg-white/[0.08]",
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055]">
            <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">
              Blog list table
            </div>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#101827] text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((post) => (
                    <tr
                      key={post.slug}
                      className={cn(
                        "cursor-pointer border-t border-white/10 hover:bg-white/[0.06]",
                        selectedSlug === post.slug && "bg-sky-400/10",
                      )}
                      onClick={() => loadPost(post)}
                    >
                      <td className="px-4 py-3">
                        <p className="line-clamp-1 font-medium text-white">{post.title}</p>
                        <p className="line-clamp-1 text-xs text-slate-500">{post.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-1 text-[11px] font-semibold",
                            post.status === "published"
                              ? "bg-emerald-400/15 text-emerald-200"
                              : "bg-amber-400/15 text-amber-200",
                          )}
                        >
                          {post.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!filteredPosts.length ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-10 text-center text-sm text-slate-500">
                        No blogs found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </aside>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-lg font-semibold">Editor</h2>
              <p className="text-xs text-slate-500">Drafts stay private. Published blogs sync to `/blog`.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
                onClick={() => setPreview((value) => !value)}
              >
                {preview ? <Edit3 className="size-4" /> : <Eye className="size-4" />}
                {preview ? "Edit" : "Preview"}
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => void save("draft")} disabled={Boolean(busy)}>
                {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save draft
              </Button>
              <Button type="button" className="rounded-xl bg-emerald-500 hover:bg-emerald-400" onClick={() => void save("published")} disabled={Boolean(busy)}>
                {busy === "publish" ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                Publish
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl"
                onClick={() => void deleteSelected()}
                disabled={Boolean(busy) || admin?.role !== "super_admin"}
              >
                {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete
              </Button>
            </div>
          </div>

          {preview ? (
            <article className="min-h-[680px] rounded-2xl border border-white/10 bg-black/20 p-5">
              {form.featuredImage ? (
                <div
                  className="mb-5 aspect-[16/7] rounded-xl bg-cover bg-center ring-1 ring-white/10"
                  style={{ backgroundImage: `url(${form.featuredImage})` }}
                />
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">{form.category}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{form.title || "Untitled blog"}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{form.description}</p>
              <div className="mt-6 space-y-2">{renderPreview(form.richContent ?? "")}</div>
            </article>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <Label className="text-slate-300">Title</Label>
                    <Input
                      value={form.title ?? ""}
                      onChange={(event) => patchForm({ title: event.target.value, slug: form.slug || slugify(event.target.value) })}
                      className="h-11 rounded-xl border-white/10 bg-black/20 text-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <Label className="text-slate-300">Slug</Label>
                    <Input
                      value={form.slug ?? ""}
                      onChange={(event) => patchForm({ slug: slugify(event.target.value) })}
                      className="h-11 rounded-xl border-white/10 bg-black/20 text-white"
                    />
                  </label>
                </div>

                <label className="space-y-2 block">
                  <Label className="text-slate-300">Description</Label>
                  <textarea
                    value={form.description ?? ""}
                    onChange={(event) => patchForm({ description: event.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none ring-sky-400/30 placeholder:text-slate-600 focus:ring-2"
                  />
                </label>

                <div className="rounded-xl border border-white/10 bg-black/20">
                  <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-2">
                    <Button type="button" size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={() => insertMarkup("**Bold text**")}>
                      <Bold className="size-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={() => insertMarkup("_Italic text_")}>
                      <Italic className="size-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={() => insertMarkup("## Section heading\n\nWrite the section body here.")}>
                      Heading
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={() => insertMarkup("- Bullet point")}>
                      List
                    </Button>
                  </div>
                  <textarea
                    value={form.richContent ?? ""}
                    onChange={(event) => patchForm({ richContent: event.target.value })}
                    rows={18}
                    placeholder="Write the blog body. Use headings, bullets, links, and paragraphs."
                    className="min-h-[420px] w-full resize-y bg-transparent px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-slate-600"
                  />
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <h3 className="text-sm font-semibold text-white">Publishing</h3>
                  <div className="mt-4 grid gap-3">
                    <label className="space-y-2">
                      <Label className="text-slate-300">Category</Label>
                      <select
                        value={form.category ?? "Label Management"}
                        onChange={(event) => patchForm({ category: event.target.value as BlogCategory })}
                        className="h-11 w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 text-sm text-white outline-none focus:ring-2 focus:ring-sky-400/30"
                      >
                        {BLOG_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <Label className="text-slate-300">Read time</Label>
                      <Input
                        value={form.readTime ?? ""}
                        onChange={(event) => patchForm({ readTime: event.target.value })}
                        className="h-11 rounded-xl border-white/10 bg-black/20 text-white"
                      />
                    </label>
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                      <Checkbox checked={Boolean(form.featured)} onCheckedChange={(value) => patchForm({ featured: Boolean(value) })} />
                      <Label className="text-sm text-slate-300">Featured article</Label>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                      <Checkbox checked={Boolean(form.trending)} onCheckedChange={(value) => patchForm({ trending: Boolean(value) })} />
                      <Label className="text-sm text-slate-300">Trending badge</Label>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <h3 className="text-sm font-semibold text-white">SEO</h3>
                  <div className="mt-4 space-y-3">
                    <label className="space-y-2 block">
                      <Label className="text-slate-300">Meta title</Label>
                      <Input
                        value={form.metaTitle ?? ""}
                        onChange={(event) => patchForm({ metaTitle: event.target.value })}
                        className="h-11 rounded-xl border-white/10 bg-black/20 text-white"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <Label className="text-slate-300">Meta description</Label>
                      <textarea
                        value={form.metaDescription ?? ""}
                        onChange={(event) => patchForm({ metaDescription: event.target.value })}
                        rows={3}
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-sky-400/30"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <Label className="text-slate-300">Keywords</Label>
                      <textarea
                        value={form.keywordsText}
                        onChange={(event) => patchForm({ keywordsText: event.target.value })}
                        rows={3}
                        placeholder="meesho labels, sku mapping"
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-sky-400/30"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <ImagePlus className="size-4 text-sky-200" />
                    Featured image
                  </h3>
                  <Input
                    value={form.featuredImage ?? ""}
                    onChange={(event) => patchForm({ featuredImage: event.target.value })}
                    placeholder="https://..."
                    className="mt-4 h-11 rounded-xl border-white/10 bg-black/20 text-white"
                  />
                  {form.featuredImage ? (
                    <div
                      className="mt-3 aspect-video rounded-xl bg-cover bg-center ring-1 ring-white/10"
                      style={{ backgroundImage: `url(${form.featuredImage})` }}
                    />
                  ) : null}
                </div>
              </aside>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
