import { BLOG_CATEGORIES, BLOG_POSTS, type BlogCategory, type BlogPost } from "@/lib/blog/posts";
import { contentToRichHtml } from "@/lib/blog/rich-content";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";
import type { AdminPrincipal } from "@/lib/admin/auth";

export type BlogStatus = "draft" | "published";

export type BlogCmsPost = BlogPost & {
  status: BlogStatus;
  richContent: string;
};

type BlogRow = {
  id?: string;
  slug: string;
  title: string;
  seo_title?: string | null;
  meta_description?: string | null;
  content?: Record<string, unknown> | null;
  featured_image?: string | null;
  status: BlogStatus;
  author?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
};

type BlogInput = Partial<BlogCmsPost> & {
  keywordsText?: string;
};

const categorySet = new Set<string>(BLOG_CATEGORIES);

export function slugifyBlog(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(value: unknown): BlogCategory {
  return typeof value === "string" && categorySet.has(value)
    ? (value as BlogCategory)
    : "Label Management";
}

function normalizeKeywords(input: BlogInput) {
  const source = Array.isArray(input.keywords) ? input.keywords : (input.keywordsText ?? "").split(",");
  return source.map((item) => String(item).trim()).filter(Boolean);
}

function rowToCmsPost(row: BlogRow): BlogCmsPost | null {
  const content = (row.content ?? {}) as Partial<BlogCmsPost> & { deleted?: boolean };
  if (content.deleted || !row.slug || !row.title) return null;

  const richContent =
    typeof content.richContent === "string"
      ? content.richContent
      : Array.isArray(content.sections)
        ? content.sections.map((section) => `${section.heading}\n\n${section.body}`).join("\n\n")
        : "";

  return {
    ...content,
    id: row.id ?? content.id,
    slug: row.slug,
    title: row.title,
    description: content.description ?? row.meta_description ?? "",
    seoTitle: content.seoTitle ?? row.seo_title ?? undefined,
    category: normalizeCategory(content.category),
    readTime: content.readTime ?? "5 min read",
    publishedOn:
      content.publishedOn ??
      row.published_at?.slice(0, 10) ??
      row.updated_at?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
    status: row.status,
    featuredImage: content.featuredImage ?? row.featured_image ?? "",
    coverImage: content.coverImage ?? row.featured_image ?? "",
    metaTitle: content.metaTitle ?? row.seo_title ?? "",
    metaDescription: content.metaDescription ?? row.meta_description ?? "",
    ogImage: content.ogImage ?? row.featured_image ?? "",
    author: content.author ?? row.author ?? "",
    createdAt: content.createdAt ?? row.created_at ?? "",
    updatedAt: content.updatedAt ?? row.updated_at ?? "",
    publishedAt: content.publishedAt ?? row.published_at ?? "",
    scheduledFor: content.scheduledFor ?? "",
    tagSlugs: content.tagSlugs ?? [],
    trending: Boolean(content.trending),
    featured: Boolean(content.featured),
    keywords: Array.isArray(content.keywords) ? content.keywords : [],
    sections: Array.isArray(content.sections) ? content.sections : [],
    faqs: Array.isArray(content.faqs) ? content.faqs : [],
    ctaLabel: content.ctaLabel ?? "Start Using Tulmin",
    richContent,
  };
}

function staticPostToCmsPost(post: BlogPost): BlogCmsPost {
  const richContent = post.sections
    .map((section) => `## ${section.heading}\n\n${section.body}`)
    .join("\n\n");

  return {
    ...post,
    status: post.status === "draft" ? "draft" : "published",
    featuredImage: post.featuredImage ?? post.coverImage ?? "",
    coverImage: post.coverImage ?? post.featuredImage ?? "",
    metaTitle: post.metaTitle ?? post.seoTitle ?? post.title,
    metaDescription: post.metaDescription ?? post.description,
    ogImage: post.ogImage ?? post.featuredImage ?? post.coverImage ?? "",
    author: post.author ?? "Tulmin",
    createdAt: post.createdAt ?? "",
    updatedAt: post.updatedAt ?? post.publishedOn,
    publishedAt: post.publishedAt ?? post.publishedOn,
    scheduledFor: post.scheduledFor ?? "",
    tagSlugs: post.tagSlugs ?? [],
    trending: Boolean(post.trending),
    featured: Boolean(post.featured),
    ctaLabel: post.ctaLabel ?? "Start Using Tulmin",
    richContent,
  };
}

function getClient() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required on the server to publish blogs. Add it to your deployment environment variables and redeploy.",
    );
  }
  return supabase;
}

