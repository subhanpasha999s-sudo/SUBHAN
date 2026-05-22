import type { Metadata } from "next";

import { BlogIndexClient } from "@/components/blog/blog-index-client";
import { getLiveBlogPosts } from "@/lib/blog/live-posts";
import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tulmin AI Blog for Meesho, Flipkart & Amazon Dispatch",
  description:
    "Practical Tulmin AI dispatch guides for Indian ecommerce sellers: label filtering, auto-crop, SKU-wise sorting, courier segregation, Amazon invoice matching, and warehouse productivity.",
  alternates: { canonical: `${getSiteUrl()}/blog` },
  keywords: [
    "Tulmin AI",
    "AI label filter",
    "auto crop AI",
    "marketplace label AI",
    "meesho label filter",
    "flipkart label sorter",
    "amazon shipping label filter AI",
    "sku-wise label sorting",
    "courier-wise label sorter",
    "warehouse dispatch management",
    "ecommerce dispatch software",
  ],
  openGraph: {
    title: "Tulmin AI Blog · Ecommerce Label Filtering and Auto-Crop Guides",
    description:
      "Helpful guides for Meesho, Flipkart, and Amazon sellers who want fewer wrong shipments, cleaner label batches, and faster dispatch.",
    url: `${getSiteUrl()}/blog`,
    type: "website",
  },
};

export default async function BlogIndexPage() {
  return <BlogIndexClient posts={await getLiveBlogPosts()} />;
}
