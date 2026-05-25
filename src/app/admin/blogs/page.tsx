import { redirect } from "next/navigation";

import { BlogCmsWorkspace } from "@/components/admin/blog-cms-workspace";
import { getAdminFromSessionCookie } from "@/lib/admin/server-session";

export const dynamic = "force-dynamic";

export default async function AdminBlogsPage() {
  const admin = await getAdminFromSessionCookie();
  if (!admin) redirect("/admin/login");

  return <BlogCmsWorkspace />;
}
