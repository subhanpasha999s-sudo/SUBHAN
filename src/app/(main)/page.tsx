import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  ChevronRight,
  CircleX,
  Cloud,
  FileDown,
  Layers2,
  Link2,
  LockKeyhole,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Upload,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const workflow = [
  {
    icon: Upload,
    title: "Upload label PDFs",
    copy: "Drop in a Meesho PDF and start filtering in seconds.",
  },
  {
    icon: SlidersHorizontal,
    title: "Filter the dispatch batch",
    copy: "Narrow labels by SKU, QTY, courier, mapped SKU, or search.",
  },
  {
    icon: FileDown,
    title: "Export what ships",
    copy: "Download selected pages, SKU-wise PDFs, or a ready ZIP.",
  },
];

const metrics = [
  ["No", "manual PDF sorting"],
  ["Fast", "SKU and courier batches"],
  ["Clean", "exports for printing"],
];

const outcomes = [
  "Find the right labels without opening the PDF again and again.",
  "Split work by SKU, QTY, and courier before the packing table waits.",
  "Keep listing SKUs mapped to the master names your team actually uses.",
];

const beforeAfter = [
  ["Before Tulmin", "Mixed PDF, manual search, wrong print batches", CircleX],
  ["With Tulmin", "Filter, select, export, print", BadgeCheck],
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
            <span className="flex size-9 items-center justify-center rounded-2xl bg-[#335cff] text-white shadow-[0_14px_34px_-20px_rgb(51_92_255/0.95)]">
              <Layers2 className="size-4" strokeWidth={1.8} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-950 dark:text-white">
                Labels
              </p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                SKU, QTY, courier partner
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:text-emerald-200">
            <span className="sm:hidden">Ready</span>
            <span className="hidden sm:inline">Ready to export</span>
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_.8fr_.75fr]">
          <div className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-400">
            <Search className="size-4 text-slate-400" strokeWidth={1.8} aria-hidden />
            Search SKU or order
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
            ["Selected", "128 labels"],
            ["Grouped", "24 SKUs"],
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
            <span className="flex size-10 items-center justify-center rounded-2xl bg-[#335cff] text-white shadow-[0_12px_28px_-18px_rgb(51_92_255/0.95)]">
              <Layers2 className="size-5" strokeWidth={1.85} aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight">Tulmin</span>
              <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Dispatch SaaS
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex dark:text-slate-300">
            <a href="#workflow" className="hover:text-slate-950 dark:hover:text-white">
              Workflow
            </a>
            <a href="#trust" className="hover:text-slate-950 dark:hover:text-white">
              Trust
            </a>
            <Link href="/blog" className="hover:text-slate-950 dark:hover:text-white">
              Guides
            </Link>
          </nav>
          <Link
            href="/export-labels"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-10 rounded-full px-4 text-sm"
            )}
          >
            Start workspace
            <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#335cff]/40 to-transparent" aria-hidden />
          <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-12 px-4 pb-14 pt-14 sm:px-6 sm:pb-16 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:pb-20 lg:pt-16">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-300">
                <Sparkles className="size-3.5 text-[#335cff]" strokeWidth={1.8} aria-hidden />
                Stop sorting labels by hand
              </div>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-slate-950 sm:text-6xl lg:text-7xl dark:text-white">
                Tulmin
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl dark:text-slate-300">
                Turn one mixed Meesho PDF into SKU, QTY, and courier-ready exports your team can print with confidence.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/export-labels"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 rounded-full px-6 text-[15px]"
                  )}
                >
                  Try with today&apos;s PDF
                  <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
                </Link>
                <Link
                  href="/mapping"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 rounded-full border-slate-300 bg-white px-6 text-[15px] dark:border-white/15 dark:bg-white/[0.04]"
                  )}
                >
                  Set up SKU mapping
                </Link>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {metrics.map(([value, label]) => (
                  <div key={label} className="border-l border-slate-300 pl-4 dark:border-white/15">
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
              <div className="absolute -inset-6 rounded-[2.5rem] border border-[#335cff]/10 bg-[linear-gradient(135deg,rgb(51_92_255/0.10),rgb(16_185_129/0.08)_48%,rgb(245_158_11/0.10))] blur-2xl" aria-hidden />
              <ProductPreview />
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white py-12 dark:border-white/10 dark:bg-white/[0.025]">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold text-[#335cff]">Why sellers use it</p>
              <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                Less label chaos before dispatch.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Tulmin removes the repetitive work between downloading a Meesho PDF and handing labels to packers.
              </p>
            </div>

            <div className="grid gap-3">
              {outcomes.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-[#f7f9fc] p-4 dark:border-white/10 dark:bg-[#0c1728]"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-600/15 dark:text-emerald-200">
                    <Check className="size-4" strokeWidth={2} aria-hidden />
                  </span>
                  <p className="text-sm font-medium leading-6 text-slate-700 dark:text-slate-300">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="mx-auto mt-8 grid w-full max-w-7xl gap-4 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
            {beforeAfter.map(([label, text, Icon], index) => {
              const StatusIcon = Icon as typeof CircleX;
              return (
                <div
                  key={label as string}
                  className={cn(
                    "rounded-2xl border p-5",
                    index === 0
                      ? "border-rose-200 bg-rose-50/70 text-rose-950 dark:border-rose-400/15 dark:bg-rose-400/5 dark:text-rose-100"
                      : "border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-400/15 dark:bg-emerald-400/5 dark:text-emerald-100"
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <StatusIcon className="size-4" strokeWidth={1.9} aria-hidden />
                    {label as string}
                  </div>
                  <p className="mt-2 text-xl font-semibold tracking-tight">
                    {text as string}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="workflow" className="border-y border-slate-200 bg-white py-16 dark:border-white/10 dark:bg-white/[0.025]">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div>
                <p className="text-sm font-semibold text-[#335cff]">Operator workflow</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
                  From PDF to print-ready batches.
                </h2>
              </div>
              <p className="max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Upload once, filter precisely, export the exact labels your team needs.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {workflow.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-slate-200 bg-[#f7f9fc] p-5 shadow-sm dark:border-white/10 dark:bg-[#0c1728]"
                  >
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-[#335cff] shadow-sm ring-1 ring-slate-200 dark:bg-white/[0.055] dark:ring-white/10">
                      <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {item.copy}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="trust" className="py-16 sm:py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-6 text-emerald-600 dark:text-emerald-300" strokeWidth={1.8} aria-hidden />
                <h2 className="text-2xl font-semibold tracking-tight">Built for work, not demos</h2>
              </div>
              <div className="mt-6 grid gap-3">
                {[
                  "Use it directly inside the browser.",
                  "Sync SKU mappings when your team signs in.",
                  "Reduce reprints, missed labels, and sorting time.",
                ].map((item) => (
                  <div key={item} className="flex gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <Check className="mt-1 size-4 shrink-0 text-emerald-600 dark:text-emerald-300" strokeWidth={2} aria-hidden />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [Truck, "Courier-aware", "Bundle labels by delivery partner."],
                [Boxes, "SKU-wise", "Group labels by master SKU."],
                [Cloud, "Sync-ready", "Back up mappings after sign-in."],
                [LockKeyhole, "Local-first", "Use Tulmin without cloud sync."],
              ].map(([Icon, title, copy]) => {
                const TrustIcon = Icon as typeof Truck;
                return (
                  <div
                    key={title as string}
                    className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.035]"
                  >
                    <TrustIcon className="size-5 text-[#335cff]" strokeWidth={1.8} aria-hidden />
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
                Ready for your next dispatch batch
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Try it on today&apos;s labels.
              </h2>
            </div>
            <Link
              href="/export-labels"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-full bg-white px-6 text-slate-950 hover:bg-slate-100 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900"
              )}
            >
              Launch Tulmin
              <Link2 className="size-4" strokeWidth={1.8} aria-hidden />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
