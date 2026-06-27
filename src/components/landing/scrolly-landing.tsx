"use client";
/**
 * Apple-style scrollytelling landing for Tulmin.
 * Scroll-linked parallax, pinned scrub scenes, cinematic reveals, count-ups.
 * Pure transform/opacity animation (GPU-friendly); honours reduced-motion.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import {
  ArrowRight, Boxes, Check, CircleUserRound, FileDown, Filter, GitCompare,
  IndianRupee, Landmark, Receipt, RotateCcw, Scissors, ShieldCheck, Upload,
} from "lucide-react";
import { TulminBrand } from "@/components/brand/tulmin-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/supabase/auth-context";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";

const EASE = [0.16, 1, 0.3, 1] as const;
// Tighter, snappier scroll-linked spring — tracks the scroll closely (responsive,
// "faster") while still smoothing out wheel/trackpad jitter. Overdamped → no overshoot.
const SCROLL_SPRING = { stiffness: 220, damping: 38, restDelta: 0.0009 } as const;

// ── Account control (top-right) — sign in / sign up, or go to account ────
function NavAccount() {
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  if (!authReady) {
    return <span aria-hidden className="size-10 shrink-0 rounded-full bg-white/[0.04]" />;
  }
  if (user) {
    return (
      <Link
        href="/account"
        aria-label="Tulmin account"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-muted-foreground transition-colors hover:text-foreground"
      >
        <CircleUserRound className="size-5" strokeWidth={1.6} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={openOptionalSignIn}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <CircleUserRound className="size-4.5" strokeWidth={1.6} />
      <span className="hidden sm:inline">Log in</span>
    </button>
  );
}

// ── Top nav ────────────────────────────────────────────────────────────
function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/55 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Tulmin home">
          <TulminBrand markClassName="size-9" titleClassName="text-[17px]" showSubtitle={false} priority />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
          <a href="#dispatch" className="hover:text-foreground">Filter &amp; crop</a>
          <a href="#books" className="hover:text-foreground">Tulmin Book</a>
          <Link href="/blog" className="hover:text-foreground">Blog</Link>
          <Link href="/pricing?returnTo=/" className="hover:text-foreground">Plans</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/export-labels" className={cn(buttonVariants({ size: "lg" }), "h-10 gap-1.5 rounded-full px-4 text-sm font-bold")}>
            Open app <ArrowRight className="size-4" />
          </Link>
          <NavAccount />
        </div>
      </div>
    </header>
  );
}

// ── Scene 1 · Hero (scroll-scrub: scale + fade + parallax) ───────────────
function Hero({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const p = useSpring(scrollYProgress, SCROLL_SPRING);
  const scale = useTransform(p, [0, 1], [1, reduce ? 1 : 1.16]);
  const opacity = useTransform(p, [0, 0.75], [1, reduce ? 1 : 0]);
  const y = useTransform(p, [0, 1], [0, reduce ? 0 : -90]);
  const orbA = useTransform(p, [0, 1], [0, reduce ? 0 : 260]);
  const orbB = useTransform(p, [0, 1], [0, reduce ? 0 : -200]);

  return (
    <section ref={ref} className="relative h-[140vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {/* parallax orbs — promoted to their own compositor layer (blur rasterized once, then just translated) */}
        <motion.div style={{ y: orbA, willChange: "transform" }} aria-hidden className="pointer-events-none absolute -left-40 top-10 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(95,125,255,0.5),transparent_60%)] blur-2xl" />
        <motion.div style={{ y: orbB, willChange: "transform" }} aria-hidden className="pointer-events-none absolute -right-40 bottom-0 size-[30rem] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.4),transparent_60%)] blur-2xl" />
        <motion.div style={{ scale, opacity, y, willChange: "transform" }} className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-muted-foreground"
          >
            <ShieldCheck className="size-3.5 text-primary" /> Two apps · one workspace · one login
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.08 }}
            className="mt-6 text-[clamp(2.8rem,8vw,5.5rem)] font-semibold leading-[0.98] tracking-tight"
          >
            Sell more.<br /><span className="bg-gradient-to-r from-[#8bafff] via-[#a78bff] to-[#34d399] bg-clip-text text-transparent">Stress less.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.18 }}
            className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg"
          >
            Filter &amp; auto-crop labels for Meesho, Flipkart &amp; Amazon — then run your Meesho books, all in one Tulmin workspace.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.28 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <Link href="/export-labels" className={cn(buttonVariants({ size: "lg" }), "h-12 gap-2 rounded-full px-6 text-[15px] font-bold")}>
              <Scissors className="size-4.5" /> Filter &amp; auto crop
            </Link>
            <Link href="/book/dashboard" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 gap-2 rounded-full px-6 text-[15px] font-bold")}>
              <IndianRupee className="size-4.5" /> Open Tulmin Book
            </Link>
          </motion.div>
        </motion.div>
        {/* scroll cue (CSS bounce — no WAAPI keyframes) */}
        <div aria-hidden className={cn("absolute bottom-8 left-1/2 -translate-x-1/2", !reduce && "animate-bounce")}>
          <div className="flex h-9 w-6 items-start justify-center rounded-full border-2 border-white/25 p-1.5">
            <div className="h-2 w-1 rounded-full bg-white/60" />
          </div>
        </div>
      </div>
    </section>
  );
}

