import type { MetadataRoute } from "next";

import { getAllBlogPosts } from "@/lib/blog/posts";
import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const blogPaths = ["/blog", ...getAllBlogPosts().map((post) => `/blog/${post.slug}`)];
  const paths = [
    ...blogPaths,
    "/export-labels",
    "/mapping",
    "/settings",
    "/account",
    "/login",
    "/privacy",
    "/terms",
  ] as const;

  return paths.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency:
      path === "/export-labels" || path.startsWith("/blog")
        ? ("weekly" as const)
        : ("monthly" as const),
    priority:
      path === "/export-labels"
        ? 1
        : path.startsWith("/blog")
          ? 0.8
          : 0.65,
  }));
}
