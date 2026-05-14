import { NextResponse } from "next/server";

import { getLiveBlogPosts } from "@/lib/blog/live-posts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    posts: await getLiveBlogPosts(),
  });
}
