import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const paths = [
    "/",
    "/export-labels",
    "/mapping",
    "/settings",
    "/login",
    "/privacy",
    "/terms",
  ] as const;

  return paths.map((path, i) => ({
    url: path === "/" ? `${base}/` : `${base}${path}`,
    lastModified: new Date(),
    changeFrequency:
      path === "/" || path === "/export-labels" ? ("weekly" as const) : ("monthly" as const),
    priority: i === 0 ? 1 : path === "/export-labels" ? 0.95 : 0.65,
  }));
}
