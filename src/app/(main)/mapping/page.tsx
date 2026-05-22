import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MappingBody } from "./mapping-body";

export const metadata: Metadata = {
  title: "SKU Mapping for Meesho, Flipkart & Amazon Label Filtering",
  description:
    "Map marketplace listing SKUs to master SKUs once, then filter Meesho, Flipkart, and Amazon labels faster by product, quantity, courier, and dispatch queue.",
  alternates: { canonical: `${getSiteUrl()}/mapping` },
  keywords: [
    "SKU mapping",
    "sku-wise label sorting",
    "listing to master SKU",
    "ecommerce SKU mapping",
    "meesho sku filter",
    "flipkart SKU sorting",
    "amazon SKU extraction",
    "warehouse dispatch management",
  ],
};

export default function SkuMappingPage() {
  return <MappingBody />;
}
