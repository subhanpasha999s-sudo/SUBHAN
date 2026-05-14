import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Root URL opens the right workspace for the active host. */
export default async function HomePage() {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();

  if (host === "admin.tulmin.com") {
    redirect("/admin/blogs");
  }

  redirect("/export-labels");
}
