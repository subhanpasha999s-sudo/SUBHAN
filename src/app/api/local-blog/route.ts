import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import type { BlogPost } from "@/lib/blog/posts";

export const dynamic = "force-static";

const execFileAsync = promisify(execFile);

const root = process.cwd();
const postsPath = path.join(root, "src/content/blog-posts.json");
const deletedPath = path.join(root, "src/content/blog-deleted-slugs.json");

function unavailable() {
  if (process.env.NODE_ENV === "development") return null;
  if (process.env.TULMIN_LOCAL_BACKEND === "1") return null;
  return NextResponse.json(
    { error: "Local blog backend is disabled outside local development." },
    { status: 403 },
  );
}

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

export async function GET() {
  const blocked = unavailable();
  if (blocked) return blocked;
  const [posts, deletedSlugs] = await Promise.all([
    readJson<BlogPost[]>(postsPath, []),
    readJson<string[]>(deletedPath, []),
  ]);
  return NextResponse.json({ posts, deletedSlugs });
}

export async function POST(request: Request) {
  const blocked = unavailable();
  if (blocked) return blocked;
  const body = (await request.json()) as {
    action?: string;
    post?: BlogPost;
    slug?: string;
    message?: string;
  };

  if (body.action === "save") {
    if (!body.post?.slug || !body.post.title) {
      return NextResponse.json(
        { error: "Post needs a slug and title." },
        { status: 400 },
      );
    }
    const posts = await readJson<BlogPost[]>(postsPath, []);
    const next = [
      body.post,
      ...posts.filter((post) => post.slug !== body.post?.slug),
    ].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));
    await writeJson(postsPath, next);
    return NextResponse.json({ ok: true, posts: next });
  }

  if (body.action === "delete") {
    if (!body.slug) {
      return NextResponse.json({ error: "Missing slug." }, { status: 400 });
    }
    const [posts, deleted] = await Promise.all([
      readJson<BlogPost[]>(postsPath, []),
      readJson<string[]>(deletedPath, []),
    ]);
    const nextPosts = posts.filter((post) => post.slug !== body.slug);
    const nextDeleted = Array.from(new Set([...deleted, body.slug]));
    await Promise.all([
      writeJson(postsPath, nextPosts),
      writeJson(deletedPath, nextDeleted),
    ]);
    return NextResponse.json({ ok: true, posts: nextPosts, deletedSlugs: nextDeleted });
  }

  if (body.action === "push") {
    const message = body.message?.trim() || "Update blog content";
    await execFileAsync("git", ["add", "src/content/blog-posts.json", "src/content/blog-deleted-slugs.json"]);
    await execFileAsync("git", ["commit", "-m", message]).catch((error: { stderr?: string }) => {
      if (error.stderr?.includes("nothing to commit")) return null;
      throw error;
    });
    const { stdout, stderr } = await execFileAsync("git", ["push", "origin", "main"]);
    return NextResponse.json({ ok: true, output: `${stdout}${stderr}`.trim() });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
