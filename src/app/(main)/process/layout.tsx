import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Tulmin dispatch workflow",
  description:
    "Alias into Tulmin—filter Meesho label PDFs, match SKUs, and download only what you ship.",
  alternates: { canonical: `${getSiteUrl()}/export-labels` },
};

export default function ProcessLayout({ children }: { children: ReactNode }) {
  return children;
}
