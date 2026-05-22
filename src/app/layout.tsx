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
  "label filter software",
  "meesho label filter",
  "meesho label cropper",
  "meesho sku filter",
  "amazon shipping label software",
  "amazon invoice label matcher",
  "flipkart label sorter",
  "flipkart label filter",
  "shipping label automation",
  "shipping label crop tool",
  "ecommerce dispatch software",
  "courier-wise label sorter",
  "sku-wise label sorting",
  "quantity-wise label filtering",
  "payment mode label filtering",
  "marketplace-wise label filtering",
  "warehouse dispatch management",
  "shipment segregation software",
  "order dispatch automation",
  "ecommerce warehouse tools",
  "bulk label processing",
  "auto shipping label detection",
  "auto tax invoice detection",
  "wrong shipment prevention",
  "quantity mismatch prevention",
  "Meesho label filtering",
  "Flipkart label filter",
  "Amazon shipping label filtering",
];

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Tulmin · Label Filter Software for Meesho, Flipkart & Amazon Sellers",
    template: "%s · Tulmin",
  },
  description:
    "Tulmin is label filter software for Meesho, Flipkart, and Amazon sellers. Filter labels by SKU, quantity, courier, marketplace, and COD or prepaid payment mode, then crop and export clean dispatch PDFs.",
  keywords: SEO_KEYWORDS,
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: siteUrl,
    siteName: "Tulmin",
    title: "Tulmin · Ecommerce Shipping Label Filter Software",
    description:
      "Tulmin is label filter software for Meesho, Flipkart, and Amazon sellers. Filter by SKU, quantity, courier, marketplace, and payment mode, then crop and export clean dispatch PDFs.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tulmin · Label Filter Software for Marketplace Sellers",
    description:
      "Tulmin helps Meesho, Flipkart, and Amazon sellers filter, crop, sort, and export clean dispatch-ready label PDFs.",
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
        "Tulmin is ecommerce shipping label software for Meesho, Flipkart, and Amazon sellers who need SKU-wise sorting, courier-wise segregation, label cropping, and faster warehouse dispatch.",
      inLanguage: "en-IN",
    },
    {
      "@type": "SoftwareApplication",
      name: "Tulmin",
      url: siteUrl,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (web browser)",
      featureList: [
        "Meesho label filtering",
        "Flipkart label filtering",
        "Amazon shipping label filtering",
        "SKU-wise label sorting",
        "Quantity-wise label filtering",
        "Courier-wise label segregation",
        "COD and prepaid payment mode filtering",
        "Auto shipping label detection",
        "Auto tax invoice detection",
        "Amazon invoice and shipping label matching",
        "Bulk label processing",
        "Auto crop shipping labels",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
      description:
        "Tulmin helps Indian ecommerce dispatch teams upload marketplace label PDFs, filter by SKU, quantity, payment, courier, and marketplace, crop shipping labels or invoices, and export clean PDF or ZIP files.",
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What does Tulmin do?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Tulmin filters, sorts, crops, and exports Meesho, Flipkart, and Amazon shipping labels for ecommerce dispatch teams.",
          },
        },
        {
          "@type": "Question",
          name: "Can Tulmin filter labels by SKU, quantity, courier, marketplace, and payment mode?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Tulmin supports SKU-wise sorting, quantity-wise filtering, courier-wise segregation, marketplace-wise filtering, and COD or prepaid payment mode filtering.",
          },
        },
        {
          "@type": "Question",
          name: "Does Tulmin handle Amazon invoices and shipping labels?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Tulmin can match Amazon tax invoice pages with shipping label pages using Order ID, extract SKU and quantity, and keep labels ready for dispatch.",
          },
        },
      ],
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
