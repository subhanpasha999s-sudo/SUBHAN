import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { AccountPageClient } from "./account-page-client";

export const metadata: Metadata = {
  title: "Account",
  description:
    "Your Tulmin profile, sign-in email, password, and session — separate from workspace appearance and data controls.",
  alternates: { canonical: `${getSiteUrl()}/account` },
};

export default function AccountRoutePage() {
  return <AccountPageClient />;
}
