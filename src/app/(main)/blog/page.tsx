import type { Metadata } from "next";

import { BlogIndexClient } from "@/components/blog/blog-index-client";
import { getAllBlogPosts } from "@/lib/blog/posts";
import { getSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Tulmin Blog · Meesho seller guides, label tools, and growth workflows",
  description:
    "Premium Tulmin blog for Meesho sellers: label crop workflows, SKU filtering, warehouse productivity, seller growth, and dispatch mistake reduction.",
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

export default function BlogIndexPage() {
  return <BlogIndexClient posts={getAllBlogPosts()} />;
}
