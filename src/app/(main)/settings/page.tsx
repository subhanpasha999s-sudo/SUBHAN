import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";
import { SettingsPageClient } from "./settings-page-client";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Theme and local or cloud data control for Tulmin. Profile and sign-in are under Account.",
  alternates: { canonical: `${getSiteUrl()}/settings` },
};

export default function SettingsRoutePage() {
  return <SettingsPageClient />;
}