// A single scrubbed step — lights up as the parent scroll progress passes it.
function ScrubStep({
  progress, index, total, icon: Icon, title, sub,
}: { progress: MotionValue<number>; index: number; total: number; icon: React.ComponentType<{ className?: string }>; title: string; sub: string }) {
  const start = index / total;
  // Inputs MUST stay within [0,1]: framer maps scroll input ranges to WAAPI
  // keyframe offsets, and a negative offset throws "monotonically non-decreasing".
  const a = Math.max(0, start - 0.08);
  const b = Math.min(1, start + 0.04);
  const c = Math.max(0, start - 0.04);
  const opacity = useTransform(progress, [a, b], [0.3, 1]);
  const x = useTransform(progress, [a, b], [-16, 0]);
  const dotScale = useTransform(progress, [c, b], [0.6, 1]);
  return (
    <motion.div style={{ opacity, x }} className="flex items-start gap-4">
      <motion.span style={{ scale: dotScale }} className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Icon className="size-5" />
      </motion.span>
      <div>
        <p className="text-lg font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
    </motion.div>
  );
}

// ── Scene 2 · Filter & auto crop (pinned scrub) ──────────────────────────
function DispatchScene({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, SCROLL_SPRING);

  // the mock label "cleans up" as you scroll: messy stack → single cropped label
  const stackOpacity = useTransform(p, [0.15, 0.4], [1, 0]);
  const cropScale = useTransform(p, [0.35, 0.7], [0.86, 1]);
  const cropOpacity = useTransform(p, [0.3, 0.5], [0, 1]);
  const sweepY = useTransform(p, [0.4, 0.75], ["-110%", "210%"]);
  const tiltRotate = useTransform(p, [0, 1], [reduce ? 0 : 6, reduce ? 0 : -3]);

  const steps = [
    { icon: Upload, title: "Drop your label PDFs", sub: "Meesho, Flipkart & Amazon — together." },
    { icon: Filter, title: "Filter by anything", sub: "SKU, quantity, courier, COD / prepaid." },
    { icon: Scissors, title: "Auto-crop the clutter", sub: "Clean, printer-ready labels — no blank space." },
    { icon: FileDown, title: "Export & bundle", sub: "Tidy dispatch PDFs, or ZIP by SKU." },
  ];

  return (
    <section id="dispatch" ref={ref} className="relative h-[220vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-primary">
              <Scissors className="size-3.5" /> Filter &amp; auto crop
            </p>
            <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-tight">From label chaos to clean dispatch.</h2>
            <div className="mt-9 space-y-7">
              {steps.map((s, i) => (
                <ScrubStep key={s.title} progress={p} index={i} total={steps.length} icon={s.icon} title={s.title} sub={s.sub} />
              ))}
            </div>
          </div>

          {/* animated mock */}
          <div className="relative mx-auto hidden h-[26rem] w-full max-w-sm lg:block">
            <motion.div style={{ rotate: tiltRotate, willChange: "transform" }} className="relative h-full w-full">
              {/* messy stack */}
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  style={{ opacity: stackOpacity, rotate: reduce ? 0 : (i - 1) * 5, x: reduce ? 0 : (i - 1) * 14, y: reduce ? 0 : (i - 1) * 10 }}
                  className="absolute inset-0 rounded-3xl border border-white/10 bg-card shadow-2xl"
                />
              ))}
              {/* clean cropped label */}
              <motion.div style={{ scale: cropScale, opacity: cropOpacity, willChange: "transform" }} className="absolute inset-0 overflow-hidden rounded-3xl border border-primary/30 bg-card shadow-[0_30px_80px_-30px_rgba(95,125,255,0.6)]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-xs text-muted-foreground">
                  <span className="font-mono">AWB 7349•••21</span><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">Cropped</span>
                </div>
                <div className="space-y-3 p-5">
                  <div className="h-10 w-2/3 rounded bg-white/[0.06]" />
                  <div className="h-3 w-full rounded bg-white/[0.05]" />
                  <div className="h-3 w-4/5 rounded bg-white/[0.05]" />
                  <div className="mt-4 h-16 rounded-lg bg-[repeating-linear-gradient(90deg,#fff_0,#fff_2px,transparent_2px,transparent_5px)] opacity-70" />
                  <div className="flex gap-2 pt-1">
                    {["Meesho", "SKU-RED-M", "Delhivery"].map((t) => (
                      <span key={t} className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{t}</span>
                    ))}
                  </div>
                </div>
                {/* scan sweep */}
                {!reduce && <motion.div style={{ y: sweepY }} aria-hidden className="pointer-events-none absolute inset-x-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(95,125,255,0.25),transparent)]" />}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Scene 3 · Tulmin Book (pinned scrub + count-up) ──────────────────────
