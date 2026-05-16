"use client";

import * as React from "react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Edit3,
  Eye,
  FileText,
  ImagePlus,
  Italic,
  List,
  Loader2,
  LogOut,
  Plus,
  Save,
  Search,
  Type,
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
import { contentToRichHtml, sanitizeRichHtml } from "@/lib/blog/rich-content";
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

const BLOG_FEATURED_IMAGE_SIZE = "1600 x 1000 px";
const BLOG_FEATURED_IMAGE_RATIO = "16:10";
const FONT_SIZES = ["14px", "16px", "18px", "20px", "24px", "28px"];
const TEXT_COLORS = ["#0f172a", "#335cff", "#047857", "#b45309", "#be123c", "#ffffff"];

type ToolbarState = {
  style: "h1" | "h2" | "h3" | "p";
  size: string;
  color: string;
  bold: boolean;
  italic: boolean;
  list: boolean;
};

const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  style: "p",
  size: "16px",
  color: "",
  bold: false,
  italic: false,
  list: false,
};

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
  return (
    <div
      className="blog-rich-content"
      dangerouslySetInnerHTML={{ __html: contentToRichHtml(content) }}
    />
  );
}

function hexToRgb(value: string) {
  const hex = value.replace("#", "");
  if (hex.length !== 6) return "";
  const parts = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((part) => parseInt(part, 16));
  return `rgb(${parts.join(", ")})`;
}

function colorsMatch(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  return left === right || left === hexToRgb(right).toLowerCase() || hexToRgb(left).toLowerCase() === right;
}

