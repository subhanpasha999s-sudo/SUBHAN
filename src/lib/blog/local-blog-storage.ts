"use client";

import type { BlogPost } from "@/lib/blog/posts";

export const LOCAL_BLOG_POSTS_KEY = "tulmin.blog-admin.posts.v1";
export const LOCAL_BLOG_DELETED_KEY = "tulmin.blog-admin.deleted-slugs.v1";

export type EditableBlogPost = BlogPost & {
  localId: string;
  status: "draft" | "published";
  updatedAt: string;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function slugifyBlogTitle(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return slug || `blog-${Date.now().toString(36)}`;
}

export function readLocalBlogPosts() {
  return readJson<EditableBlogPost[]>(LOCAL_BLOG_POSTS_KEY, []).filter(
    (post) => post.slug && post.title,
  );
}

export function writeLocalBlogPosts(posts: EditableBlogPost[]) {
  writeJson(LOCAL_BLOG_POSTS_KEY, posts);
}

export function readDeletedBlogSlugs() {
  return new Set(readJson<string[]>(LOCAL_BLOG_DELETED_KEY, []));
}

export function writeDeletedBlogSlugs(slugs: Set<string>) {
  writeJson(LOCAL_BLOG_DELETED_KEY, [...slugs]);
}

export function getPublicLocalBlogPosts() {
  return readLocalBlogPosts().filter((post) => post.status === "published");
}

export function mergeLocalBlogPosts(staticPosts: BlogPost[]) {
  const deleted = readDeletedBlogSlugs();
  const local = getPublicLocalBlogPosts();
  const localSlugs = new Set(local.map((post) => post.slug));
  return [
    ...local,
    ...staticPosts.filter(
      (post) => !deleted.has(post.slug) && !localSlugs.has(post.slug),
    ),
  ].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));
}

export function findLocalBlogPost(slug: string) {
  return getPublicLocalBlogPosts().find((post) => post.slug === slug) ?? null;
}
