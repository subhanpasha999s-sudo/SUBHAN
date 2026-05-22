import { getSiteUrl } from "@/lib/seo/site-url";
import managedBlogPosts from "@/content/blog-posts.json";
import deletedBlogSlugs from "@/content/blog-deleted-slugs.json";

export const BLOG_CATEGORIES = [
  "Label Filtering",
  "SKU Management",
  "Courier Segregation",
  "Amazon Workflow",
  "Flipkart Workflow",
  "Meesho Workflow",
  "Warehouse Productivity",
  "Shipping Mistakes",
  "Label Cropping",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

type BlogSection = {
  heading: string;
  body: string;
};

type BlogFaq = {
  q: string;
  a: string;
};

export type BlogPost = {
  id?: string;
  slug: string;
  title: string;
  description: string;
  seoTitle?: string;
  category: BlogCategory;
  readTime: string;
  publishedOn: string;
  status?: "draft" | "published";
  featuredImage?: string;
  coverImage?: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  scheduledFor?: string;
  tagSlugs?: string[];
  trending?: boolean;
  featured?: boolean;
  richContent?: string;
  keywords: string[];
  sections: BlogSection[];
  faqs: BlogFaq[];
  ctaLabel?: string;
};

const CTA_DEFAULT =
  "Tulmin helps Meesho, Flipkart, and Amazon sellers filter, sort, crop, and export shipping labels by SKU, quantity, courier, marketplace, and payment mode so dispatch teams can work faster with fewer wrong shipments.";

const standardSections = (
  problem: string,
  why: string,
  workflow: string,
  result: string
): BlogSection[] => [
  { heading: "The dispatch problem", body: problem },
  { heading: "Why marketplace sellers face it", body: why },
  { heading: "A better workflow", body: workflow },
  { heading: "What improves on the warehouse floor", body: result },
  {
    heading: "Where Tulmin fits",
    body:
      "Tulmin fits after label PDF download. Sellers upload marketplace PDFs, filter by SKU, QTY, courier, payment mode, and marketplace, then export clean PDF or ZIP files for dispatch.",
  },
];

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "wrong-shipment-due-to-sku-mismatch",
    title: "How to Prevent Wrong Shipments Caused by SKU Mismatch",
    seoTitle: "Wrong Shipment Prevention with SKU-wise Label Sorting",
    description:
      "A practical SKU-wise label sorting workflow for Meesho, Flipkart, and Amazon sellers who want fewer wrong products shipped.",
    metaDescription:
      "Prevent wrong shipments with SKU-wise label sorting, mapped SKU workflows, quantity checks, and cleaner ecommerce dispatch label batches.",
    category: "Shipping Mistakes",
    readTime: "7 min read",
    publishedOn: "2026-05-22",
    trending: true,
    featured: true,
    keywords: ["wrong shipment prevention", "sku-wise label sorting", "meesho sku filter", "shipment segregation software"],
    sections: standardSections(
      "Wrong shipments usually happen when similar products, similar SKUs, or mixed marketplace labels reach the packing table together. A packer may pick the right product but attach the wrong shipping label.",
      "Meesho, Flipkart, and Amazon label PDFs are designed for download, not for warehouse packing order. When a single PDF contains many SKUs, staff spend too much time searching and verifying.",
      "Start by filtering labels by listing SKU or mapped SKU. Then use quantity and courier filters to create smaller, more obvious dispatch batches before printing.",
      "Packers see only the labels that belong to the product they are handling. This reduces label swaps, repeat PDF opening, and post-dispatch correction work."
    ),
    faqs: [
      { q: "What is the fastest way to reduce SKU mismatch?", a: "Filter and export labels SKU-wise before printing so each packing lane handles one clear product group." },
      { q: "Does SKU mapping help?", a: "Yes. Mapping marketplace listing SKUs to master SKUs helps teams group variations under the product names used inside the warehouse." },
    ],
  },
  {
    slug: "quantity-mismatch-during-ecommerce-dispatch",
    title: "How to Reduce Quantity Mismatch During Ecommerce Dispatch",
    seoTitle: "Quantity-wise Label Filtering to Prevent Dispatch Mismatch",
    description:
      "Learn how quantity-wise label filtering helps sellers separate single-quantity and multi-quantity orders before packing starts.",
    category: "Shipping Mistakes",
    readTime: "6 min read",
    publishedOn: "2026-05-22",
    keywords: ["quantity-wise label filtering", "quantity mismatch prevention", "ecommerce dispatch software", "warehouse dispatch management"],
    sections: standardSections(
      "Quantity mismatch happens when a label says Qty 2 or Qty 3 but the packing table treats it like a single-unit order. The mistake is small, but the return cost can be high.",
      "During busy dispatch windows, labels are often printed in bulk without separating quantity groups. Mixed quantity labels look similar unless staff check each one carefully.",
      "Filter labels by quantity before printing. Keep Qty 1, Qty 2, and higher quantity orders in separate print batches or packing queues.",
      "The packing team gets a clear visual queue for multi-quantity orders, which reduces missed units and makes final verification faster."
    ),
    faqs: [
      { q: "Should sellers filter labels by quantity every day?", a: "For bulk dispatch, yes. Quantity filtering is one of the simplest ways to prevent mismatch claims." },
      { q: "Can quantity filtering work with SKU filtering?", a: "Yes. The best workflow combines SKU, quantity, courier, marketplace, and payment mode filters." },
    ],
  },
  {
    slug: "meesho-label-filter-for-bulk-dispatch",
    title: "Meesho Label Filter Workflow for Bulk Dispatch Teams",
    description:
      "A Meesho label filtering workflow for SKU-wise sorting, courier-wise batches, COD/prepaid separation, and clean label cropping.",
    category: "Meesho Workflow",
    readTime: "7 min read",
    publishedOn: "2026-05-21",
    trending: true,
    keywords: ["meesho label filter", "meesho sku filter", "meesho label cropper", "meesho seller productivity"],
    sections: standardSections(
      "Meesho sellers often download large label PDFs and then spend time finding labels for a specific SKU, courier, or payment type.",
      "Bulk PDFs are not arranged according to each seller's warehouse lanes. That creates manual searching, mixed print runs, and packing delays.",
      "Upload the Meesho PDF, filter by SKU, quantity, payment mode, courier, and marketplace, then crop labels or invoices only when needed.",
      "The dispatch desk gets smaller, cleaner batches that are easier to print, verify, and hand over."
    ),
    faqs: [
      { q: "Can Meesho labels be filtered by courier?", a: "Yes. Tulmin supports courier-wise filtering where courier data is detected from the label." },
      { q: "Can Meesho shipping labels be cropped?", a: "Yes. Tulmin can auto-detect the shipping label area and tax invoice area." },
    ],
  },
  {
    slug: "flipkart-label-sorter-for-dispatch",
    title: "Flipkart Label Sorter: Cleaner SKU, Courier, and Payment Batches",
    description:
      "How Flipkart sellers can sort label PDFs by SKU, quantity, courier, COD/prepaid, and crop clean shipping labels for dispatch.",
    category: "Flipkart Workflow",
    readTime: "6 min read",
    publishedOn: "2026-05-21",
    keywords: ["flipkart label sorter", "flipkart label filter", "shipping label crop tool", "courier-wise label sorter"],
    sections: standardSections(
      "Flipkart labels may include shipping details, SKU information, payment mode, barcodes, and invoice-like sections in the same page. Manual sorting can be slow.",
      "Dispatch teams need the label content, but not the surrounding blank page space or mixed print order. Without sorting, packing lanes can get confused.",
      "Use filters for SKU, quantity, courier, marketplace, and payment mode. Then export clean shipping label output for the selected rows.",
      "The result is a smaller print file with labels grouped around the work your packers are actually doing."
    ),
    faqs: [
      { q: "Can Flipkart labels be cropped tightly?", a: "Yes. Tulmin detects the useful Flipkart label box and removes unnecessary page margins where possible." },
      { q: "Can Flipkart COD and prepaid orders be separated?", a: "Yes, payment mode filtering is supported where the label text is detected." },
    ],
  },
  {
    slug: "amazon-shipping-label-invoice-matching",
    title: "Amazon Shipping Label and Invoice Matching for Faster Packing",
    description:
      "Understand how Amazon sellers can handle separate shipping label and tax invoice pages using Order ID matching, SKU extraction, and quantity visibility.",
    category: "Amazon Workflow",
    readTime: "8 min read",
    publishedOn: "2026-05-21",
    trending: true,
    keywords: ["amazon shipping label software", "amazon invoice label matcher", "amazon shipping label filter", "auto SKU extraction"],
    sections: standardSections(
      "Amazon label files can include a shipping label page and a separate tax invoice page. The shipping page may not always show SKU and quantity clearly for packers.",
      "If invoice and label pages are handled separately, dispatch staff may need to open multiple pages just to confirm product and quantity.",
      "Match shipping labels and invoices using Order ID or Order Number. Extract SKU and quantity from invoice/order data, then keep the shipping label ready for dispatch.",
      "Packers see useful SKU and quantity context before shipping, reducing confusion and improving Amazon dispatch speed."
    ),
    faqs: [
      { q: "Does Amazon crop work the same as Flipkart?", a: "No. Amazon shipping labels usually stay in their full usable page format while separate invoice pages can be skipped or matched." },
      { q: "Can Tulmin print SKU and QTY on Amazon labels?", a: "Tulmin can extract SKU and quantity from matching invoice/order data and add useful SKU + QTY context to the shipping label workflow." },
    ],
  },
  {
    slug: "courier-wise-label-segregation-before-pickup",
    title: "Courier-wise Label Segregation Before Pickup Handoff",
    description:
      "Why ecommerce sellers should group Delhivery, E-Kart, ATS, Shadowfax, and other courier labels before printing and pickup.",
    category: "Courier Segregation",
    readTime: "5 min read",
    publishedOn: "2026-05-20",
    keywords: ["courier-wise label sorter", "courier-wise label segregation", "warehouse dispatch management", "shipment segregation software"],
    sections: standardSections(
      "Courier handoff becomes messy when every partner's labels are mixed in one print stack. Staff then sort at the worst possible time: during pickup rush.",
      "Marketplaces can assign different courier partners across one order batch, and each courier may have separate pickup or scan expectations.",
      "Filter labels by courier partner before printing. Combine courier filters with SKU, quantity, and payment mode when the warehouse needs more control.",
      "Courier-wise batches reduce handoff confusion, scanning disputes, and last-minute searching at the dispatch desk."
    ),
    faqs: [
      { q: "Which courier partners can be grouped?", a: "Tulmin groups detected courier names such as Delhivery, E-Kart, ATS, Shadowfax, and other partners present in label text." },
      { q: "Should courier filtering happen before or after SKU filtering?", a: "Use the order that matches your floor. Many teams filter by SKU first, then courier for pickup handoff." },
    ],
  },
  {
    slug: "shipping-label-crop-tool-for-marketplace-pdfs",
    title: "Shipping Label Crop Tool for Marketplace PDF Files",
    description:
      "How auto shipping label detection and tax invoice detection help ecommerce sellers print cleaner Meesho, Flipkart, and Amazon labels.",
    category: "Label Cropping",
    readTime: "6 min read",
    publishedOn: "2026-05-20",
    keywords: ["shipping label crop tool", "auto crop shipping labels", "auto tax invoice detection", "meesho label cropper"],
    sections: standardSections(
      "Marketplace PDFs often include extra blank space, invoices, or combined label sections that are not ideal for quick printing.",
      "Generic PDF crop tools do not understand dispatch fields like AWB, courier, SKU, quantity, barcode, QR code, or tax invoice blocks.",
      "Use auto-detect shipping label or auto-detect tax invoice depending on the output needed. Keep manual crop only as a fallback.",
      "The team downloads cleaner labels while keeping barcode and QR visibility intact for courier scans."
    ),
    faqs: [
      { q: "Can label cropping blur barcodes?", a: "A good workflow keeps output as PDF and avoids unnecessary resolution reduction so barcode and QR readability stays clear." },
      { q: "Can invoices be cropped separately?", a: "Yes. Tulmin supports tax invoice detection where invoice text and layout are available." },
    ],
  },
  {
    slug: "sku-wise-label-sorting-for-indian-sellers",
    title: "SKU-wise Label Sorting for Indian Ecommerce Sellers",
    description:
      "A practical guide to sorting Meesho, Flipkart, and Amazon labels by SKU or mapped SKU before print and dispatch.",
    category: "SKU Management",
    readTime: "6 min read",
    publishedOn: "2026-05-19",
    keywords: ["sku-wise label sorting", "meesho sku filter", "listing SKU to master SKU", "ecommerce warehouse tools"],
    sections: standardSections(
      "When one marketplace PDF contains many SKUs, packers lose time searching for the right page and checking product details manually.",
      "Marketplace listing SKUs may not match the product names used by your warehouse. That makes label preparation harder as the catalog grows.",
      "Create master SKU mapping, then filter labels by listing SKU or mapped SKU. Export the exact SKU batch needed for each packing line.",
      "SKU-wise sorting makes the dispatch file obvious, especially for repeated products, similar variants, and high-volume SKUs."
    ),
    faqs: [
      { q: "What is a mapped SKU?", a: "A mapped SKU connects marketplace listing SKUs to the master product name or SKU used inside the warehouse." },
      { q: "Can SKU sorting work across marketplaces?", a: "Yes. Tulmin is designed for Meesho, Flipkart, and Amazon label workflows." },
    ],
  },
  {
    slug: "payment-mode-filtering-cod-prepaid-orders",
    title: "COD and Prepaid Label Filtering for Dispatch Priority",
    description:
      "How payment mode filtering helps sellers separate COD and prepaid orders, prioritize urgent dispatch, and handle low-stock situations.",
    category: "Label Filtering",
    readTime: "5 min read",
    publishedOn: "2026-05-19",
    keywords: ["payment mode filtering", "COD prepaid label filter", "order dispatch automation", "ecommerce dispatch software"],
    sections: standardSections(
      "COD and prepaid orders sometimes need different dispatch handling. During low-stock situations, sellers may choose to prioritize prepaid orders first.",
      "If payment type is hidden inside a large label PDF, the team cannot quickly create the right dispatch queue.",
      "Filter labels by COD or prepaid payment mode, then combine that with SKU, quantity, marketplace, or courier filters.",
      "The packing team gets a practical queue that matches business priority instead of manually checking payment mode label by label."
    ),
    faqs: [
      { q: "Why filter COD and prepaid orders?", a: "Payment mode filtering helps sellers prioritize dispatch and avoid mixing different handling workflows." },
      { q: "Can payment filters combine with SKU filters?", a: "Yes. Multi-filter workflows are useful for urgent dispatch and stock-limited packing." },
    ],
  },
  {
    slug: "warehouse-dispatch-productivity-with-label-automation",
    title: "Warehouse Dispatch Productivity with Label Automation",
    description:
      "A simple workflow for faster ecommerce dispatch using label filtering, label cropping, SKU sorting, and courier segregation.",
    category: "Warehouse Productivity",
    readTime: "7 min read",
    publishedOn: "2026-05-18",
    keywords: ["warehouse dispatch management", "shipping label automation", "ecommerce warehouse tools", "bulk label processing"],
    sections: standardSections(
      "Most dispatch delays start before packing: teams are still opening PDFs, searching labels, checking quantity, and separating couriers manually.",
      "Manual label work does not scale smoothly beyond a few hundred shipments. The same mistakes repeat every day under time pressure.",
      "Use one workflow: upload PDFs, auto-detect marketplace data, filter by operational fields, crop if needed, then export clean dispatch files.",
      "The warehouse spends less time preparing labels and more time packing the right orders correctly."
    ),
    faqs: [
      { q: "Is label automation only for large sellers?", a: "No. Even small teams benefit once labels become repetitive or mixed across SKUs and couriers." },
      { q: "What should be automated first?", a: "Start with label filtering, SKU-wise sorting, quantity checks, and courier segregation." },
    ],
  },
  {
    slug: "bulk-label-processing-for-marketplace-sellers",
    title: "Bulk Label Processing for Meesho, Flipkart and Amazon Sellers",
    description:
      "How sellers can process hundreds or thousands of marketplace labels with live progress, filtering, cropping, and clean PDF exports.",
    category: "Label Filtering",
    readTime: "6 min read",
    publishedOn: "2026-05-18",
    keywords: ["bulk label processing", "label filter software", "shipping label automation", "ecommerce dispatch software"],
    sections: standardSections(
      "Large label PDFs can slow teams down when every export, crop, or filter action feels uncertain.",
      "Bulk batches need responsive progress feedback, efficient PDF export, and a workflow that does not force sellers into many small manual files.",
      "Use live import and export progress, filter large batches by the fields that matter, and export only the selected clean output.",
      "The dispatch team can trust the system during heavy work instead of wondering whether the browser is stuck."
    ),
    faqs: [
      { q: "Can label software handle large PDFs?", a: "It should show progress, keep the page responsive, and avoid unnecessary work for filtered exports." },
      { q: "Should large batches be split?", a: "Split only when it helps the dispatch workflow. The tool should still make large batches manageable." },
    ],
  },
  {
    slug: "marketplace-label-filter-software-buying-guide",
    title: "How to Choose Label Filter Software for Marketplace Dispatch",
    description:
      "A buying guide for Indian sellers comparing label filtering, SKU sorting, courier segregation, invoice matching, and label crop workflows.",
    category: "Label Filtering",
    readTime: "8 min read",
    publishedOn: "2026-05-17",
    keywords: ["label filter software", "ecommerce dispatch software", "shipping label automation", "ecommerce warehouse tools"],
    sections: standardSections(
      "Sellers often look for separate tools for label crop, SKU search, courier sorting, and PDF export. That creates more tabs and more manual work.",
      "Marketplace sellers need a dispatch workflow, not just a PDF utility. The software should understand Meesho, Flipkart, and Amazon label problems.",
      "Check for SKU-wise sorting, quantity-wise filtering, courier-wise segregation, COD/prepaid filtering, auto crop, tax invoice detection, and Amazon invoice matching.",
      "The right software makes the dispatch output obvious within seconds and helps teams avoid wrong shipment and quantity mismatch errors."
    ),
    faqs: [
      { q: "What is the most important feature in label filter software?", a: "Accurate filtering by SKU, quantity, courier, marketplace, and payment mode is the foundation." },
      { q: "Should the tool support multiple marketplaces?", a: "Yes, if your team sells on Meesho, Flipkart, and Amazon, one workflow is easier than separate tools." },
    ],
  },
];

