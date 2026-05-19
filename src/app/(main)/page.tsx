import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  BookOpenText,
  Check,
  ChevronRight,
  CircleX,
  Clock3,
  Cloud,
  FileDown,
  Link2,
  LockKeyhole,
  PackageCheck,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Upload,
} from "lucide-react";

import { TulminBrand, TulminLogoMark } from "@/components/brand/tulmin-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const workflow = [
  {
    icon: Link2,
    title: "Map SKUs once",
    copy: "Connect listing SKUs to the master names your team actually uses.",
  },
  {
    icon: Upload,
    title: "Upload the Meesho PDF",
    copy: "Bring in the mixed label file after your mapping rules are ready.",
  },
  {
    icon: SlidersHorizontal,
    title: "Filter the batch",
    copy: "Narrow labels by mapped SKU, QTY, courier partner, or search.",
  },
  {
    icon: FileDown,
    title: "Export clean labels",
    copy: "Download selected pages, SKU-wise PDFs, or a ready ZIP for print.",
  },
];

const metrics = [
  ["Map", "SKUs once"],
  ["Run", "clean label batches"],
  ["Print", "with fewer checks"],
];

const outcomes = [
  "Start with SKU mapping so every future label run has cleaner groups.",
  "Split work by mapped SKU, QTY, and courier before the packing table waits.",
  "Export dispatch-ready files without opening the same mixed PDF again and again.",
];

const beforeAfter = [
  ["Before Tulmin", "Mixed PDF, manual search, wrong print batches", CircleX],
  ["With Tulmin", "Filter, select, export, print", BadgeCheck],
];

const operatorFit = [
  ["Bulk Meesho sellers", "Daily label PDFs, many SKUs, repeated dispatch pressure."],
  ["Small warehouse teams", "Packers need clean batches, not one giant mixed file."],
  ["Owner-operators", "Less manual checking before pickup cut-off time."],
];

const platformPoints = [
  ["Mapping first", "Save listing-to-master SKU logic before the daily label run."],
  ["Export control", "Selected PDF, SKU-wise PDFs, or ZIP for the team."],
  ["Courier and QTY filters", "Segment by partner and quantity without manual scanning."],
  ["Optional sync", "Sign in when you want mappings backed up across browsers."],
];

const painPoints = [
  ["Manual sorting", "Teams lose time searching one mixed PDF for the right product."],
  ["Wrong dispatch", "Similar SKUs get packed in parallel and labels can get swapped."],
  ["Courier chaos", "Pickup batches slow down when partners are mixed together."],
  ["Repeated setup", "Listing SKU logic is rebuilt every day instead of reused."],
];

const playbooks = [
  ["SKU filtering", "How mapped SKUs reduce daily label sorting."],
  ["4x6 printing", "Crop and export cleaner thermal label batches."],
  ["Bulk dispatch", "Daily checks for Meesho warehouse teams."],
];

const faqItems = [
  ["Should I map SKUs before running labels?", "Yes. Mapping first gives the cleanest workflow because filters can use your team-level SKU names."],
  ["Will it help if my team packs by courier?", "Yes. Courier-aware filtering keeps handoff and scanning cleaner."],
  ["Can Tulmin remember SKU names?", "Yes. SKU Mapping links listing SKUs to the master names your team uses."],
];