export async function listCmsBlogs() {
  const { data, error } = await getClient()
    .from("blogs")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Could not load blogs: ${error.message}`);
  const rows = (data ?? []) as BlogRow[];
  const deletedSlugs = new Set(
    rows
      .filter((row) => ((row.content ?? {}) as { deleted?: boolean }).deleted)
      .map((row) => row.slug),
  );
  const uploadedPosts = rows.map(rowToCmsPost).filter(Boolean) as BlogCmsPost[];
  const uploadedSlugs = new Set(uploadedPosts.map((post) => post.slug));
  const hardcodedPosts = BLOG_POSTS.filter(
    (post) => !uploadedSlugs.has(post.slug) && !deletedSlugs.has(post.slug),
  ).map(staticPostToCmsPost);

  return [...uploadedPosts, ...hardcodedPosts].sort((a, b) =>
    (b.updatedAt || b.publishedOn || "").localeCompare(a.updatedAt || a.publishedOn || ""),
  );
}

export function cleanBlogInput(input: BlogInput, admin: AdminPrincipal): BlogCmsPost {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("Title is required.");

  const slug = slugifyBlog(String(input.slug || title));
  if (!slug) throw new Error("Slug is required.");

  const description = String(input.description ?? "").trim();
  if (!description) throw new Error("Description is required.");

  const richContent = contentToRichHtml(String(input.richContent ?? "").trim());
  if (!richContent) throw new Error("Article content is required.");

  const now = new Date().toISOString();
  const status: BlogStatus = input.status === "published" ? "published" : "draft";
  const metaTitle = String(input.metaTitle ?? input.seoTitle ?? title).trim();
  const metaDescription = String(input.metaDescription ?? description).trim();
  const featuredImage = String(input.featuredImage ?? input.coverImage ?? "").trim();
  const keywords = normalizeKeywords(input);

  return {
    id: input.id,
    slug,
    title,
    description,
    seoTitle: metaTitle,
    category: normalizeCategory(input.category),
    readTime: String(input.readTime ?? "5 min read").trim() || "5 min read",
    publishedOn:
      status === "published"
        ? input.publishedOn || now.slice(0, 10)
        : input.publishedOn || "",
    status,
    featuredImage,
    coverImage: featuredImage,
    metaTitle,
    metaDescription,
    ogImage: String(input.ogImage ?? featuredImage).trim(),
    author: input.author || admin.email,
    createdAt: input.createdAt || now,
    updatedAt: now,
    publishedAt: status === "published" ? input.publishedAt || now : input.publishedAt || "",
    scheduledFor: "",
    tagSlugs: [],
    trending: Boolean(input.trending),
    featured: Boolean(input.featured),
    keywords,
    sections: [{ heading: "Article", body: richContent }],
    faqs: Array.isArray(input.faqs) ? input.faqs : [],
    ctaLabel: input.ctaLabel || "Start Using Tulmin",
    richContent,
  };
}

export async function saveCmsBlog(input: BlogInput, admin: AdminPrincipal) {
  const post = cleanBlogInput(input, admin);
  const publishedAt = post.status === "published" ? post.publishedAt || new Date().toISOString() : null;
  const content = {
    ...post,
    publishedAt: publishedAt ?? "",
    updatedAt: new Date().toISOString(),
  };

  const { data, error } = await getClient()
    .from("blogs")
    .upsert(
      {
        slug: post.slug,
        title: post.title,
        seo_title: post.metaTitle,
        meta_description: post.metaDescription,
        content,
        featured_image: post.featuredImage || null,
        status: post.status,
        author: post.author,
        published_at: publishedAt,
        updated_at: content.updatedAt,
      },
      { onConflict: "slug" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Could not save blog: ${error.message}`);
  return rowToCmsPost(data as BlogRow);
}

export async function deleteCmsBlog(slug: string) {
  const normalized = slugifyBlog(slug);
  if (!normalized) throw new Error("Blog slug is required.");

  const now = new Date().toISOString();
  const { error } = await getClient().from("blogs").upsert(
    {
      slug: normalized,
      title: `Deleted: ${normalized}`,
      content: { deleted: true, slug: normalized, updatedAt: now },
      status: "draft",
      updated_at: now,
    },
    { onConflict: "slug" },
  );
  if (error) throw new Error(`Could not delete blog: ${error.message}`);
}
