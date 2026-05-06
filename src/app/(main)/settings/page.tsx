import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import SettingsPage from "./settings-dynamic";

export const metadata: Metadata = {
  title: "Workspace settings for speed and control",
  description:
    "Manage appearance, sign-in, and cloud sync so your team can work faster with reliable SKU mapping and seamless dispatch workflows.",
  alternates: { canonical: `${getSiteUrl()}/settings` },
};

export default function SettingsRoutePage() {
  return <SettingsPage />;
}
