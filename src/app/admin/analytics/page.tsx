import { redirect } from "next/navigation";

import { AdminAnalyticsDashboard } from "@/components/admin/admin-analytics-dashboard";
import { getAdminFromSessionCookie } from "@/lib/admin/server-session";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const admin = await getAdminFromSessionCookie();
  if (!admin) redirect("/admin/login");

  return <AdminAnalyticsDashboard />;
}
