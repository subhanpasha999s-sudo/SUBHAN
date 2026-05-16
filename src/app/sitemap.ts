import type { MetadataRoute } from "next";

import { getLiveBlogPosts } from "@/lib/blog/live-posts";
import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

function toLastModified(value: string | undefined) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const posts = await getLiveBlogPosts();
  const staticPaths = [
    "/export-labels",
    "/mapping",
    "/settings",
    "/account",
    "/login",
    "/privacy",
    "/terms",
  ] as const;

  return [
    {
      url: `${base}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: toLastModified(post.updatedAt || post.publishedAt || post.publishedOn),
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    ...staticPaths.map((path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "/export-labels" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "/export-labels" ? 1 : 0.65,
    })),
  ];
}
