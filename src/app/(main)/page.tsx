import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/seo/site-url";

import { MainHomeClient } from "./main-home-client";

export const metadata: Metadata = {
  title: "Tulmin · Meesho operations SaaS for ecommerce operators",
  description:
    "Tulmin is built for ecommerce operators, especially Meesho teams. Filter labels by SKU, courier partner, and quantity, then export only what your dispatch team ships.",
  alternates: { canonical: `${getSiteUrl()}/` },
};

export default function HomePage() {
  return <MainHomeClient />;
}
