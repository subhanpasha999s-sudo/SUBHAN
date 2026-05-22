import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Barcode,
  Boxes,
  Check,
  Clock3,
  FileDown,
  FileScan,
  Filter,
  Layers3,
  PackageCheck,
  Scissors,
  ShieldCheck,
  Truck,
  Upload,
} from "lucide-react";

import { TulminBrand } from "@/components/brand/tulmin-logo";
import { buttonVariants } from "@/components/ui/button";
import { SEO_LANDING_PAGES } from "@/lib/seo/landing-pages";
import { getSiteUrl } from "@/lib/seo/site-url";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tulmin AI Label Filter & Auto-Crop AI for Meesho, Flipkart & Amazon",
  description:
    "Tulmin AI is a label filter and auto-crop AI for Meesho, Flipkart, and Amazon sellers. Filter labels by SKU, quantity, courier, marketplace, and COD or prepaid payment mode, then export clean dispatch PDFs.",
  alternates: { canonical: `${getSiteUrl()}/` },
  keywords: [
    "Tulmin AI",
    "AI label filter",
    "auto crop AI",
    "marketplace label AI",
    "meesho label filter",
    "flipkart label sorter",
    "amazon shipping label filter AI",
    "sku-wise label sorting",
    "courier-wise label sorter",
    "shipping label automation",
    "ecommerce dispatch software",
  ],
  openGraph: {
    title: "Tulmin AI · Label Filter & Auto-Crop AI for Marketplace Sellers",
    description:
      "Tulmin AI filters Meesho, Flipkart, and Amazon labels by SKU, quantity, courier, marketplace, and payment mode, then auto-crops clean output.",
    url: `${getSiteUrl()}/`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tulmin AI · Label Filter & Auto-Crop AI",
    description:
      "Filter Meesho, Flipkart, and Amazon labels by SKU, quantity, courier, marketplace, and payment mode. Auto-crop labels and export clean PDFs.",
  },
};

const quickWins = [
  ["SKU filtering", "Find every Meesho, Flipkart, or Amazon label for one SKU instantly.", Barcode],
  ["Quantity sorting", "Separate single-qty and multi-qty orders before packing starts.", Boxes],
  ["COD / prepaid split", "Prioritize prepaid orders first when stock is limited or dispatch is urgent.", BadgeCheck],
  ["Courier batches", "Group Delhivery, E-Kart, ATS, etc. without manual searching.", Truck],
  ["Marketplace control", "Run Meesho, Flipkart, and Amazon PDFs together in one workspace.", Layers3],
  ["Auto crop", "Export clean shipping labels or invoices without extra blank space.", Scissors],
];

const customerChoices = ["Filter Labels", "Crop Labels", "Filter + Crop"];

const filterPills = [
  ["Marketplace", "Meesho · Flipkart · Amazon"],
  ["SKU", "Listing SKU or mapped SKU"],
  ["Quantity", "Qty 1, 2, 3+"],
  ["Payment Type", "COD / Prepaid"],
  ["Courier Partner", "Delhivery · E-Kart · ATS · etc."],
];

const marketplaceNotes = [
  ["Meesho", "Filter by SKU, QTY, payment, courier, and marketplace. Auto-crop shipping labels or invoices."],
  ["Flipkart", "Filter by SKU, QTY, payment, courier, and marketplace. Auto-crop labels or invoices cleanly."],
  ["Amazon", "Filter by SKU, QTY, payment, courier, and marketplace. Match invoices and print SKU + QTY."],
];

const workflow = [
  ["Upload PDFs", "Drop Meesho, Flipkart, and Amazon label files together.", Upload],
  ["Filter or crop", "Choose SKU, QTY, payment, courier, marketplace, or crop target.", Filter],
  ["Download output", "Export clean PDFs or SKU-wise ZIP files for printing.", FileDown],
];

const heroActions = [
  "Marketplace",
  "SKU",
  "Quantity",
  "Payment Type",
  "Courier Partner",
  "Auto Crop",
];

