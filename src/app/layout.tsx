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
  "meesho label crop",
  "meesho label cropper",
  "crop meesho label",
  "meesho label cutter",
  "meesho label crop tool",
  "meesho label crop free",
  "meesho label crop online",
  "meesho label crop pdf",
  "meesho label crop 4x6",
  "meesho label crop with invoice",
  "meesho label print",
  "meesho label cropping",
  "meesho label printer",
  "meesho label size",
  "quick meesho label crop",
  "meesho label crop a4",
  "meesho label generator",
  "Meesho label PDF",
  "Meesho ecommerce operator",
  "Meesho operations tool",
  "ecommerce operator tool",
  "ecommerce dispatch tool",
  "Meesho seller tools",
  "Meesho shipping label export",
  "bulk label filtering",
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
    default: "Tulmin · Meesho label SaaS for ecommerce operators",
    template: "%s · Tulmin",
  },
  description:
    "Tulmin is a SaaS for ecommerce operators, especially Meesho teams. Filter shipment labels by SKU, courier partner, and quantity, then export only what dispatch needs.",
  keywords: SEO_KEYWORDS,
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: siteUrl,
    siteName: "Tulmin",
    title: "Tulmin · Meesho label SaaS for ecommerce operators",
    description:
      "Built for ecommerce operators, especially Meesho dispatch teams. Filter, organize, and export only the labels you need.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tulmin · Meesho label SaaS for operators",
    description:
      "Turn hours of label work into minutes. Filter by SKU, courier partner, and quantity, then export the exact set for dispatch.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/tulmin-favicon.svg?v=1", type: "image/svg+xml", sizes: "any" },
      { url: "/tulmin-favicon-64.png?v=1", type: "image/png", sizes: "64x64" },
    ],
    shortcut: [{ url: "/tulmin-favicon-64.png?v=1", type: "image/png" }],
    apple: [
      { url: "/apple-touch-icon.png?v=1", sizes: "180x180", type: "image/png" },
    ],
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
      name: "Tulmin",
      url: siteUrl,
      description:
        "Tulmin SaaS for ecommerce operators, especially Meesho: label filtering, courier-aware exports, and SKU mapping.",
      inLanguage: "en-IN",
    },
    {
      "@type": "SoftwareApplication",
      name: "Tulmin",
      url: siteUrl,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (web browser)",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
      description:
        "Tulmin helps ecommerce operators (especially Meesho teams) upload label PDFs, filter by mapped SKU/courier/qty, and export pages for dispatch.",
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
  const faviconBoot = `(function(){try{var href="/tulmin-favicon-64.png?v=1";document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(function(el){el.parentNode&&el.parentNode.removeChild(el)});["icon","shortcut icon"].forEach(function(rel){var link=document.createElement("link");link.rel=rel;link.type="image/png";link.sizes="64x64";link.href=href;document.head.appendChild(link)});var svg=document.createElement("link");svg.rel="icon";svg.type="image/svg+xml";svg.sizes="any";svg.href="/tulmin-favicon.svg?v=1";document.head.appendChild(svg);var apple=document.createElement("link");apple.rel="apple-touch-icon";apple.sizes="180x180";apple.href="/apple-touch-icon.png?v=1";document.head.appendChild(apple);}catch(e){}})();`;

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn("font-sans", geistSans.variable)}
      suppressHydrationWarning
    >
      <body
        className={cn(geistMono.variable, "min-h-screen font-sans antialiased")}
        suppressHydrationWarning
      >
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBoot}
        </Script>
        <Script id="favicon-boot" strategy="beforeInteractive">
          {faviconBoot}
        </Script>
        <Script
          id="seo-jsonld"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_JSON_LD) }}
        />
        {process.env.VERCEL_GIT_COMMIT_SHA ? (
          <span
            aria-hidden
            className="hidden"
            data-vercel-deployment-sha={process.env.VERCEL_GIT_COMMIT_SHA}
            suppressHydrationWarning
          />
        ) : null}
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
