import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Tulmin marketplace label dispatch workflow",
  description:
    "Upload Meesho, Flipkart, and Amazon label PDFs, filter by SKU, quantity, courier, payment mode, and marketplace, then export clean dispatch-ready files.",
  alternates: { canonical: `${getSiteUrl()}/export-labels` },
};

export default function ProcessLayout({ children }: { children: ReactNode }) {
  return children;
}
