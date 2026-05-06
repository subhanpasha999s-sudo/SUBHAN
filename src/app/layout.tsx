import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

import { getSiteUrl } from "@/lib/seo/site-url";
import { THEME_STORAGE_KEY } from "@/lib/theme/constants";
import { cn } from "@/lib/utils";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const siteUrl = getSiteUrl();

const SEO_KEYWORDS = [
  "Meesho labels",
  "Meesho label PDF",
  "Meesho seller tools",
  "Meesho shipping label export",
  "Meesho courier label",
  "Delhivery label PDF",
  "Shadowfax label",
  "e-commerce fulfilment labels",
  "SKU mapping",
  "listing SKU to master SKU",
  "label PDF splitter",
];

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Label · Meesho labels, courier PDF export & SKU mapping",
    template: "%s · Label",
  },
  description:
    "Tools for Indian e‑commerce sellers: parse Meesho label PDFs, filter by mapped SKU, qty and courier, map listing SKUs to group SKUs, and export grouped or selected pages—all in your browser.",
  keywords: SEO_KEYWORDS,
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: siteUrl,
    siteName: "Label",
    title: "Label · Meesho label PDF & SKU mapping",
    description:
      "Parse Meesho shipping label PDFs, filter exports, SKU mapping for sellers and fulfilment workflows.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Label · Meesho label PDF & SKU mapping",
    description:
      "Meesho label PDF tools—mapped SKU filters, courier columns, grouped export, secure sync.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

const SCHEMA_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Label",
      url: siteUrl,
      description:
        "Browser toolkit for Meesho label PDFs, courier-aware exports, and listing-to-master SKU mapping.",
      inLanguage: "en-IN",
    },
    {
      "@type": "SoftwareApplication",
      name: "Label",
      url: siteUrl,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (web browser)",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
      description:
        "Free web workspace to upload Meesho label PDFs, filter by mapped SKU and courier, sync SKU mappings, and export labelled pages for dispatch.",
    },
  ],
};

/** Correct scaling + notch/safe-area on phones and tablets — avoids inconsistent mobile layout. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeBoot = `(function(){try{var k=${JSON.stringify(
    THEME_STORAGE_KEY
  )};var p=localStorage.getItem(k)||"system";var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

  return (
    <html lang="en" className={cn("font-sans", geistSans.variable)} suppressHydrationWarning>
      <body
        className={cn(geistMono.variable, "min-h-screen font-sans antialiased")}
        suppressHydrationWarning
      >
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBoot}
        </Script>
        <Script
          id="seo-jsonld"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_JSON_LD) }}
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