function BooksScene({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, SCROLL_SPRING);

  const profit = useTransform(p, [0.25, 0.7], [0, 84230]);
  const [profitText, setProfitText] = useState("₹0");
  useMotionValueEvent(profit, "change", (v) => setProfitText("₹" + Math.round(v).toLocaleString("en-IN")));
  const stampScale = useTransform(p, [0.7, 0.85], [0.6, 1]);
  const stampOpacity = useTransform(p, [0.7, 0.82], [0, 1]);

  const cards = [
    { icon: IndianRupee, label: "Meesho orders & payouts", value: "True net / order", color: "text-sky-400" },
    { icon: GitCompare, label: "Bank reconciliation", value: "Only the bank = paid", color: "text-violet-400" },
    { icon: Boxes, label: "Inventory & stock", value: "Valuation + reorder", color: "text-amber-400" },
    { icon: RotateCcw, label: "Returns & QC", value: "Track every RTO / return", color: "text-rose-400" },
  ];

  return (
    <section id="books" ref={ref} className="relative h-[220vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:px-8">
          {/* profit hero */}
          <div className="order-2 lg:order-1">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-card p-8 shadow-2xl">
              <div className="absolute -right-20 -top-20 size-56 rounded-full bg-emerald-500/15 blur-3xl" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">True net profit · this month</p>
              <p className="mt-2 text-[clamp(2.5rem,6vw,4rem)] font-bold tabular-nums text-emerald-400">{reduce ? "₹84,230" : profitText}</p>
              <p className="mt-1 text-sm text-muted-foreground">Marketplace net − fees − returns − business expenses</p>
              <motion.div style={{ scale: stampScale, opacity: stampOpacity }} className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-400">
                <Check className="size-4" /> Bank-reconciled
              </motion.div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-emerald-400">
                <IndianRupee className="size-3.5" /> Tulmin Book
              </p>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-400">
                Meesho today · Flipkart coming soon
              </p>
            </div>
            <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-tight">Know your real profit.</h2>
            <p className="mt-4 max-w-md text-muted-foreground">Import your <strong className="text-foreground">Meesho</strong> order &amp; payment files, reconcile against your bank, manage inventory and returns/QC, then file P&amp;L + GST — nothing is &ldquo;paid&rdquo; until the statement says so. <strong className="text-foreground">Flipkart support is on the way.</strong></p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {cards.map((c, i) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <c.icon className={cn("size-5", c.color)} />
                  <p className="mt-2 text-sm font-bold">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.value}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Scene 4 · Workflow (scroll-filled progress line) ─────────────────────
function Workflow() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  const p = useSpring(scrollYProgress, SCROLL_SPRING);
  // scaleX (composited) instead of width (re-layouts every frame)
  const lineScale = useTransform(p, [0, 1], [0, 1]);
  const steps = [
    { icon: Upload, t: "Import", s: "Labels & payout files" },
    { icon: Filter, t: "Filter & crop", s: "Clean dispatch PDFs" },
    { icon: Landmark, t: "Reconcile", s: "Match payouts to bank" },
    { icon: Receipt, t: "Report", s: "P&L, GST & profit" },
  ];
  return (
    <section ref={ref} className="mx-auto w-full max-w-6xl px-6 py-28 lg:px-8">
      <h2 className="text-center text-[clamp(1.8rem,4vw,2.75rem)] font-semibold">One workspace, end to end.</h2>
      <div className="relative mt-16">
        <div className="absolute left-0 top-6 h-0.5 w-full bg-white/10" />
        <motion.div style={{ scaleX: lineScale, willChange: "transform" }} className="absolute left-0 top-6 h-0.5 w-full origin-left bg-gradient-to-r from-[#5f7dff] to-[#34d399]" />
        <div className="relative grid gap-8 sm:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.t}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.7 }}
              transition={{ duration: 0.5, ease: EASE, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-background text-primary">
                <s.icon className="size-5" />
              </div>
              <p className="mt-4 text-sm font-bold">{s.t}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.s}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Finale · CTA ─────────────────────────────────────────────────────────
function Finale() {
  return (
    <section className="relative overflow-hidden px-6 pb-32 pt-8 lg:px-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 30 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="mx-auto flex max-w-3xl flex-col items-center gap-6 rounded-[2rem] border border-primary/25 bg-[radial-gradient(circle_at_50%_0%,rgba(95,125,255,0.18),transparent_60%)] p-12 text-center"
      >
        <h2 className="text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-tight">Start free — 150 labels, no card.</h2>
        <p className="max-w-xl text-muted-foreground">The dispatch tool and the books, on the same account. Upgrade only when you&apos;re ready.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/export-labels" className={cn(buttonVariants({ size: "lg" }), "h-12 gap-2 rounded-full px-7 text-[15px] font-bold")}>
            Get started <ArrowRight className="size-4" />
          </Link>
          <Link href="/pricing?returnTo=/" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 rounded-full px-7 text-[15px] font-bold")}>
            View plans
          </Link>
        </div>
      </motion.div>
      <footer className="mx-auto mt-20 flex w-full max-w-7xl flex-col items-center justify-between gap-3 border-t border-white/5 pt-8 text-sm text-muted-foreground sm:flex-row">
        <TulminBrand markClassName="size-7" titleClassName="text-sm" subtitleClassName="hidden" />
        <nav className="flex items-center gap-5">
          <Link href="/blog" className="hover:text-foreground">Blog</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/pricing?returnTo=/" className="hover:text-foreground">Plans</Link>
        </nav>
        <span>© {new Date().getFullYear()} Tulmin</span>
      </footer>
    </section>
  );
}

export default function ScrollyLanding() {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Nav />
      <Hero reduce={reduce} />
      <DispatchScene reduce={reduce} />
      <BooksScene reduce={reduce} />
      <Workflow />
      <Finale />
    </div>
  );
}
