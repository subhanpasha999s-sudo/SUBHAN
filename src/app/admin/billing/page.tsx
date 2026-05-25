import { redirect } from "next/navigation";

import { AdminBillingDashboard } from "@/components/admin/admin-billing-dashboard";
import { getAdminFromSessionCookie } from "@/lib/admin/server-session";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  const admin = await getAdminFromSessionCookie();
  if (!admin) redirect("/admin/login");

  return <AdminBillingDashboard />;
}
