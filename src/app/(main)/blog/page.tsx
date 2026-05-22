import type { Metadata } from "next";

import { BlogIndexClient } from "@/components/blog/blog-index-client";
import { getLiveBlogPosts } from "@/lib/blog/live-posts";
import { getSiteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketplace Dispatch Blog for Meesho, Flipkart & Amazon Sellers",
  description:
    "Practical dispatch guides for Indian ecommerce sellers: label filtering, SKU-wise sorting, courier segregation, Amazon invoice matching, and warehouse productivity.",
  alternates: { canonical: `${getSiteUrl()}/blog` },
  keywords: [
    "label filter software",
    "meesho label filter",
    "flipkart label sorter",
    "amazon shipping label software",
    "sku-wise label sorting",
    "courier-wise label sorter",
    "warehouse dispatch management",
    "ecommerce dispatch software",
  ],
  openGraph: {
    title: "Tulmin Blog · Ecommerce Label Filtering and Dispatch Guides",
    description:
      "Helpful guides for Meesho, Flipkart, and Amazon sellers who want fewer wrong shipments, cleaner label batches, and faster dispatch.",
    url: `${getSiteUrl()}/blog`,
    type: "website",
  },
};

export default async function BlogIndexPage() {
  return <BlogIndexClient posts={await getLiveBlogPosts()} />;
}
