import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MappingBody } from "./mapping-body";

export const metadata: Metadata = {
  title: "SKU mapping that keeps every dispatch aligned",
  description:
    "Map listing SKUs to master SKUs once and let every export stay consistent. Cut repeated corrections, reduce mapping errors, and keep operations smooth across your team.",
  alternates: { canonical: `${getSiteUrl()}/mapping` },
  keywords: ["Meesho SKU map", "listing to master SKU", "inventory group SKU"],
};

export default function SkuMappingPage() {
  return <MappingBody />;
}