function isEditorHtmlEmpty(html: string) {
  const withoutFillers = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/?(p|div|span)[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return withoutFillers.length === 0;
}

export function BlogCmsWorkspace() {
  const [authState, setAuthState] = React.useState<"checking" | "ready" | "blocked" | "setup">("checking");
  const [admin, setAdmin] = React.useState<AdminUser | null>(null);
  const [setupError, setSetupError] = React.useState("");
  const [posts, setPosts] = React.useState<BlogCmsPost[]>([]);
  const [form, setForm] = React.useState<BlogForm>(() => emptyForm());
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "draft" | "published">("all");
  const [busy, setBusy] = React.useState<"save" | "publish" | "delete" | "logout" | "image" | null>(null);
  const [preview, setPreview] = React.useState(false);
  const [toolbarState, setToolbarState] = React.useState<ToolbarState>(DEFAULT_TOOLBAR_STATE);
  const [editorIsEmpty, setEditorIsEmpty] = React.useState(true);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const editorHtmlRef = React.useRef("");
  const selectionRef = React.useRef<Range | null>(null);

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

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = contentToRichHtml(form.richContent ?? "");
    if (editorHtmlRef.current === nextHtml) return;
    editor.innerHTML = nextHtml;
    editorHtmlRef.current = nextHtml;
    setEditorIsEmpty(isEditorHtmlEmpty(nextHtml));
  }, [form.richContent]);

  function syncEditorContent() {
    const rawHtml = editorRef.current?.innerHTML ?? "";
    const html = isEditorHtmlEmpty(rawHtml) ? "" : sanitizeRichHtml(rawHtml);
    editorHtmlRef.current = html;
    setEditorIsEmpty(!html);
    patchForm({ richContent: html });
  }

  function readCurrentToolbarState(): ToolbarState {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount) return toolbarState;

    let node: Node | null = selection.anchorNode;
    if (!node) return toolbarState;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!(node instanceof HTMLElement) || !editor.contains(node)) return toolbarState;

    const block = node.closest("h1,h2,h3,p,li") as HTMLElement | null;
    const inline = node.closest("[style]") as HTMLElement | null;
    const computed = window.getComputedStyle(node);
    const color = inline?.style.color || computed.color || toolbarState.color;
    const size = inline?.style.fontSize || computed.fontSize || toolbarState.size;
    const tag = block?.tagName.toLowerCase();

    return {
      style: tag === "h1" || tag === "h2" || tag === "h3" ? tag : "p",
      size: FONT_SIZES.includes(size) ? size : toolbarState.size,
      color,
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      list: document.queryCommandState("insertUnorderedList"),
    };
  }

  function updateToolbarState(patch?: Partial<ToolbarState>) {
    setToolbarState((current) => ({ ...current, ...readCurrentToolbarState(), ...patch }));
  }

  function saveEditorSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
      updateToolbarState();
    }
  }

  function restoreEditorSelection() {
    const selection = window.getSelection();
    if (!selection || !selectionRef.current) return;
    selection.removeAllRanges();
    selection.addRange(selectionRef.current);
  }

  function runEditorCommand(command: string, value?: string) {
    editorRef.current?.focus();
    restoreEditorSelection();
    document.execCommand(command, false, value);
    syncEditorContent();
    saveEditorSelection();
    updateToolbarState(
      command === "formatBlock" && (value === "h1" || value === "h2" || value === "h3" || value === "p")
        ? { style: value }
        : undefined
    );
  }

  function applyFontSize(size: string) {
    runEditorCommand("fontSize", "7");
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll("font[size='7']").forEach((node) => {
      const span = document.createElement("span");
      span.setAttribute("style", `font-size: ${size}`);
      span.innerHTML = node.innerHTML;
      node.replaceWith(span);
    });
    syncEditorContent();
    updateToolbarState({ size });
  }

  function insertStarterSection() {
    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<h3>Section heading</h3><p>Write the section body here.</p>'
    );
    syncEditorContent();
    updateToolbarState({ style: "h3" });
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
      setQuery("");
      setStatusFilter("all");
      if (status === "published") {
        createNew();
      } else {
        setForm(formFromPost(data.post));
      }
      notify.success(status === "published" ? "Blog published to frontend." : "Draft saved.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not save blog.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelected(slugOverride?: string) {
    const slug = slugOverride ?? form.slug?.trim();
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
      setQuery("");
      setStatusFilter("all");
      if (selectedSlug === slug) createNew();
      notify.success("Blog deleted.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not delete blog.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadFeaturedImage(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify.error("Choose an image file.");
      return;
    }
    setBusy("image");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("slug", form.slug?.trim() || slugify(form.title ?? "blog"));
      const response = await fetch("/api/admin/blogs/upload", {
        method: "POST",
        body,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        localOnly?: boolean;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Image upload failed.");
      }
      patchForm({ featuredImage: data.url, coverImage: data.url, ogImage: data.url });
      notify.success(
        data.localOnly
          ? "Image uploaded locally. Publish will show it on this app instance."
          : "Image uploaded. Publish the blog to make it live.",
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not upload image.");
    } finally {
      setBusy(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
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
      <main className="flex min-h-screen items-center justify-center bg-[#f5f8fd] px-4 text-slate-950 dark:bg-[#07101f] dark:text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
          <Loader2 className="size-5 animate-spin text-[#335cff]" />
          <span className="text-sm font-medium">Verifying admin access...</span>
        </div>
      </main>
    );
  }

  if (authState === "blocked") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f8fd] px-4 text-slate-950 dark:bg-[#07101f] dark:text-white">
        <section className="w-full max-w-md rounded-[1.75rem] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#335cff]/10 text-[#335cff] ring-1 ring-[#335cff]/20">
            <FileText className="size-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold">Blog admin only</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Sign in with an allowlisted Tulmin admin email to manage drafts and published blogs.
          </p>
          <a
            href="/admin/login"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#335cff] text-sm font-semibold text-white shadow-[0_16px_36px_-22px_rgb(51_92_255/0.9)]"
          >
            Go to Admin Login
          </a>
        </section>
      </main>
    );
  }

  if (authState === "setup") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f8fd] px-4 text-slate-950 dark:bg-[#07101f] dark:text-white">
        <section className="w-full max-w-xl rounded-[1.75rem] border border-amber-300/35 bg-white p-6 shadow-sm dark:border-amber-300/20 dark:bg-white/[0.06] dark:shadow-[0_24px_80px_-42px_rgba(245,158,11,0.45)]">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-200">
            <FileText className="size-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold">Blog database setup required</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Admin login worked, but the backend still needs one Supabase setup
            step before it can load, save, or publish blogs.
          </p>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-black/30 dark:text-slate-200">
            <p className="font-semibold text-amber-800 dark:text-amber-100">Required setup</p>
            <code className="mt-2 block break-words text-xs text-slate-600 dark:text-slate-300">
              Run supabase/migrations/006_blog_cms.sql and set SUPABASE_SERVICE_ROLE_KEY in deployment env.
            </code>
          </div>
          {setupError ? (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs leading-5 text-red-700 dark:text-red-100">
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
              className="h-11 rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/10"
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
    <main className="min-h-screen bg-[#f5f8fd] text-slate-950 dark:bg-[#07101f] dark:text-white">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f5f8fd]/86 px-4 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#07101f]/84 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#335cff]">
              Tulmin Admin
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Blog publishing desk</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Edit articles in the same premium system used by the public blog.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-[#335cff]/10 px-3 py-1 text-[#335cff] hover:bg-[#335cff]/10">
              {admin?.role} · {admin?.email}
            </Badge>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/10"
              onClick={() => void logout()}
              disabled={busy === "logout"}
            >
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
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
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-slate-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
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
                        ? "bg-[#335cff] text-white ring-[#335cff]"
                        : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100 dark:bg-white/[0.04] dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/[0.08]",
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold">All CMS blogs</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Showing {filteredPosts.length} of {posts.length}
                </p>
              </div>
              {(query || statusFilter !== "all") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Show all
                </Button>
              ) : null}
            </div>
            <div className="max-h-[68vh] space-y-2 overflow-auto p-3">
              {filteredPosts.map((post) => (
                <button
                  key={post.slug}
                  type="button"
                  className={cn(
                    "w-full rounded-2xl border p-3 text-left transition",
                    selectedSlug === post.slug
                      ? "border-[#335cff]/45 bg-[#335cff]/10 shadow-sm"
                      : "border-slate-200 bg-slate-50 hover:border-[#335cff]/30 hover:bg-white dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.06]",
                  )}
                  onClick={() => loadPost(post)}
                >
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        "size-14 shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(135deg,rgb(51_92_255/0.18),rgb(16_185_129/0.10))] ring-1 ring-slate-200 dark:ring-white/10",
                        post.featuredImage && "bg-cover bg-center"
                      )}
                      style={
                        post.featuredImage
                          ? { backgroundImage: `url(${post.featuredImage})` }
                          : undefined
                      }
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold capitalize",
                            post.status === "published"
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-200"
                              : "bg-amber-500/14 text-amber-700 dark:text-amber-200",
                          )}
                        >
                          {post.status}
                        </span>
                        {post.trending ? (
                          <span className="rounded-full bg-orange-500/12 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-200">
                            Trending
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-950 dark:text-white">
                        {post.title}
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                        {post.slug}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-1.5">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      title="Edit blog"
                      aria-label={`Edit ${post.title}`}
                      className="text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation();
                        loadPost(post);
                      }}
                    >
                      <Edit3 className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      title={admin?.role === "super_admin" ? "Delete blog" : "Only super admins can delete"}
                      aria-label={`Delete ${post.title}`}
                      disabled={Boolean(busy) || admin?.role !== "super_admin"}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 disabled:text-slate-400 dark:text-red-200 dark:hover:bg-red-400/10 dark:hover:text-red-100 dark:disabled:text-slate-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteSelected(post.slug);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </button>
              ))}
              {!filteredPosts.length ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No blogs found.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.045] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
            <div>
              <h2 className="text-lg font-semibold">Editor</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Drafts stay private. Published blogs sync to `/blog`.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/10"
                onClick={() => setPreview((value) => !value)}
              >
                {preview ? <Edit3 className="size-4" /> : <Eye className="size-4" />}
                {preview ? "Edit" : "Preview"}
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => void save("draft")} disabled={Boolean(busy)}>
                {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save draft
              </Button>
              <Button type="button" className="rounded-xl bg-emerald-500 text-white hover:bg-emerald-400" onClick={() => void save("published")} disabled={Boolean(busy)}>
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
            <article className="min-h-[680px] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50 shadow-sm dark:border-white/10 dark:bg-[#07101f]">
              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="p-5 sm:p-7">
                  <p className="inline-flex rounded-full bg-[#335cff]/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#335cff] ring-1 ring-[#335cff]/20">
                    {form.category}
                  </p>
                  <h1 className="mt-5 max-w-4xl text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.04] tracking-tight text-slate-950 dark:text-white">
                    {form.title || "Untitled blog"}
                  </h1>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
                    {form.description}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                    <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
                      {form.readTime || "5 min read"}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
                      {form.status || "draft"}
                    </span>
                  </div>
                </div>
                <div className="p-5 pt-0 xl:pl-0 xl:pt-5">
                  <div
                    className={cn(
                      "aspect-[16/10] rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgb(51_92_255/0.18),rgb(16_185_129/0.10))] bg-cover bg-center shadow-sm dark:border-white/10",
                      !form.featuredImage && "flex items-center justify-center"
                    )}
                    style={form.featuredImage ? { backgroundImage: `url(${form.featuredImage})` } : undefined}
                  >
                    {!form.featuredImage ? (
                      <div className="text-center">
                        <ImagePlus className="mx-auto size-10 text-[#335cff]" />
                        <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                          Add featured image
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.025] sm:p-7">
                <div className="mx-auto max-w-3xl space-y-2">{renderPreview(form.richContent ?? "")}</div>
              </div>
            </article>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300">Title</Label>
                    <Input
                      value={form.title ?? ""}
                      onChange={(event) => patchForm({ title: event.target.value, slug: form.slug || slugify(event.target.value) })}
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 text-slate-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
                    />
                  </label>
                  <label className="space-y-2">
                    <Label className="text-slate-600 dark:text-slate-300">Slug</Label>
                    <Input
                      value={form.slug ?? ""}
                      onChange={(event) => patchForm({ slug: slugify(event.target.value) })}
                      className="h-11 rounded-xl border-slate-200 bg-slate-50 text-slate-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
                    />
                  </label>
                </div>

                <label className="space-y-2 block">
                  <Label className="text-slate-600 dark:text-slate-300">Description</Label>
                  <textarea
                    value={form.description ?? ""}
                    onChange={(event) => patchForm({ description: event.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-950 outline-none ring-[#335cff]/30 placeholder:text-slate-400 focus:ring-2 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-600"
                  />
                </label>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-black/20">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-white/[0.03]">
                    <select
                      aria-label="Text style"
                      value={toolbarState.style}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        runEditorCommand("formatBlock", event.target.value);
                      }}
                      className="h-8 rounded-xl border border-[#335cff]/60 bg-[#335cff]/10 px-2 text-xs font-semibold text-slate-900 outline-none ring-1 ring-[#335cff]/25 focus:ring-2 focus:ring-[#335cff]/35 dark:border-[#5f86ff]/60 dark:bg-[#335cff]/20 dark:text-white"
                    >
                      <option value="h1">Title</option>
                      <option value="h2">Sub title</option>
                      <option value="h3">Body sub heading</option>
                      <option value="p">Body text</option>
                    </select>
                    <select
                      aria-label="Font size"
                      value={toolbarState.size}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        applyFontSize(event.target.value);
                      }}
                      className="h-8 rounded-xl border border-[#335cff]/60 bg-[#335cff]/10 px-2 text-xs font-semibold text-slate-900 outline-none ring-1 ring-[#335cff]/25 focus:ring-2 focus:ring-[#335cff]/35 dark:border-[#5f86ff]/60 dark:bg-[#335cff]/20 dark:text-white"
                    >
                      {FONT_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1.5 py-1 dark:border-white/10 dark:bg-black/20">
                      {TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`Text color ${color}`}
                          aria-pressed={colorsMatch(toolbarState.color, color)}
                          onClick={() => {
                            runEditorCommand("foreColor", color);
                            updateToolbarState({ color });
                          }}
                          className={cn(
                            "size-5 rounded-full border border-slate-300 ring-offset-2 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#335cff]/30 dark:border-white/20 dark:ring-offset-[#0b111d]",
                            colorsMatch(toolbarState.color, color) && "scale-110 ring-2 ring-[#335cff] ring-offset-2 dark:ring-[#8fa8ff]"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <Button type="button" size="icon-sm" variant="ghost" title="Bold" aria-pressed={toolbarState.bold} className={cn("text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10", toolbarState.bold && "bg-[#335cff]/15 text-[#335cff] ring-1 ring-[#335cff]/35 dark:bg-[#5f86ff]/20 dark:text-white")} onClick={() => runEditorCommand("bold")}>
                      <Bold className="size-4" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" title="Italic" aria-pressed={toolbarState.italic} className={cn("text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10", toolbarState.italic && "bg-[#335cff]/15 text-[#335cff] ring-1 ring-[#335cff]/35 dark:bg-[#5f86ff]/20 dark:text-white")} onClick={() => runEditorCommand("italic")}>
                      <Italic className="size-4" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" title="Main title" aria-pressed={toolbarState.style === "h1"} className={cn("text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10", toolbarState.style === "h1" && "bg-[#335cff]/15 text-[#335cff] ring-1 ring-[#335cff]/35 dark:bg-[#5f86ff]/20 dark:text-white")} onClick={() => runEditorCommand("formatBlock", "h1")}>
                      <Heading1 className="size-4" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" title="Sub title" aria-pressed={toolbarState.style === "h2"} className={cn("text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10", toolbarState.style === "h2" && "bg-[#335cff]/15 text-[#335cff] ring-1 ring-[#335cff]/35 dark:bg-[#5f86ff]/20 dark:text-white")} onClick={() => runEditorCommand("formatBlock", "h2")}>
                      <Heading2 className="size-4" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" title="Body sub heading" aria-pressed={toolbarState.style === "h3"} className={cn("text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10", toolbarState.style === "h3" && "bg-[#335cff]/15 text-[#335cff] ring-1 ring-[#335cff]/35 dark:bg-[#5f86ff]/20 dark:text-white")} onClick={() => runEditorCommand("formatBlock", "h3")}>
                      <Heading3 className="size-4" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" title="Bullet list" aria-pressed={toolbarState.list} className={cn("text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10", toolbarState.list && "bg-[#335cff]/15 text-[#335cff] ring-1 ring-[#335cff]/35 dark:bg-[#5f86ff]/20 dark:text-white")} onClick={() => runEditorCommand("insertUnorderedList")}>
                      <List className="size-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10" onClick={insertStarterSection}>
                      <Type className="size-4" />
                      Section
                    </Button>
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-label="Blog body editor"
                    data-placeholder="Write the blog body. Select text to adjust title, sub-title, body sub heading, font size, colour, bold, italic, and lists."
                    data-empty={editorIsEmpty}
                    onInput={() => {
                      syncEditorContent();
                      saveEditorSelection();
                    }}
                    onKeyUp={saveEditorSelection}
                    onMouseUp={saveEditorSelection}
                    onBlur={() => {
                      syncEditorContent();
                      saveEditorSelection();
                    }}
                    className="blog-rich-content min-h-[420px] w-full bg-transparent px-4 py-4 text-slate-950 outline-none data-[empty=true]:before:text-slate-400 data-[empty=true]:before:content-[attr(data-placeholder)] dark:text-white dark:data-[empty=true]:before:text-slate-600"
                  />
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Publishing</h3>
                  <div className="mt-4 grid gap-3">
                    <label className="space-y-2">
                      <Label className="text-slate-600 dark:text-slate-300">Category</Label>
                      <select
                        value={form.category ?? "Label Management"}
                        onChange={(event) => patchForm({ category: event.target.value as BlogCategory })}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:ring-2 focus:ring-[#335cff]/30 dark:border-white/10 dark:bg-[#0b111d] dark:text-white"
                      >
                        {BLOG_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <Label className="text-slate-600 dark:text-slate-300">Read time</Label>
                      <Input
                        value={form.readTime ?? ""}
                        onChange={(event) => patchForm({ readTime: event.target.value })}
                        className="h-11 rounded-xl border-slate-200 bg-white text-slate-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      />
                    </label>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-transparent">
                      <Checkbox checked={Boolean(form.featured)} onCheckedChange={(value) => patchForm({ featured: Boolean(value) })} />
                      <Label className="text-sm text-slate-600 dark:text-slate-300">Featured article</Label>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-transparent">
                      <Checkbox checked={Boolean(form.trending)} onCheckedChange={(value) => patchForm({ trending: Boolean(value) })} />
                      <Label className="text-sm text-slate-600 dark:text-slate-300">Trending badge</Label>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white">SEO</h3>
                  <div className="mt-4 space-y-3">
                    <label className="space-y-2 block">
                      <Label className="text-slate-600 dark:text-slate-300">Meta title</Label>
                      <Input
                        value={form.metaTitle ?? ""}
                        onChange={(event) => patchForm({ metaTitle: event.target.value })}
                        className="h-11 rounded-xl border-slate-200 bg-white text-slate-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <Label className="text-slate-600 dark:text-slate-300">Meta description</Label>
                      <textarea
                        value={form.metaDescription ?? ""}
                        onChange={(event) => patchForm({ metaDescription: event.target.value })}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-950 outline-none focus:ring-2 focus:ring-[#335cff]/30 dark:border-white/10 dark:bg-black/20 dark:text-white"
                      />
                    </label>
                    <label className="space-y-2 block">
                      <Label className="text-slate-600 dark:text-slate-300">Keywords</Label>
                      <textarea
                        value={form.keywordsText}
                        onChange={(event) => patchForm({ keywordsText: event.target.value })}
                        rows={3}
                        placeholder="meesho labels, sku mapping"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[#335cff]/30 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-600"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                    <ImagePlus className="size-4 text-[#335cff]" />
                    Featured image
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Best upload size: {BLOG_FEATURED_IMAGE_SIZE} ({BLOG_FEATURED_IMAGE_RATIO}). Images keep
                    their proportions and crop from the center in blog previews.
                  </p>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => void uploadFeaturedImage(event.target.files?.[0])}
                  />
                  <div className="mt-4 grid gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/10"
                      disabled={Boolean(busy)}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      {busy === "image" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UploadCloud className="size-4" />
                      )}
                      Upload image
                    </Button>
                    <Input
                      value={form.featuredImage ?? ""}
                      onChange={(event) =>
                        patchForm({
                          featuredImage: event.target.value,
                          coverImage: event.target.value,
                          ogImage: event.target.value,
                        })
                      }
                      placeholder="Or paste https://..."
                      className="h-11 rounded-xl border-slate-200 bg-white text-slate-950 dark:border-white/10 dark:bg-black/20 dark:text-white"
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Uploads set the public featured image URL. Publish the blog to show it on `/blog`.
                  </p>
                  {form.featuredImage ? (
                    <div
                      className="mt-3 aspect-video rounded-xl bg-cover bg-center ring-1 ring-slate-200 dark:ring-white/10"
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
