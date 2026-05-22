import { BLOG_POSTS, type BlogPost, type BlogCategory, BLOG_CATEGORIES } from "@/lib/blog/posts";
import { getSupabaseRouteHandler } from "@/lib/supabase/server-admin";

type BlogRow = {
  id?: string;
  slug: string;
  title: string;
  seo_title?: string | null;
  meta_description?: string | null;
  content?: Record<string, unknown> | null;
  featured_image?: string | null;
  status: "draft" | "published";
  author?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
};

const categorySet = new Set<string>(BLOG_CATEGORIES);

function isCategory(value: unknown): value is BlogCategory {
  return typeof value === "string" && categorySet.has(value);
}

function rowToPost(row: BlogRow): BlogPost | null {
  const content = (row.content ?? {}) as Partial<BlogPost> & { deleted?: boolean };
  if (content.deleted) return null;
  if (!row.slug || !row.title) return null;

  return {
    ...content,
    id: row.id ?? content.id,
    slug: row.slug,
    title: row.title,
    description: content.description ?? row.meta_description ?? "",
    seoTitle: content.seoTitle ?? row.seo_title ?? undefined,
    category: isCategory(content.category) ? content.category : "Label Filtering",
    readTime: content.readTime ?? "5 min read",
    publishedOn:
      content.publishedOn ??
      row.published_at?.slice(0, 10) ??
      row.updated_at?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
    status: row.status,
    featuredImage: content.featuredImage ?? row.featured_image ?? undefined,
    coverImage: content.coverImage ?? row.featured_image ?? "",
    metaTitle: content.metaTitle ?? row.seo_title ?? undefined,
    metaDescription: content.metaDescription ?? row.meta_description ?? undefined,
    ogImage: content.ogImage ?? row.featured_image ?? undefined,
    author: content.author ?? row.author ?? undefined,
    createdAt: content.createdAt ?? row.created_at ?? undefined,
    updatedAt: content.updatedAt ?? row.updated_at ?? undefined,
    publishedAt: content.publishedAt ?? row.published_at ?? undefined,
    scheduledFor: content.scheduledFor ?? "",
    tagSlugs: content.tagSlugs ?? [],
    trending: Boolean(content.trending),
    featured: Boolean(content.featured),
    keywords: Array.isArray(content.keywords) ? content.keywords : [],
    sections: Array.isArray(content.sections) ? content.sections : [],
    faqs: Array.isArray(content.faqs) ? content.faqs : [],
    ctaLabel: content.ctaLabel ?? "Start Using Tulmin",
  };
}

async function readBlogRows() {
  const supabase = getSupabaseRouteHandler();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("blogs")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Blog database is not ready: ${error.message}`);
  return (data ?? []) as BlogRow[];
}

export async function getLiveBlogPosts(options: { includeDrafts?: boolean; throwOnError?: boolean } = {}) {
  let rows: BlogRow[] | null = null;
  try {
    rows = await readBlogRows();
  } catch (error) {
    if (options.throwOnError) throw error;
    rows = null;
  }
  if (!rows) {
    return options.includeDrafts ? BLOG_POSTS : BLOG_POSTS.filter((post) => post.status !== "draft");
  }

  const livePosts = rows.map(rowToPost).filter(Boolean) as BlogPost[];
  const deletedSlugs = new Set(
    rows
      .filter((row) => ((row.content ?? {}) as { deleted?: boolean }).deleted)
      .map((row) => row.slug),
  );
  const liveSlugs = new Set(livePosts.map((post) => post.slug));
  const staticPosts = BLOG_POSTS.filter(
    (post) => !liveSlugs.has(post.slug) && !deletedSlugs.has(post.slug),
  );
  const merged = [...livePosts, ...staticPosts];
  return merged
    .filter((post) => options.includeDrafts || post.status === "published" || !post.status)
    .sort((a, b) => (b.updatedAt ?? b.publishedOn).localeCompare(a.updatedAt ?? a.publishedOn));
}

export async function getLiveBlogPostBySlug(slug: string) {
  return (await getLiveBlogPosts()).find((post) => post.slug === slug);
}

export async function getLiveRelatedBlogPosts(slug: string, category: BlogCategory, limit = 3) {
  return (await getLiveBlogPosts())
    .filter((post) => post.slug !== slug)
    .sort((a, b) => {
      if (a.category === category && b.category !== category) return -1;
      if (b.category === category && a.category !== category) return 1;
      return b.publishedOn.localeCompare(a.publishedOn);
    })
    .slice(0, limit);
}

export async function saveLiveBlogPost(post: BlogPost & { status: "draft" | "published" }) {
  const supabase = getSupabaseRouteHandler();
  if (!supabase) throw new Error("Supabase service role is required for live blog publishing.");

  const publishedAt =
    post.status === "published" ? post.publishedAt || new Date().toISOString() : post.publishedAt || null;
  const content = {
    ...post,
    publishedAt: publishedAt ?? "",
    updatedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("blogs")
    .upsert(
      {
        slug: post.slug,
        title: post.title,
        seo_title: post.seoTitle ?? post.metaTitle ?? post.title,
        meta_description: post.metaDescription ?? post.description,
        content,
        featured_image: post.featuredImage ?? post.coverImage ?? post.ogImage ?? null,
        status: post.status,
        author: post.author ?? null,
        published_at: publishedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Live publish failed: ${error.message}`);
  return rowToPost(data as BlogRow);
}

export async function deleteLiveBlogPost(slug: string) {
  const supabase = getSupabaseRouteHandler();
  if (!supabase) throw new Error("Supabase service role is required for live blog deletion.");
  const now = new Date().toISOString();
  const { error } = await supabase.from("blogs").upsert(
    {
      slug,
      title: `Deleted: ${slug}`,
      content: { deleted: true, slug, updatedAt: now },
      status: "draft",
      updated_at: now,
    },
    { onConflict: "slug" },
  );
  if (error) throw new Error(`Live delete failed: ${error.message}`);
}
