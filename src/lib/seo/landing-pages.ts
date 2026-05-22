import { getSiteUrl } from "@/lib/seo/site-url";

export type SeoLandingPage = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  primaryKeyword: string;
  keywords: string[];
  sections: { h2: string; body: string; bullets: string[] }[];
  faqs: { q: string; a: string }[];
};

export const SEO_LANDING_PAGES: SeoLandingPage[] = [
  {
    slug: "meesho-label-filter",
    title: "Meesho Label Filter AI for SKU, QTY, Courier & COD Orders",
    description:
      "Use Tulmin AI to filter Meesho shipping labels by SKU, quantity, courier partner, payment mode, and marketplace. Auto-crop labels and reduce wrong shipment risk.",
    h1: "Meesho label filter for faster dispatch",
    eyebrow: "Meesho label filtering",
    intro:
      "Tulmin AI helps Meesho sellers turn bulk label PDFs into clean dispatch batches by SKU, quantity, courier partner, and COD or prepaid payment mode.",
    primaryKeyword: "meesho label filter",
    keywords: ["meesho label filter AI", "meesho label filter", "meesho sku filter", "meesho label cropper", "meesho seller productivity"],
    sections: [
      {
        h2: "Find the exact Meesho labels your packing table needs",
        body:
          "Instead of scrolling through hundreds of pages, sellers can filter Meesho labels by listing SKU, mapped SKU, quantity, courier, and payment type before printing.",
        bullets: ["SKU-wise label sorting", "Quantity mismatch prevention", "Courier-wise dispatch batches"],
      },
      {
        h2: "Auto-crop Meesho shipping labels and tax invoices",
        body:
          "Tulmin AI detects the shipping label area and invoice area so teams can export clean print-ready PDFs without manual PDF editing.",
        bullets: ["Auto shipping label detection", "Auto tax invoice detection", "Clean PDF or ZIP export"],
      },
    ],
    faqs: [
      { q: "Can Tulmin AI filter Meesho labels by SKU?", a: "Yes. Tulmin AI filters Meesho labels by listing SKU, mapped SKU, quantity, courier partner, marketplace, and payment mode." },
      { q: "Does Tulmin AI crop Meesho shipping labels?", a: "Yes. Tulmin AI can auto-detect and crop Meesho shipping label or tax invoice areas." },
    ],
  },
  {
    slug: "amazon-shipping-label-filter",
    title: "Amazon Shipping Label Filter AI with Invoice Matching and SKU QTY Extraction",
    description:
      "Use Tulmin AI to filter Amazon shipping labels, match tax invoices by Order ID, extract SKU and quantity, and prepare dispatch-ready label PDFs.",
    h1: "Amazon shipping label filter with invoice matching",
    eyebrow: "Amazon label workflow",
    intro:
      "Tulmin AI helps Amazon sellers identify shipping labels, match tax invoice pages using Order ID, extract SKU and quantity, and keep dispatch labels easier to verify.",
    primaryKeyword: "amazon shipping label AI",
    keywords: ["amazon shipping label AI", "amazon shipping label filter AI", "amazon invoice label matcher", "amazon label filter", "amazon SKU QTY label"],
    sections: [
      {
        h2: "Match Amazon shipping labels with invoices",
        body:
          "Amazon label files often include a shipping page and a separate invoice page. Tulmin AI reads order details and keeps the workflow connected for dispatch.",
        bullets: ["Order ID / Order Number matching", "Tax invoice detection", "Shipping label page handling"],
      },
      {
        h2: "Extract SKU and quantity for faster packing",
        body:
          "Tulmin extracts SKU and quantity from available Amazon invoice/order data and prints useful SKU + QTY context on matching shipping labels.",
        bullets: ["Auto SKU extraction", "Quantity visibility", "Wrong shipment prevention"],
      },
    ],
    faqs: [
      { q: "Does Tulmin AI tightly crop Amazon labels?", a: "No. Amazon shipping labels stay in the full usable format while invoice pages can be skipped or matched when needed." },
      { q: "Can Tulmin AI match Amazon invoice and shipping label pages?", a: "Yes. Tulmin AI matches them using Order ID or Order Number where available." },
    ],
  },
  {
    slug: "flipkart-label-filter",
    title: "Flipkart Label Filter AI and Sorter for SKU, QTY, Courier and Payment",
    description:
      "Use Tulmin AI to sort Flipkart labels by SKU, quantity, courier, marketplace, and COD or prepaid payment mode. Auto-crop clean shipping label output.",
    h1: "Flipkart label filter and sorter for dispatch teams",
    eyebrow: "Flipkart label sorting",
    intro:
      "Tulmin AI helps Flipkart sellers filter, sort, auto-crop, and export dispatch-ready label PDFs without manually separating courier or SKU batches.",
    primaryKeyword: "flipkart label sorter",
    keywords: ["flipkart label filter AI", "flipkart label sorter", "flipkart label filter", "shipping label crop tool", "ecommerce dispatch software"],
    sections: [
      {
        h2: "Sort Flipkart labels before printing",
        body:
          "Dispatch teams can filter Flipkart labels by SKU, quantity, courier, and payment type to reduce packing confusion.",
        bullets: ["SKU-wise sorting", "COD / prepaid filtering", "Courier-wise label segregation"],
      },
      {
        h2: "Crop only the useful label area",
        body:
          "Tulmin AI detects Flipkart shipping label areas and removes unnecessary page space so exported labels stay clean for printing.",
        bullets: ["Auto label crop", "Barcode and QR visibility", "Bulk PDF export"],
      },
    ],
    faqs: [
      { q: "Can Tulmin AI remove extra white space from Flipkart labels?", a: "Yes. Tulmin AI auto-detects the useful Flipkart shipping label area for cleaner exports." },
      { q: "Can Flipkart labels be filtered by COD or prepaid?", a: "Yes. Tulmin AI supports payment mode filtering where the label data is detected." },
    ],
  },
  {
    slug: "sku-wise-label-sorting",
    title: "SKU-wise Label Sorting AI for Marketplace Dispatch Teams",
    description:
      "Use Tulmin AI to sort Meesho, Flipkart, and Amazon shipping labels by listing SKU or mapped SKU to prevent wrong shipments and speed warehouse dispatch.",
    h1: "SKU-wise label sorting for ecommerce dispatch",
    eyebrow: "SKU label sorting",
    intro:
      "Tulmin AI helps sellers find every label for a product, group listing SKUs under master SKUs, and export only the labels needed for each packing lane.",
    primaryKeyword: "sku-wise label sorting",
    keywords: ["AI SKU label sorting", "sku-wise label sorting", "meesho sku filter", "shipment segregation software", "wrong shipment prevention"],
    sections: [
      {
        h2: "Stop searching labels by hand",
        body:
          "SKU-wise sorting helps packers work on one product group at a time instead of opening the same PDF again and again.",
        bullets: ["Listing SKU search", "Master SKU grouping", "Selected label export"],
      },
      {
        h2: "Reduce SKU mismatch during dispatch",
        body:
          "When labels are grouped by SKU before printing, similar products are less likely to get swapped during packing.",
        bullets: ["Wrong shipment prevention", "Cleaner handoff", "Faster packing queues"],
      },
    ],
    faqs: [
      { q: "What is SKU-wise label sorting?", a: "It means grouping shipping labels by SKU or mapped master SKU before printing and dispatch." },
      { q: "Does Tulmin AI support SKU mapping?", a: "Yes. Tulmin AI supports marketplace SKU mapping so multiple listing SKUs can be grouped under one product name." },
    ],
  },
  {
    slug: "shipping-label-cropper",
    title: "Shipping Label Auto-Crop AI for Meesho, Flipkart and Amazon PDFs",
    description:
      "Use Tulmin AI to auto-detect and crop shipping labels or tax invoices from marketplace PDFs while keeping barcode, QR, AWB, SKU, and quantity readable.",
    h1: "Shipping label auto-crop AI for marketplace PDFs",
    eyebrow: "Auto-crop AI",
    intro:
      "Tulmin AI crops useful shipping label and invoice areas for Meesho, Flipkart, and Amazon workflows so dispatch teams can print cleaner files.",
    primaryKeyword: "shipping label crop tool",
    keywords: ["auto crop AI", "shipping label crop tool", "meesho label cropper", "auto crop shipping labels", "auto tax invoice detection"],
    sections: [
      {
        h2: "Detect shipping labels automatically",
        body:
          "Tulmin AI looks for label content like customer address, AWB, courier, barcode, QR, SKU, and quantity to prepare cleaner output.",
        bullets: ["Shipping label detection", "Barcode and QR readability", "Bulk label crop"],
      },
      {
        h2: "Crop invoices only when needed",
        body:
          "Users can export shipping labels only, tax invoices only, or matching label + invoice output depending on the marketplace workflow.",
        bullets: ["Tax invoice detection", "Amazon invoice matching", "PDF and ZIP download"],
      },
    ],
    faqs: [
      { q: "Does auto-crop AI reduce barcode quality?", a: "Tulmin AI keeps output as PDF and avoids unnecessary resolution reduction so barcode and QR code readability is preserved." },
      { q: "Can I crop only invoices?", a: "Yes. Tulmin AI supports auto-detect tax invoice output where invoice data is available." },
    ],
  },
  {
    slug: "courier-wise-label-segregation",
    title: "Courier-wise Label Segregation AI for Ecommerce Sellers",
    description:
      "Group labels by courier partner such as Delhivery, E-Kart, ATS, Shadowfax, and more before dispatch handoff.",
    h1: "Courier-wise label segregation for cleaner pickup handoff",
    eyebrow: "Courier label sorter",
    intro:
      "Tulmin AI helps dispatch teams separate labels by courier partner so pickup handoff becomes faster and less confusing.",
    primaryKeyword: "courier-wise label sorter",
    keywords: ["AI courier-wise label sorter", "courier-wise label sorter", "shipment segregation software", "warehouse dispatch management", "ecommerce warehouse tools"],
    sections: [
      {
        h2: "Group courier batches before printing",
        body:
          "Filter labels by courier partner to create cleaner print runs for Delhivery, E-Kart, ATS, Shadowfax, and other partners.",
        bullets: ["Courier partner filtering", "Pickup-ready batches", "Less handoff confusion"],
      },
      {
        h2: "Combine courier with SKU and quantity filters",
        body:
          "Courier-wise segregation becomes more powerful when it is combined with SKU-wise sorting and quantity-wise filtering.",
        bullets: ["Multi-filter workflow", "COD / prepaid split", "Dispatch productivity improvement"],
      },
    ],
    faqs: [
      { q: "Can Tulmin AI filter labels by courier?", a: "Yes. Tulmin AI supports courier-wise filtering for detected courier partners." },
      { q: "Why is courier-wise sorting useful?", a: "It keeps courier pickup handoff cleaner and reduces the chance of mixing parcels across partners." },
    ],
  },
  {
    slug: "warehouse-dispatch-productivity",
    title: "Warehouse Dispatch Productivity AI for Ecommerce Sellers",
    description:
      "Improve dispatch speed with Tulmin AI by filtering, sorting, cropping, and exporting marketplace shipping labels for Meesho, Flipkart, and Amazon.",
    h1: "Warehouse dispatch productivity for marketplace sellers",
    eyebrow: "Dispatch productivity",
    intro:
      "Tulmin AI helps ecommerce teams prepare exact dispatch files before printing starts, reducing label hunting, shipment mismatch, and packing delays.",
    primaryKeyword: "warehouse dispatch management",
    keywords: ["warehouse dispatch AI", "warehouse dispatch management", "ecommerce dispatch software", "order dispatch automation", "ecommerce warehouse tools"],
    sections: [
      {
        h2: "Make the dispatch file obvious",
        body:
          "Teams can upload marketplace PDFs once, then filter by the fields that matter for today’s packing queue.",
        bullets: ["Bulk label processing", "Live filter workflow", "Clean PDF or ZIP output"],
      },
      {
        h2: "Prevent quantity and SKU mistakes",
        body:
          "Quantity-wise filtering and SKU-wise sorting help sellers verify dispatch batches before labels reach packers.",
        bullets: ["Quantity mismatch prevention", "Wrong shipment prevention", "Faster dispatch table setup"],
      },
    ],
    faqs: [
      { q: "Is Tulmin AI a full warehouse management system?", a: "Tulmin AI is focused on marketplace shipping labels, filtering, auto-cropping, and export workflows for dispatch teams." },
      { q: "Can Tulmin AI handle bulk label files?", a: "Yes. Tulmin AI is built for bulk marketplace label processing in the browser with progress feedback." },
    ],
  },
];

export function getSeoLandingPage(slug: string) {
  return SEO_LANDING_PAGES.find((page) => page.slug === slug);
}

export function seoLandingCanonical(slug: string) {
  return `${getSiteUrl()}/${slug}`;
}