export function getAllBlogPosts() {
  const managed = (managedBlogPosts as BlogPost[]).filter(
    (post) => post.slug && post.title && post.status === "published",
  );
  const managedSlugs = new Set(managed.map((post) => post.slug));
  const deleted = new Set(deletedBlogSlugs as string[]);
  return [
    ...managed,
    ...BLOG_POSTS.filter(
      (post) => !managedSlugs.has(post.slug) && !deleted.has(post.slug),
    ),
  ].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));
}

export function getFeaturedBlogPost() {
  const posts = getAllBlogPosts();
  return posts.find((p) => p.featured) ?? posts[0];
}

export function getBlogPostBySlug(slug: string) {
  return getAllBlogPosts().find((p) => p.slug === slug);
}

export function getRelatedBlogPosts(slug: string, category: BlogCategory, limit = 3) {
  return getAllBlogPosts()
    .filter((p) => p.slug !== slug)
    .sort((a, b) => {
      if (a.category === category && b.category !== category) return -1;
      if (b.category === category && a.category !== category) return 1;
      return b.publishedOn.localeCompare(a.publishedOn);
    })
    .slice(0, limit);
}

export function blogCanonical(slug: string) {
  return `${getSiteUrl()}/blog/${slug}`;
}

export function blogUrlPath(slug: string) {
  return `/blog/${encodeURIComponent(slug)}`;
}

export const BLOG_GLOBAL_CTA = CTA_DEFAULT;
