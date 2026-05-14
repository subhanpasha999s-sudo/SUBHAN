import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { appendBlogAuditLog } from "@/lib/admin/blog-audit";
import {
  canDelete,
  canPublish,
  requireAdmin,
  type AdminPrincipal,
} from "@/lib/admin/blog-admin-auth";
import { isRateLimited } from "@/lib/admin/blog-rate-limit";
import { type AdminBlogPost, validateAdminBlogPost } from "@/lib/admin/blog-validation";
import { deleteLiveBlogPost, getLiveBlogPosts, saveLiveBlogPost } from "@/lib/blog/live-posts";

export const dynamic = "force-dynamic";

const root = process.cwd();
const auditPath = path.join(root, "src/content/blog-audit-log.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function rateLimit(request: Request, admin?: AdminPrincipal) {
  const key = admin?.email ?? request.headers.get("x-forwarded-for") ?? "anonymous";
  if (!isRateLimited(`admin-blog:${key}`)) return null;
  return NextResponse.json({ error: "Too many admin requests. Try again shortly." }, { status: 429 });
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const limited = rateLimit(request, admin);
  if (limited) return limited;

  const [posts, deletedSlugs, auditLog] = await Promise.all([
    getLiveBlogPosts({ includeDrafts: true, throwOnError: true }),
    Promise.resolve([] as string[]),
    readJson(auditPath, []),
  ]);

  return NextResponse.json({
    admin,
    posts,
    deletedSlugs,
    auditLog,
    collections: {
      blogs: "src/content/blog-posts.json",
      live_blogs: "supabase public.blogs",
      blog_categories: "supabase/migrations/006_blog_cms.sql",
      blog_tags: "supabase/migrations/006_blog_cms.sql",
      blog_authors: "supabase/migrations/006_blog_cms.sql",
      blog_seo: "supabase/migrations/006_blog_cms.sql",
      blog_analytics: "supabase/migrations/006_blog_cms.sql",
    },
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const limited = rateLimit(request, admin);
  if (limited) return limited;

  const body = (await request.json()) as {
    action?: string;
    post?: AdminBlogPost;
    slug?: string;
    message?: string;
  };

  if (body.action === "save") {
    const validation = validateAdminBlogPost(body.post);
    if (!validation.post) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    if (validation.post.status === "published" && !canPublish(admin.role)) {
      return NextResponse.json({ error: "This role cannot publish blogs." }, { status: 403 });
    }

    const posts = (await getLiveBlogPosts({ includeDrafts: true, throwOnError: true })) as AdminBlogPost[];
    const existing = posts.find((post) => post.slug === validation.post?.slug);
    const savedPost: AdminBlogPost & { status: "draft" | "published" } = {
      ...validation.post,
      status: validation.post.status === "published" ? "published" : "draft",
      author: validation.post.author || admin.email,
      authorId: admin.id,
      createdAt: validation.post.createdAt || existing?.createdAt || new Date().toISOString(),
      publishedAt:
        validation.post.status === "published"
          ? validation.post.publishedAt || existing?.publishedAt || new Date().toISOString()
          : validation.post.publishedAt || existing?.publishedAt || "",
      updatedAt: new Date().toISOString(),
    };
    await saveLiveBlogPost(savedPost);
    const next = await getLiveBlogPosts({ includeDrafts: true, throwOnError: true });

    await appendBlogAuditLog(admin, savedPost.status === "published" ? "publish_or_update" : "save_draft", savedPost.slug);

    return NextResponse.json({ ok: true, posts: next });
  }

  if (body.action === "delete" || body.action === "unpublish") {
    if (!body.slug) {
      return NextResponse.json({ error: "Missing slug." }, { status: 400 });
    }
    if (body.action === "delete" && !canDelete(admin.role)) {
      return NextResponse.json({ error: "Only super admins can delete blogs." }, { status: 403 });
    }

    if (body.action === "unpublish") {
      const posts = (await getLiveBlogPosts({ includeDrafts: true, throwOnError: true })) as AdminBlogPost[];
      const existing = posts.find((post) => post.slug === body.slug);
      if (existing) {
        await saveLiveBlogPost({ ...existing, status: "draft" });
      }
    } else {
      await deleteLiveBlogPost(body.slug);
    }
    const nextPosts = await getLiveBlogPosts({ includeDrafts: true, throwOnError: true });
    await appendBlogAuditLog(admin, body.action, body.slug);

    return NextResponse.json({ ok: true, posts: nextPosts, deletedSlugs: [] });
  }

  return NextResponse.json({ error: "Unknown admin blog action." }, { status: 400 });
}
