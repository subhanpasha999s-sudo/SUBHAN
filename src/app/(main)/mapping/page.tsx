import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MappingBody } from "./mapping-body";

export const metadata: Metadata = {
  title: "SKU mapping for Meesho ecommerce operators",
  description:
    "Built for ecommerce operations teams, especially Meesho. Map listing SKUs to master SKUs once, then run faster and cleaner label dispatch every day.",
  alternates: { canonical: `${getSiteUrl()}/mapping` },
  keywords: [
    "Meesho SKU map",
    "listing to master SKU",
    "ecommerce SKU mapping",
    "Meesho operations SKU mapping",
    "inventory group SKU",
  ],
};

export default function SkuMappingPage() {
  return <MappingBody />;
}
