import type { Metadata } from "next";

import { BlogIndexClient } from "@/components/blog/blog-index-client";
import { getLiveBlogPosts } from "@/lib/blog/live-posts";
import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tulmin Blog · Meesho seller guides for SKU, QTY, and courier label filtering",
  description:
    "SEO-focused Tulmin blog for Meesho sellers: practical guides around filtering labels by SKU, quantity, and courier partner, plus dispatch and warehouse productivity tips.",
  alternates: { canonical: `${getSiteUrl()}/blog` },
  keywords: [
    "meesho seller login",
    "meesho supplier panel",
    "meesho label crop",
    "meesho label cropper",
    "meesho label print",
    "meesho bulk label management",
    "meesho warehouse management",
    "meesho sku filter",
  ],
};

export default async function BlogIndexPage() {
  return <BlogIndexClient posts={await getLiveBlogPosts()} />;
}
