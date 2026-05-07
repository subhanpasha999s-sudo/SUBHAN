import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MainHomeClient } from "./main-home-client";

export const metadata: Metadata = {
  title: "Tulmin · Meesho labels in minutes, not hours",
  description:
    "Tulmin is the premium Meesho label workspace: filter by SKU, courier, and quantity, export only what you dispatch—built for sellers who live on packing speed.",
  alternates: { canonical: `${getSiteUrl()}/` },
};

export default function HomePage() {
  return <MainHomeClient />;
}
