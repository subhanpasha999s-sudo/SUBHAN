import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin/auth";
import { deleteCmsBlog, listCmsBlogs, saveCmsBlog } from "@/lib/admin/blog-cms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    return NextResponse.json({ admin, posts: await listCmsBlogs() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load blogs." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json()) as { post?: unknown };
    return NextResponse.json({ ok: true, post: await saveCmsBlog(body.post ?? {}, admin) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save blog." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  if (admin.role !== "super_admin") {
    return NextResponse.json({ error: "Only super admins can delete blogs." }, { status: 403 });
  }

  try {
    const { slug } = (await request.json()) as { slug?: string };
    await deleteCmsBlog(slug ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete blog." },
      { status: 400 },
    );
  }
}
