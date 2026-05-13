import type { Metadata } from "next";

import { BlogBackendClient } from "@/components/backend/blog-backend-client";
import { getAllBlogPosts } from "@/lib/blog/posts";

export const metadata: Metadata = {
  title: "Blog Backend · Tulmin",
  robots: { index: false, follow: false },
};

export default function BlogBackendPage() {
  return <BlogBackendClient initialPosts={getAllBlogPosts()} />;
}