function ProductPreview() {
  const readyStats = [
    ["Selected", "42"],
    ["Ready", "42"],
    ["Review", "0"],
  ];

  const outputCards = [
    [Filter, "AI filter labels", "Meesho · Flipkart · Amazon"],
    [Scissors, "Auto-crop AI", "Shipping labels or invoices"],
    [PackageCheck, "Prevent dispatch mistakes", "SKU · QTY · courier checks"],
  ];

  return (
    <div className="scroll-fade-up motion-soft-float relative mx-auto w-full max-w-[680px] overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#0d1728] shadow-[0_28px_100px_-54px_rgb(0_0_0/0.95)] ring-1 ring-white/[0.05]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Tulmin AI label workspace</p>
          <p className="text-[11px] font-medium text-slate-400">Meesho, Flipkart, and Amazon in one run</p>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-300/15">
          128 labels found
        </span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Filter by
            </p>
            <span className="rounded-full bg-[#6b86ff]/12 px-2 py-0.5 text-[10px] font-bold text-[#aebcff]">
              Live counts
            </span>
          </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {filterPills.map(([label, value], index) => (
            <div
              key={label}
              className={cn(
                "rounded-xl border border-white/10 bg-[#0b1424] px-3 py-2.5",
                index < 3 ? "lg:col-span-2" : "lg:col-span-3"
              )}
            >
              <p className="text-[11px] font-semibold text-slate-400">{label}</p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-white">{value}</p>
            </div>
          ))}
          </div>
        </div>

        <div>
          <div className="rounded-2xl border border-white/10 bg-[#07101f] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Ready for all three marketplaces</p>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-400">
                  AI filter, auto-crop, and export without separating files first.
                </p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200 ring-1 ring-emerald-300/15">
                Clean
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {readyStats.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              {outputCards.map(([Icon, title, copy]) => {
                const OutputIcon = Icon as typeof Filter;
                return (
                  <div
                    key={title as string}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#6b86ff]/12 text-[#aebcff]">
                      <OutputIcon className="size-4" strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{title as string}</span>
                      <span className="block truncate text-xs font-medium text-slate-400">
                        {copy as string}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Download
                </p>
                <p className="mt-1 text-sm font-semibold text-white">PDF</p>
              </div>
              <div className="rounded-xl border border-[#6b86ff]/35 bg-[#6b86ff]/16 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#b9c5ff]">
                  Bundle
                </p>
                <p className="mt-1 text-sm font-semibold text-white">ZIP by SKU</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/** Root URL opens the admin CMS on the admin host; otherwise it is the public product landing page. */
export default async function HomePage() {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();

  if (host === "admin.tulmin.com") {
    redirect("/admin/blogs");
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-950 dark:bg-[#07101f] dark:text-white">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#f7f9fc]/86 backdrop-blur-xl dark:border-white/10 dark:bg-[#07101f]/82">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Tulmin home">
            <TulminBrand
              markClassName="size-10"
              titleClassName="text-[15px] text-slate-950 dark:text-white"
              subtitleClassName="text-[11px] text-slate-500 dark:text-slate-400"
              priority
            />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex dark:text-slate-300">
            <a href="#wins" className="hover:text-slate-950 dark:hover:text-white">
              Why it helps
            </a>
            <a href="#marketplaces" className="hover:text-slate-950 dark:hover:text-white">
              Marketplaces
            </a>
            <a href="#workflow" className="hover:text-slate-950 dark:hover:text-white">
              Workflow
            </a>
          </nav>
          <Link
            href="/export-labels"
            className={cn(buttonVariants({ size: "lg" }), "h-10 rounded-full px-4 text-sm")}
          >
            Run Labels Now
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_18%_12%,rgba(51,92,255,0.18),transparent_32%),radial-gradient(circle_at_78%_0%,rgba(251,191,36,0.15),transparent_28%)] dark:bg-[radial-gradient(circle_at_18%_12%,rgba(99,125,255,0.2),transparent_32%),radial-gradient(circle_at_78%_0%,rgba(251,191,36,0.12),transparent_28%)]" aria-hidden />
          <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
            <div className="scroll-fade-up max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-300">
                <Clock3 className="size-3.5 text-[#335cff]" strokeWidth={1.8} aria-hidden />
                Tulmin AI for Meesho, Flipkart, and Amazon sellers
              </div>
              <h1 className="mt-6 max-w-[13ch] text-[clamp(3rem,5.6vw,6rem)] font-semibold leading-[1.03] tracking-tight text-slate-950 sm:max-w-[14ch] dark:text-white">
                AI label filtering and auto-crop before dispatch.
              </h1>
              <div className="mt-5 max-w-2xl rounded-[1.35rem] border border-slate-200 bg-white/76 p-3.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.045]">
                <p className="text-base font-semibold leading-7 text-slate-800 sm:text-lg dark:text-slate-100">
                  Tulmin AI filters Meesho, Flipkart, and Amazon labels by SKU, QTY, payment, courier, and marketplace.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {heroActions.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-slate-200 bg-slate-950/[0.035] px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgb(255_255_255/0.75)] dark:border-white/10 dark:bg-white/[0.065] dark:text-slate-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
                  Auto-detect shipping labels or tax invoices, then download clean PDF or ZIP files ready for printing and dispatch.
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/export-labels"
                  className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-full px-6 text-[15px]")}
                >
                  Run Labels Now
                  <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
                </Link>
                <a
                  href="#workflow"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 rounded-full border-slate-300 bg-white px-6 text-[15px] dark:border-white/15 dark:bg-white/[0.04]"
                  )}
                >
                  See the 3-step flow
                </a>
              </div>
              <div className="mt-6 grid max-w-xl gap-2 sm:grid-cols-3">
                {["Stop hunting", "Print cleaner", "Pack faster"].map((title) => (
                  <div
                    key={title}
                    className="flex min-h-12 items-center rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <p className="text-base font-semibold tracking-tight">{title}</p>
                  </div>
                ))}
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="wins" className="scroll-mt-24 border-y border-slate-200 bg-white py-14 dark:border-white/10 dark:bg-white/[0.025]">
          <div className="scroll-fade-up mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold text-[#335cff]">What Tulmin AI handles</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                SKU-wise sorting, courier-wise segregation, and label cropping in one dispatch workflow.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
                Tulmin AI helps sellers reduce wrong shipments, quantity mismatch, and packing confusion before labels reach the dispatch table.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quickWins.map(([title, copy, Icon]) => {
                  const WinIcon = Icon as typeof Filter;
                  return (
                    <div
                      key={title as string}
                      className="scroll-fade-up flex gap-4 rounded-2xl border border-slate-200 bg-[#f7f9fc] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#335cff]/35 hover:bg-white dark:border-white/10 dark:bg-[#0c1728] dark:hover:bg-white/[0.055]"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#335cff]/10 text-[#335cff] ring-1 ring-[#335cff]/15">
                        <WinIcon className="size-5" strokeWidth={1.8} aria-hidden />
                      </span>
                      <div>
                        <p className="font-semibold tracking-tight">{title as string}</p>
                        <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-400">
                          {copy as string}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="scroll-fade-up rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_28px_90px_-54px_rgb(15_23_42/0.9)] sm:p-8 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-sky-200 dark:text-[#91a3ff]">
                  AI dispatch workflow
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                    Filter, crop, or filter + crop based on today&apos;s packing queue.
                  </h2>
                </div>
                <ShieldCheck className="hidden size-10 text-emerald-200 sm:block" strokeWidth={1.5} aria-hidden />
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {customerChoices.map((title) => (
                  <div
                    key={title}
                    className="scroll-fade-up flex min-h-28 items-center rounded-2xl border border-white/10 bg-white/[0.065] p-5"
                  >
                    <p className="text-2xl font-semibold tracking-tight">{title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="marketplaces" className="scroll-mt-24 border-y border-slate-200 bg-white py-14 dark:border-white/10 dark:bg-white/[0.025]">
          <div className="scroll-fade-up mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#335cff]">Marketplace support</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                  Meesho, Flipkart, and Amazon each get the right handling.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
                One AI workspace for different PDF formats, filters, crop rules, and Amazon invoice matching.
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {marketplaceNotes.map(([title, copy]) => (
                <div
                  key={title}
                  className="scroll-fade-up rounded-2xl border border-slate-200 bg-[#f7f9fc] p-5 shadow-sm dark:border-white/10 dark:bg-[#0c1728]"
                >
                  <p className="text-lg font-semibold tracking-tight">{title}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 lg:px-8">
          <div className="scroll-fade-up mx-auto w-full max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-56px_rgb(15_23_42/0.65)] sm:p-8 dark:border-white/10 dark:bg-white/[0.035]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#335cff]">Dispatch SEO workflows</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Explore label filtering by marketplace, SKU, courier, crop, and warehouse workflow.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
                Each workflow explains the seller problem, matching filters, and clean dispatch output.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {SEO_LANDING_PAGES.map((page) => (
                <Link
                  key={page.slug}
                  href={`/${page.slug}`}
                  className="rounded-full border border-slate-200 bg-[#f7f9fc] px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#335cff]/35 hover:text-[#335cff] dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-300 dark:hover:text-white"
                >
                  {page.primaryKeyword}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="scroll-fade-up mx-auto w-full max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-56px_rgb(15_23_42/0.65)] sm:p-8 dark:border-white/10 dark:bg-white/[0.035]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#335cff]">Simple workflow</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Upload marketplace labels. Pick filters or crop. Download clean output.
                </h2>
              </div>
              <Link
                href="/export-labels"
                className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-full px-5 text-sm")}
              >
                Try with today&apos;s PDF
              </Link>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {workflow.map(([title, copy, Icon], index) => {
                const StepIcon = Icon as typeof Upload;
                return (
                  <div
                    key={title as string}
                    className="scroll-fade-up rounded-2xl border border-slate-200 bg-[#f7f9fc] p-5 dark:border-white/10 dark:bg-[#07101f]"
                  >
                    <div className="flex items-center justify-between">
                      <StepIcon className="size-5 text-[#335cff]" strokeWidth={1.8} aria-hidden />
                      <span className="text-xs font-bold text-slate-400">0{index + 1}</span>
                    </div>
                    <p className="mt-4 text-lg font-semibold tracking-tight">{title as string}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {copy as string}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
          <div className="scroll-fade-up mx-auto flex w-full max-w-7xl flex-col gap-5 rounded-[2rem] bg-[#335cff] p-6 text-white shadow-[0_28px_90px_-54px_rgb(51_92_255/0.75)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-white/75">Try the real workflow</p>
              <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight">
                Upload one Meesho, Flipkart, or Amazon PDF and see Tulmin AI organize it.
              </h2>
            </div>
            <Link
              href="/export-labels"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-full bg-white px-6 text-slate-950 hover:bg-slate-100"
              )}
            >
              Run Labels Now
              <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/70 py-8 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8 dark:text-slate-400">
          <div>
            <p className="font-semibold text-slate-950 dark:text-white">Tulmin</p>
            <p className="mt-1">AI filter and auto-crop for marketplace labels.</p>
          </div>
          <nav className="flex flex-wrap gap-4">
            <Link href="/blog" className="hover:text-slate-950 dark:hover:text-white">
              Blog
            </Link>
            <Link href="/privacy" className="hover:text-slate-950 dark:hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-950 dark:hover:text-white">
              Terms
            </Link>
            <Link href="/export-labels" className="font-semibold text-[#335cff]">
              Run Labels
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
