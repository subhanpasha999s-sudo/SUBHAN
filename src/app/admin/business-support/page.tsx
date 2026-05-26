import { redirect } from "next/navigation";

import { AdminBusinessSupportDashboard } from "@/components/admin/admin-business-support-dashboard";
import { getAdminFromSessionCookie } from "@/lib/admin/server-session";

export const dynamic = "force-dynamic";

export default async function AdminBusinessSupportPage() {
  const admin = await getAdminFromSessionCookie();
  if (!admin) redirect("/admin/login");

  return <AdminBusinessSupportDashboard />;
}
