import { NextResponse } from "next/server";

import { getAllBlogPosts } from "@/lib/blog/posts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    posts: getAllBlogPosts().filter((post) => (post.status ?? "published") === "published"),
  });
}
