import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

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

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const postsPath = path.join(root, "src/content/blog-posts.json");
const deletedPath = path.join(root, "src/content/blog-deleted-slugs.json");
const auditPath = path.join(root, "src/content/blog-audit-log.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
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
    readJson<AdminBlogPost[]>(postsPath, []),
    readJson<string[]>(deletedPath, []),
    readJson(auditPath, []),
  ]);

  return NextResponse.json({
    admin,
    posts,
    deletedSlugs,
    auditLog,
    collections: {
      blogs: "src/content/blog-posts.json",
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

    const posts = await readJson<AdminBlogPost[]>(postsPath, []);
    const existing = posts.find((post) => post.slug === validation.post?.slug);
    const savedPost: AdminBlogPost = {
      ...validation.post,
      author: validation.post.author || admin.email,
      authorId: admin.id,
      createdAt: validation.post.createdAt || existing?.createdAt || new Date().toISOString(),
      publishedAt:
        validation.post.status === "published"
          ? validation.post.publishedAt || existing?.publishedAt || new Date().toISOString()
          : validation.post.publishedAt || existing?.publishedAt || "",
      updatedAt: new Date().toISOString(),
    };
    const next = [
      savedPost,
      ...posts.filter((post) => post.slug !== savedPost.slug),
    ].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));

    await writeJson(postsPath, next);
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

    const [posts, deleted] = await Promise.all([
      readJson<AdminBlogPost[]>(postsPath, []),
      readJson<string[]>(deletedPath, []),
    ]);

    const nextPosts =
      body.action === "unpublish"
        ? posts.map((post) => (post.slug === body.slug ? { ...post, status: "draft" as const } : post))
        : posts.filter((post) => post.slug !== body.slug);
    const nextDeleted =
      body.action === "delete" ? Array.from(new Set([...deleted, body.slug])) : deleted;

    await Promise.all([
      writeJson(postsPath, nextPosts),
      writeJson(deletedPath, nextDeleted),
      appendBlogAuditLog(admin, body.action, body.slug),
    ]);

    return NextResponse.json({ ok: true, posts: nextPosts, deletedSlugs: nextDeleted });
  }

  if (body.action === "push") {
    if (admin.role !== "super_admin") {
      return NextResponse.json({ error: "Only super admins can push to GitHub." }, { status: 403 });
    }
    const message = body.message?.trim() || "Update Tulmin blog CMS content";
    await execFileAsync("git", [
      "add",
      "src/content/blog-posts.json",
      "src/content/blog-deleted-slugs.json",
      "src/content/blog-audit-log.json",
    ]);
    await execFileAsync("git", ["commit", "-m", message]).catch((error: { stderr?: string }) => {
      if (error.stderr?.includes("nothing to commit")) return null;
      throw error;
    });
    const { stdout, stderr } = await execFileAsync("git", ["push", "origin", "main"]);
    await appendBlogAuditLog(admin, "push_to_github");
    return NextResponse.json({ ok: true, output: `${stdout}${stderr}`.trim() });
  }

  return NextResponse.json({ error: "Unknown admin blog action." }, { status: 400 });
}
