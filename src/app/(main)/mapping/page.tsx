import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MappingBody } from "./mapping-body";

export const metadata: Metadata = {
  title: "Meesho listing SKU ↔ master SKU mapping",
  description:
    "Maintain your Meesho listing SKU → warehouse / group SKU maps with sync-friendly workflows so labels and exports resolve to the mapped SKUs sellers expect.",
  alternates: { canonical: `${getSiteUrl()}/mapping` },
  keywords: ["Meesho SKU map", "listing to master SKU", "inventory group SKU"],
};

export default function SkuMappingPage() {
  return <MappingBody />;
}
