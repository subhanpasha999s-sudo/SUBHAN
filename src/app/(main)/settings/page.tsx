import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import SettingsPage from "./settings-dynamic";

export const metadata: Metadata = {
  title: "Workspace settings",
  description:
    "Label preferences, account and sync options for your Meesho label PDF and SKU mapping workspace.",
  alternates: { canonical: `${getSiteUrl()}/settings` },
};

export default function SettingsRoutePage() {
  return <SettingsPage />;
}
