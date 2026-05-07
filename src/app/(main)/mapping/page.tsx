import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MappingBody } from "./mapping-body";

export const metadata: Metadata = {
  title: "SKU Mapping · Tulmin for Meesho sellers",
  description:
    "Link listing SKUs to masters once—then Tulmin speeds up every label run. Fewer corrections, faster Meesho dispatch.",
  alternates: { canonical: `${getSiteUrl()}/mapping` },
  keywords: ["Meesho SKU map", "listing to master SKU", "inventory group SKU"],
};

export default function SkuMappingPage() {
  return <MappingBody />;
}