const productRows = [
  ["TSHIRT-BLK-M", "Master: TSHIRT-BLACK", "Delhivery", "4"],
  ["KURTI-RD-XL", "Master: KURTI-RED", "Shadowfax", "2"],
  ["BAG-TAN-01", "Mapped today", "Ecom Express", "1"],
  ["SKU missing", "Needs mapping", "Xpressbees", "3"],
];

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[640px] overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_30px_90px_-48px_rgb(15_23_42/0.55)] ring-1 ring-slate-950/[0.04] dark:border-white/10 dark:bg-[#0c1728] dark:shadow-[0_34px_100px_-48px_rgb(0_0_0/0.9)]">
      <div className="border-b border-slate-200/70 bg-slate-50/85 px-4 py-3 dark:border-white/10 dark:bg-white/[0.035]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TulminLogoMark className="size-9" />
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-950 dark:text-white">
                SKU Mapping
              </p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Map first, export faster
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:text-emerald-200">
            <span className="sm:hidden">Mapped</span>
            <span className="hidden sm:inline">Rules ready</span>
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_.8fr_.75fr]">
          <div className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400">
            <Search className="size-4 text-slate-400" strokeWidth={1.8} aria-hidden />
            Search listing or master SKU
          </div>
          <div className="flex h-11 items-center justify-between rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200">
            All couriers
            <ChevronRight className="size-4 rotate-90 text-slate-400" aria-hidden />
          </div>
          <div className="flex h-11 items-center justify-between rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-200">
            QTY 1-4
            <ChevronRight className="size-4 rotate-90 text-slate-400" aria-hidden />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
          <div className="grid grid-cols-[1.2fr_1fr_.85fr_44px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400">
            <span>Listing SKU</span>
            <span className="hidden sm:block">Mapped SKU</span>
            <span>Courier</span>
            <span className="text-right">QTY</span>
          </div>
          {productRows.map((row, index) => (
            <div
              key={row[0]}
              className="grid grid-cols-[1.2fr_1fr_.85fr_44px] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-white/[0.07]"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-950 dark:text-white">
                  {row[0]}
                </p>
                <p className="truncate text-[11px] font-medium text-slate-500 sm:hidden dark:text-slate-400">
                  {row[1]}
                </p>
              </div>
              <p className="hidden truncate text-[12px] font-medium text-slate-500 sm:block dark:text-slate-400">
                {row[1]}
              </p>
              <span
                className={cn(
                  "w-fit rounded-full px-2 py-1 text-[11px] font-semibold",
                  index === 3
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-200"
                    : "bg-sky-500/10 text-sky-700 dark:text-sky-200"
                )}
              >
                {row[2]}
              </span>
              <p className="text-right text-sm font-bold tabular-nums text-slate-950 dark:text-white">
                {row[3]}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Mapped", "24 SKUs"],
            ["Filtered", "128 labels"],
            ["Export", "ZIP + PDF"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-white/[0.035]"
            >
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {label}
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                {value}
              </p>
            </div>
          ))}
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
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#f7f9fc]/82 backdrop-blur-xl dark:border-white/10 dark:bg-[#07101f]/78">
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
            <a href="#workflow" className="hover:text-slate-950 dark:hover:text-white">
              Workflow
            </a>
            <a href="#operators" className="hover:text-slate-950 dark:hover:text-white">
              Operators
            </a>
            <a href="#trust" className="hover:text-slate-950 dark:hover:text-white">
              Trust
            </a>
            <Link href="/blog" className="hover:text-slate-950 dark:hover:text-white">
              Guides
            </Link>
          </nav>
          <Link
            href="/mapping"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-10 rounded-full px-4 text-sm"
            )}
          >
            Start SKU Mapping
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-300">
                <Sparkles className="size-3.5 text-[#335cff]" strokeWidth={1.8} aria-hidden />
                Meesho dispatch, cleaned up
              </div>
              <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-slate-950 sm:text-6xl lg:text-7xl dark:text-white">
                Map once. Print the right labels every time.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl dark:text-slate-300">
                Tulmin turns SKU mapping, label filtering, and dispatch export into one calm workflow for teams shipping Meesho orders at speed.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/mapping"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 rounded-full px-6 text-[15px]"
                  )}
                >
                  Start SKU Mapping
                  <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
                </Link>
                <Link
                  href="/export-labels"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 rounded-full border-slate-300 bg-white px-6 text-[15px] dark:border-white/15 dark:bg-white/[0.04]"
                  )}
                >
                  Run labels
                </Link>
              </div>
              <div className="mt-10 grid max-w-xl gap-6 border-t border-slate-200 pt-6 sm:grid-cols-3 dark:border-white/10">
                {metrics.map(([value, label]) => (
                  <div key={label}>
                    <p className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                      {value}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 rounded-[2.5rem] border border-slate-200/70 bg-white/45 shadow-[0_34px_110px_-70px_rgb(15_23_42/0.9)] dark:border-white/10 dark:bg-white/[0.03]" aria-hidden />
              <ProductPreview />
            </div>
          </div>
        </section>

        <section id="workflow" className="border-y border-slate-200 bg-white py-14 dark:border-white/10 dark:bg-white/[0.025]">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
              <div>
                <p className="text-sm font-semibold text-[#335cff]">Workflow</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                  Built for the way dispatch actually moves.
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["01", "Map SKUs"],
                  ["02", "Run labels"],
                  ["03", "Export batches"],
                ].map(([step, label]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-[#f7f9fc] p-4 dark:border-white/10 dark:bg-[#0c1728]">
                    <p className="text-xs font-bold text-[#335cff]">{step}</p>
                    <p className="mt-2 text-base font-semibold tracking-tight text-slate-950 dark:text-white">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="py-16 sm:py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold text-[#335cff]">Impact</p>
              <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                Less manual scanning. Fewer wrong batches. Faster print handoff.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
                The interface stays quiet so operators can focus on the next decision: map, filter, export.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [Link2, "SKU memory", "Save listing-to-master rules for repeat work."],
                [SlidersHorizontal, "Precise filters", "Narrow labels by SKU, QTY, and courier."],
                [FileDown, "Clean export", "Download selected PDFs or grouped ZIP files."],
                [ShieldCheck, "Local-first", "Start in-browser, sync when your team is ready."],
              ].map(([Icon, title, copy]) => {
                const FeatureIcon = Icon as typeof Link2;
                return (
                  <div key={title as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
                    <FeatureIcon className="size-5 text-[#335cff]" strokeWidth={1.8} aria-hidden />
                    <p className="mt-4 font-semibold tracking-tight">{title as string}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {copy as string}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 rounded-[2rem] bg-slate-950 p-6 text-white shadow-[0_28px_90px_-46px_rgb(15_23_42/0.8)] sm:p-8 lg:flex-row lg:items-center lg:justify-between dark:bg-white dark:text-slate-950">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-sky-200 dark:text-[#335cff]">
                <BadgeCheck className="size-4" strokeWidth={1.8} aria-hidden />
                Ready for today&apos;s dispatch
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Start with the SKU map.
              </h2>
            </div>
            <Link
              href="/mapping"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-full bg-white px-6 text-slate-950 hover:bg-slate-100 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900"
              )}
            >
              Start SKU Mapping
              <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white/70 py-8 dark:border-white/10 dark:bg-white/[0.025]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8 dark:text-slate-400">
          <div>
            <p className="font-semibold text-slate-950 dark:text-white">Tulmin</p>
            <p className="mt-1">Meesho label workflow for dispatch teams.</p>
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
            <Link href="/mapping" className="font-semibold text-[#335cff]">
              Open workspace
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
