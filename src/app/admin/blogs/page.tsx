import type { Metadata } from "next";

import { AdminBlogCmsClient } from "@/components/admin/admin-blog-cms-client";
import { getAllBlogPosts } from "@/lib/blog/posts";

export const metadata: Metadata = {
  title: "Admin Blogs | Tulmin CMS",
  robots: { index: false, follow: false },
};

export default function AdminBlogsPage() {
  return <AdminBlogCmsClient publicPosts={getAllBlogPosts()} />;
}
