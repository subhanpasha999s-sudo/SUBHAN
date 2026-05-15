import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin/auth";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BLOG_IMAGE_BUCKET = "blog-images";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

function uploadError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function safeSlug(value: unknown) {
  const source = typeof value === "string" ? value : "blog";
  return (
    source
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "blog"
  );
}

async function ensurePublicBucket() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) return null;

  const { data } = await supabase.storage.getBucket(BLOG_IMAGE_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BLOG_IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: String(MAX_IMAGE_BYTES),
      allowedMimeTypes: [...ALLOWED_IMAGE_TYPES.keys()],
    });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw new Error(`Could not create blog image bucket: ${error.message}`);
    }
  }

  return supabase;
}

async function saveLocalFallback(filePath: string, bytes: Uint8Array) {
  const uploadDir = path.join(process.cwd(), "public", "blog-uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filePath), bytes);
  return `/blog-uploads/${filePath}`;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return uploadError("Choose an image file to upload.");
    }

    const mime = file.type;
    const ext = ALLOWED_IMAGE_TYPES.get(mime);
    if (!ext) {
      return uploadError("Use a JPG, PNG, WebP, or GIF image.");
    }

    if (file.size <= 0) return uploadError("The selected image is empty.");
    if (file.size > MAX_IMAGE_BYTES) {
      return uploadError("Image must be 8 MB or smaller.");
    }

    const slug = safeSlug(form.get("slug"));
    const fileName = `${slug}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const supabase = await ensurePublicBucket();
    if (supabase) {
      const storagePath = `${slug}/${fileName}`;
      const { error } = await supabase.storage
        .from(BLOG_IMAGE_BUCKET)
        .upload(storagePath, bytes, {
          contentType: mime,
          upsert: false,
        });
      if (error) throw new Error(`Image upload failed: ${error.message}`);

      const { data } = supabase.storage
        .from(BLOG_IMAGE_BUCKET)
        .getPublicUrl(storagePath);
      return NextResponse.json({ url: data.publicUrl, path: storagePath });
    }

    const localUrl = await saveLocalFallback(fileName, bytes);
    return NextResponse.json({
      url: localUrl,
      path: fileName,
      localOnly: true,
    });
  } catch (error) {
    return uploadError(error instanceof Error ? error.message : "Image upload failed.", 500);
  }
}
