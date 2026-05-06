import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Label PDF workflow",
  description:
    "Alias route into the Meesho label PDF workspace—process shipping labels, apply SKU mapping, and export.",
  alternates: { canonical: `${getSiteUrl()}/export-labels` },
};

export default function ProcessLayout({ children }: { children: ReactNode }) {
  return children;
}
