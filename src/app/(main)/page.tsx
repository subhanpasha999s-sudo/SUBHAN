import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MainHomeClient } from "./main-home-client";

export const metadata: Metadata = {
  title: "Meesho label PDF & courier-friendly export",
  description:
    "Open Label directly on the homepage: workspace for Meesho label PDF extraction, SKU mapping–aware filters (Delhivery, Shadowfax, other partners on the PDF), grouped export, and selected-page downloads.",
  alternates: { canonical: `${getSiteUrl()}/` },
};

export default function HomePage() {
  return <MainHomeClient />;
}
