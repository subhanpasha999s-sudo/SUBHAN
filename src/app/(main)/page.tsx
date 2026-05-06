import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MainHomeClient } from "./main-home-client";

export const metadata: Metadata = {
  title: "Premium label operations for faster fulfillment",
  description:
    "Run your daily label workflow in minutes: import once, filter by mapped SKU and courier, and export clean bundles that help your team pack faster with fewer mistakes.",
  alternates: { canonical: `${getSiteUrl()}/` },
};

export default function HomePage() {
  return <MainHomeClient />;
}
