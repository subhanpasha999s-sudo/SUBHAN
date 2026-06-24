import { headers } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ScrollyLanding from "@/components/landing/scrolly-landing";
import { getSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Tulmin · Dispatch + Books for Meesho, Flipkart & Amazon sellers",
  description:
    "One workspace for marketplace sellers: Filter & auto-crop shipping labels, then run your books — orders, payouts, P&L, bank reconciliation, GST and inventory. Two apps, one login.",
  alternates: { canonical: `${getSiteUrl()}/` },
  keywords: [
    "Tulmin",
    "marketplace label filter",
    "auto crop labels",
    "meesho accounting",
    "meesho profit calculator",
    "payout reconciliation",
    "ecommerce dispatch software",
    "seller bookkeeping",
  ],
  openGraph: {
    title: "Tulmin · Dispatch + Books for marketplace sellers",
    description:
      "Filter & auto-crop labels, then run your accounting — orders, payouts, P&L, bank reconciliation, GST. One workspace, one login.",
    url: `${getSiteUrl()}/`,
    type: "website",
  },
};

/** Admin host opens the command center; everyone else gets the product landing. */
export default async function HomePage() {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();
  if (host === "admin.tulmin.com") redirect("/admin/login");
  return <ScrollyLanding />;
}
