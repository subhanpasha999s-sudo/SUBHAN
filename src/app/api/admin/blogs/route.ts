import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin/auth";
import { deleteCmsBlog, listCmsBlogs, saveCmsBlog } from "@/lib/admin/blog-cms";

export const dynamic = "force-dynamic";

function isMissingBlogTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("public.blogs") ||
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("relation \"blogs\"") ||
    message.includes("relation \"public.blogs\"")
  );
}

function isMissingServiceRole(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("SUPABASE_SERVICE_ROLE_KEY");
}

function cmsErrorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Blog CMS request failed.";
  if (isMissingServiceRole(error)) {
    return NextResponse.json(
      {
        error: message,
        setupRequired: true,
        setupHint: "Add SUPABASE_SERVICE_ROLE_KEY in your deployment environment variables, then redeploy.",
      },
      { status: 503 },
    );
  }

  if (isMissingBlogTable(error)) {
    return NextResponse.json(
      {
        error: message,
        setupRequired: true,
        setupHint: "Run supabase/migrations/006_blog_cms.sql in Supabase SQL Editor, then refresh this page.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    return NextResponse.json({ admin, posts: await listCmsBlogs() });
  } catch (error) {
    return cmsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json()) as { post?: unknown };
    return NextResponse.json({ ok: true, post: await saveCmsBlog(body.post ?? {}, admin) });
  } catch (error) {
    return cmsErrorResponse(error, 400);
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
    return cmsErrorResponse(error, 400);
  }
}
