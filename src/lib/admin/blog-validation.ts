import { BLOG_CATEGORIES, type BlogCategory, type BlogPost } from "@/lib/blog/posts";

export type AdminBlogPost = BlogPost & {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  scheduledFor?: string;
  authorId?: string;
  tagSlugs?: string[];
  updatedAt?: string;
};

const categorySet = new Set<string>(BLOG_CATEGORIES);

export function slugifyAdminBlog(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function validateAdminBlogPost(input: unknown): { post?: AdminBlogPost; error?: string } {
  const post = input as Partial<AdminBlogPost>;
  if (!post || typeof post !== "object") return { error: "Invalid blog payload." };

  const title = String(post.title ?? "").trim();
  const slug = slugifyAdminBlog(String(post.slug || title));
  const description = String(post.description ?? "").trim();

  if (title.length < 4) return { error: "Blog title is too short." };
  if (!slug) return { error: "Blog slug is required." };
  if (description.length < 20) return { error: "Meta subtitle should be at least 20 characters." };

  const category = categorySet.has(String(post.category))
    ? (post.category as BlogCategory)
    : "Label Management";

  const clean: AdminBlogPost = {
    id: String(post.id ?? globalThis.crypto.randomUUID()),
    slug,
    title,
    description,
    seoTitle: String(post.seoTitle ?? post.metaTitle ?? title).trim().slice(0, 70),
    category,
    readTime: String(post.readTime ?? "5 min read").trim() || "5 min read",
    publishedOn: String(post.publishedOn ?? new Date().toISOString().slice(0, 10)),
    status: post.status === "published" ? "published" : "draft",
    featuredImage: String(post.featuredImage ?? post.coverImage ?? ""),
    coverImage: String(post.coverImage ?? ""),
    ogImage: String(post.ogImage ?? post.coverImage ?? ""),
    metaTitle: String(post.metaTitle ?? title).trim().slice(0, 70),
    metaDescription: String(post.metaDescription ?? description).trim().slice(0, 170),
    scheduledFor: post.scheduledFor ? String(post.scheduledFor) : "",
    authorId: String(post.authorId ?? ""),
    tagSlugs: Array.isArray(post.tagSlugs)
      ? post.tagSlugs.map(String).map((tag) => tag.trim()).filter(Boolean)
      : [],
    trending: Boolean(post.trending),
    featured: Boolean(post.featured),
    keywords: Array.isArray(post.keywords)
      ? post.keywords.map(String).map((keyword) => keyword.trim()).filter(Boolean)
      : [],
    sections: Array.isArray(post.sections)
      ? post.sections
          .map((section) => ({
            heading: String(section?.heading ?? "").trim(),
            body: String(section?.body ?? "").trim(),
          }))
          .filter((section) => section.heading || section.body)
      : [],
    faqs: Array.isArray(post.faqs)
      ? post.faqs
          .map((faq) => ({
            q: String(faq?.q ?? "").trim(),
            a: String(faq?.a ?? "").trim(),
          }))
          .filter((faq) => faq.q || faq.a)
      : [],
    ctaLabel: String(post.ctaLabel ?? "Start Using Tulmin").trim(),
    author: String(post.author ?? ""),
    createdAt: String(post.createdAt ?? new Date().toISOString()),
    publishedAt:
      post.status === "published"
        ? String(post.publishedAt ?? new Date().toISOString())
        : String(post.publishedAt ?? ""),
    updatedAt: new Date().toISOString(),
  };

  if (clean.sections.length === 0) return { error: "Add at least one article section." };
  return { post: clean };
}
