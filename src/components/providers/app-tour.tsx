"use client";

/**
 * Tulmin premium onboarding — spotlight tour + completion.
 * Persists progress in localStorage; confetti + CTA on finish.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Sparkles,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ─── persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "tulmin.onboarding-tour-v2";

type PersistedTour = {
  v: 2;
  status: "in_progress" | "done" | "skipped";
  /** Step index 0–4 while in progress; 5 = reached completion card (optional) */
  step: number;
};

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readPersisted(): PersistedTour | null {
  const raw = lsGet(STORAGE_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PersistedTour>;
    if (o.v !== 2 || !o.status) return null;
    if (typeof o.step !== "number" || o.step < 0 || o.step > 5) return null;
    return { v: 2, status: o.status, step: o.step };
  } catch {
    return null;
  }
}

function writePersisted(p: PersistedTour) {
  lsSet(STORAGE_KEY, JSON.stringify(p));
}

// ─── steps ─────────────────────────────────────────────────────────────────────

type TourStepDef = {
  id: string;
  target: string | null;
  placement: "top" | "bottom" | "center";
  yOffset?: number;
  title: string;
  description: string;
  /** Short secondary line */
  benefit?: string;
  badge?: string;
  benefits?: readonly string[];
  /** Mini pipeline labels */
  flow?: readonly string[];
  /** Navigate before measuring spotlight */
  route?: string;
};

const MAIN_STEPS: TourStepDef[] = [
  {
    id: "welcome",
    target: null,
    placement: "center",
    title: "Welcome to Tulmin 👋",
    description: "Filter and download Meesho labels in minutes instead of hours.",
    badge: "Saves Hours Daily",
    flow: ["Upload", "Filter", "Download"],
  },
  {
    id: "login",
    target: '[data-tour="login-cloud"]',
    placement: "bottom",
    title: "Your SKU Mappings Stay Saved ☁️",
    description:
      "Login once and Tulmin securely remembers your SKU mappings automatically.",
    benefits: ["No repeated mapping", "Faster future uploads", "Access from any device"],
    flow: ["Map Once", "Auto Save", "Auto Detect"],
    yOffset: 14,
  },
  {
    id: "sku",
    target: '[data-tour="sku-map-link"]',
    placement: "bottom",
    title: "Map SKU Once",
    description: "Connect supplier SKU with your master SKU one time only.",
    benefit: "Tulmin auto-remembers future mappings.",
    badge: "Removes Repetitive Work",
    yOffset: 12,
  },
  {
    id: "upload",
    target: '[data-tour="import-pdf"]',
    placement: "bottom",
    title: "Upload & Filter Instantly",
    description: "Upload labels and filter by SKU, courier, quantity, and more.",
    benefit: "Find exactly what you need in seconds.",
    badge: "Smart Filtering",
    route: "/export-labels",
    yOffset: 14,
  },
  {
    id: "download",
    target: '[data-tour="download-btn"]',
    placement: "top",
    title: "Download Ready Labels",
    description: "Export perfectly filtered labels in one click.",
    benefit: "Turn hours of work into minutes.",
    badge: "One Click Export",
    route: "/export-labels",
    yOffset: -12,
  },
];

const COMPLETION = {
  title: "You're Ready 🚀",
  description: "Tulmin is ready to simplify your entire label workflow.",
  cta: "Start Using Tulmin",
};

const SPOTLIGHT_PADDING = 12;
const TOTAL_MAIN = MAIN_STEPS.length;

// ─── confetti (no extra deps) ────────────────────────────────────────────────

function burstConfettiAt(
  root: HTMLElement,
  x: number,
  y: number,
  reducedMotion: boolean,
) {
  if (reducedMotion) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;z-index:220;pointer-events:none;width:100%;height:100%";
  root.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = window.innerWidth;
  let h = window.innerHeight;
  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  type P = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    g: number;
    rot: number;
    vr: number;
    w: number;
    h: number;
    hue: number;
    a: number;
  };
  const n = 72;
  const parts: P[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.4;
    const sp = 6 + Math.random() * 10;
    parts.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 4,
      g: 0.22 + Math.random() * 0.08,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 5,
      hue: Math.random() > 0.45 ? 215 + Math.random() * 35 : 265 + Math.random() * 40,
      a: 1,
    });
  }

  let frame = 0;
  const maxFrames = 78;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.rot += p.vr;
      p.a -= 0.012;
      if (p.a < 0) p.a = 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `hsla(${p.hue}, 85%, 62%, ${p.a})`;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (frame < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      window.removeEventListener("resize", resize);
      canvas.remove();
    }
  };
  requestAnimationFrame(tick);
}

// ─── spotlight overlay ─────────────────────────────────────────────────────────

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
} | null;

function SpotlightOverlay({
  rect,
  dimmed,
  onDimClick,
}: {
  rect: SpotlightRect;
  dimmed: boolean;
  onDimClick: () => void;
}) {
  if (!dimmed) return null;

  if (!rect) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-[200] bg-black/65 backdrop-blur-[3px]"
        onClick={onDimClick}
      />
    );
  }

  const top = rect.top - SPOTLIGHT_PADDING;
  const left = rect.left - SPOTLIGHT_PADDING;
  const rw = rect.width + SPOTLIGHT_PADDING * 2;
  const rh = rect.height + SPOTLIGHT_PADDING * 2;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[200] pointer-events-none"
    >
      <div
        className="absolute bg-black/68 backdrop-blur-[2px] pointer-events-auto transition-[height] duration-300 ease-smooth"
        style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }}
        onClick={onDimClick}
      />
      <div
        className="absolute bg-black/68 pointer-events-auto transition-[top,height,width] duration-300 ease-smooth"
        style={{
          top: Math.max(0, top),
          left: 0,
          width: Math.max(0, left),
          height: rh,
        }}
        onClick={onDimClick}
      />
      <div
        className="absolute bg-black/68 pointer-events-auto transition-[top,height,left] duration-300 ease-smooth"
        style={{
          top: Math.max(0, top),
          left: left + rw,
          right: 0,
          height: rh,
        }}
        onClick={onDimClick}
      />
      <div
        className="absolute bg-black/68 backdrop-blur-[2px] pointer-events-auto transition-[top] duration-300 ease-smooth"
        style={{ top: Math.max(0, top) + rh, left: 0, right: 0, bottom: 0 }}
        onClick={onDimClick}
      />
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="pointer-events-none absolute rounded-2xl ring-2 ring-primary/55 shadow-[0_0_0_1px_rgba(96,165,250,0.12),0_0_48px_-8px_rgba(59,130,246,0.35)]"
        style={{ top, left, width: rw, height: rh }}
      />
    </motion.div>
  );
}

// ─── mini workflow strip ──────────────────────────────────────────────────────

function MiniFlow({ nodes }: { nodes: readonly string[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {nodes.map((label, i) => (
        <React.Fragment key={`${label}-${i}`}>
          {i > 0 ? (
            <ChevronRight
              className="size-3 shrink-0 text-muted-foreground/35"
              aria-hidden
            />
          ) : null}
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: reduce ? 0 : 0.04 + i * 0.06,
              duration: 0.28,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="rounded-lg bg-primary/[0.14] px-2 py-1 text-[10px] font-semibold tracking-tight text-primary ring-1 ring-primary/20"
          >
            {label}
          </motion.span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── tour card ────────────────────────────────────────────────────────────────

function GlassTourCard({
  step,
  stepIndex,
  spotlightRect,
  onNext,
  onPrev,
  onSkip,
}: {
  step: TourStepDef;
  stepIndex: number;
  spotlightRect: SpotlightRect;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<React.CSSProperties>({});

  const isFirst = stepIndex === 0;
  const isLastMain = stepIndex === TOTAL_MAIN - 1;
  const progress = ((stepIndex + 1) / TOTAL_MAIN) * 100;

  React.useLayoutEffect(() => {
    if (step.placement === "center" || !spotlightRect) {
      setPos({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(22rem, calc(100vw - 2rem))",
      });
      return;
    }

    const measure = () => {
      const el = cardRef.current;
      const popoverH = el?.offsetHeight ?? 260;
      const popoverW = Math.min(360, window.innerWidth - 32);
      const vw = window.innerWidth;

      let top: number;
      if (step.placement === "bottom") {
        top =
          spotlightRect.top +
          spotlightRect.height +
          SPOTLIGHT_PADDING +
          (step.yOffset ?? 10);
      } else {
        top =
          spotlightRect.top -
          SPOTLIGHT_PADDING -
          popoverH +
          (step.yOffset ?? -10);
      }

      const targetCx = spotlightRect.left + spotlightRect.width / 2;
      let left = targetCx - popoverW / 2;
      left = Math.max(16, Math.min(left, vw - popoverW - 16));
      top = Math.max(16, Math.min(top, window.innerHeight - popoverH - 16));

      setPos({
        position: "fixed",
        top,
        left,
        width: popoverW,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (cardRef.current) ro.observe(cardRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [step, spotlightRect]);

  const spring: Transition = reduce
    ? { duration: 0.01 }
    : { type: "spring", stiffness: 420, damping: 32 };

  return (
    <motion.div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      layout
      transition={spring}
      style={pos}
      initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
      className={cn(
        "z-[210] overflow-hidden rounded-[1.35rem] border border-white/[0.12] bg-popover/[0.72] p-5 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.65)] backdrop-blur-2xl",
        "dark:border-white/[0.08] dark:bg-popover/[0.5] dark:shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)]",
        "ring-1 ring-white/[0.06]"
      )}
    >
      <div className="mb-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            Step {stepIndex + 1} of {TOTAL_MAIN}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-white/[0.08] hover:text-foreground"
            aria-label="Skip onboarding"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
          />
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        {isFirst ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
            <Sparkles className="size-4 text-primary" strokeWidth={1.75} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2
            id="tour-title"
            className="text-[17px] font-semibold leading-snug tracking-tight text-foreground"
          >
            {step.title}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {step.description}
          </p>
          {step.benefit ? (
            <p className="mt-2 text-[12px] font-medium leading-snug text-foreground/85">
              {step.benefit}
            </p>
          ) : null}
          {step.benefits?.length ? (
            <ul className="mt-2.5 space-y-1.5 text-[12px] text-muted-foreground">
              {step.benefits.map((b) => (
                <li key={b} className="flex gap-2">
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-primary/80"
                    strokeWidth={2.25}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {step.flow?.length ? <MiniFlow nodes={step.flow} /> : null}
          {step.badge ? (
            <span className="mt-3 inline-flex rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300/95 dark:ring-emerald-400/20">
              {step.badge}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 dark:border-white/[0.05]">
        <button
          type="button"
          onClick={onSkip}
          className="text-[12px] font-medium text-muted-foreground/70 transition-colors hover:text-muted-foreground"
        >
          Skip
        </button>
        <div className="flex items-center gap-2">
          {!isFirst ? (
            <button
              type="button"
              onClick={onPrev}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3.5 text-[12px] font-semibold text-foreground backdrop-blur-sm transition-colors hover:bg-muted/50"
            >
              <ArrowLeft className="size-3.5" strokeWidth={2} />
              Previous
            </button>
          ) : null}
          <button
            type="button"
            onClick={onNext}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground shadow-[0_8px_28px_-10px_rgb(59_130_246/0.65)] transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.98] motion-reduce:active:scale-100"
          >
            {isLastMain ? "Finish" : "Next"}
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function CompletionCard({
  onDone,
  reducedMotion,
  burstRef,
}: {
  onDone: () => void;
  reducedMotion: boolean;
  burstRef: React.RefObject<HTMLDivElement | null>;
}) {
  React.useEffect(() => {
    const root = burstRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    burstConfettiAt(root, r.left + r.width / 2, r.top + r.height * 0.35, reducedMotion);
  }, [burstRef, reducedMotion]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-done-title"
      initial={reducedMotion ? false : { opacity: 0, scale: 0.94, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.96, y: 12 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className={cn(
        "fixed left-1/2 top-1/2 z-[210] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
        "overflow-hidden rounded-[1.35rem] border border-white/[0.14] bg-popover/[0.78] p-8 text-center shadow-[0_40px_100px_-32px_rgba(0,0,0,0.72)] backdrop-blur-2xl",
        "dark:border-white/[0.08] dark:bg-popover/[0.55] dark:shadow-[0_40px_110px_-36px_rgba(0,0,0,0.88)]",
        "ring-1 ring-white/[0.07]"
      )}
    >
      <motion.div
        initial={reducedMotion ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
        className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/90 to-sky-500/80 text-primary-foreground shadow-lg ring-1 ring-white/20"
      >
        <Check className="size-7" strokeWidth={2.5} />
      </motion.div>
      <h2
        id="tour-done-title"
        className="text-xl font-semibold tracking-tight text-foreground"
      >
        {COMPLETION.title}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {COMPLETION.description}
      </p>
      <button
        type="button"
        onClick={onDone}
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground shadow-[0_10px_36px_-12px_rgb(59_130_246/0.7)] transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.99] motion-reduce:active:scale-100"
      >
        {COMPLETION.cta}
      </button>
    </motion.div>
  );
}

// ─── context ──────────────────────────────────────────────────────────────────

type TourContextValue = {
  startTour: () => void;
  resetTour: () => void;
};

const TourContext = React.createContext<TourContextValue>({
  startTour: () => {},
  resetTour: () => {},
});

export function useAppTour() {
  return React.useContext(TourContext);
}

function getSpotlightRect(selector: string | null): DOMRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function rectToSpotlight(r: DOMRect | null): SpotlightRect {
  if (!r || (r.width === 0 && r.height === 0)) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// ─── provider ─────────────────────────────────────────────────────────────────

export function AppTourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  const [mounted, setMounted] = React.useState(false);
  const [active, setActive] = React.useState(false);
  /** 0–4 main steps, 5 = completion */
  const [stepIndex, setStepIndex] = React.useState(0);
  const [spotlightRect, setSpotlightRect] = React.useState<SpotlightRect>(null);
  const burstHostRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // First visit or resume
  React.useEffect(() => {
    if (!mounted) return;
    const p = readPersisted();
    if (!p) {
      const t = window.setTimeout(() => {
        setStepIndex(0);
        setActive(true);
        writePersisted({ v: 2, status: "in_progress", step: 0 });
      }, 850);
      return () => window.clearTimeout(t);
    }
    if (p.status === "in_progress" && p.step >= 0 && p.step <= TOTAL_MAIN) {
      const t = window.setTimeout(() => {
        setStepIndex(Math.min(p.step, TOTAL_MAIN));
        setActive(true);
      }, 400);
      return () => window.clearTimeout(t);
    }
  }, [mounted]);

  const step = MAIN_STEPS[stepIndex];
  const isCompletion = active && stepIndex >= TOTAL_MAIN;

  // Route for spotlight targets
  React.useEffect(() => {
    if (!active || isCompletion || !step) return;
    const r = step.route;
    if (r && pathname !== r) {
      router.push(r);
    }
  }, [active, isCompletion, pathname, router, step]);

  // Measure spotlight
  React.useEffect(() => {
    if (!active || isCompletion) {
      setSpotlightRect(null);
      return;
    }
    if (!step) return;

    let cancelled = false;
    const timeoutIds: number[] = [];
    const clearTimeouts = () => {
      for (const id of timeoutIds) window.clearTimeout(id);
      timeoutIds.length = 0;
    };

    const run = () => {
      if (cancelled) return;
      clearTimeouts();
      if (!step.target) {
        setSpotlightRect(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const tryMeasure = (attempt: number) => {
        if (cancelled) return;
        const el = document.querySelector(step.target!);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        const delay = step.route && pathname !== step.route ? 420 : 280;
        const id = window.setTimeout(() => {
          if (cancelled) return;
          const fresh = getSpotlightRect(step.target);
          if (fresh && fresh.width > 0 && fresh.height > 0) {
            setSpotlightRect(rectToSpotlight(fresh));
          } else if (attempt < 12) {
            tryMeasure(attempt + 1);
          } else {
            setSpotlightRect(null);
          }
        }, delay);
        timeoutIds.push(id);
      };
      tryMeasure(0);
    };

    run();
    window.addEventListener("resize", run);
    return () => {
      cancelled = true;
      clearTimeouts();
      window.removeEventListener("resize", run);
    };
  }, [active, isCompletion, pathname, step, stepIndex]);

  const persistStep = React.useCallback((idx: number, status: PersistedTour["status"]) => {
    writePersisted({ v: 2, status, step: idx });
  }, []);

  const skipTour = React.useCallback(() => {
    setActive(false);
    persistStep(stepIndex, "skipped");
  }, [persistStep, stepIndex]);

  const goNext = React.useCallback(() => {
    if (stepIndex < TOTAL_MAIN - 1) {
      const next = stepIndex + 1;
      setStepIndex(next);
      persistStep(next, "in_progress");
    } else {
      setStepIndex(TOTAL_MAIN);
      persistStep(TOTAL_MAIN, "in_progress");
    }
  }, [persistStep, stepIndex]);

  const goPrev = React.useCallback(() => {
    if (stepIndex > 0) {
      const prev = stepIndex - 1;
      setStepIndex(prev);
      persistStep(prev, "in_progress");
    }
  }, [persistStep, stepIndex]);

  const finishCompletion = React.useCallback(() => {
    setActive(false);
    writePersisted({ v: 2, status: "done", step: TOTAL_MAIN });
  }, []);

  // Keyboard
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skipTour();
        return;
      }
      if (stepIndex >= TOTAL_MAIN) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          finishCompletion();
        }
        return;
      }
      if (e.key === "ArrowRight" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (stepIndex > 0) goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finishCompletion, goNext, goPrev, skipTour, stepIndex]);

  React.useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  const startTour = React.useCallback(() => {
    lsRemove(STORAGE_KEY);
    setStepIndex(0);
    setActive(true);
    writePersisted({ v: 2, status: "in_progress", step: 0 });
  }, []);

  const resetTour = React.useCallback(() => {
    lsRemove(STORAGE_KEY);
    setStepIndex(0);
    setActive(true);
    writePersisted({ v: 2, status: "in_progress", step: 0 });
  }, []);

  const ctx = React.useMemo(
    () => ({ startTour, resetTour }),
    [resetTour, startTour],
  );

  const onOverlayClick = () => {
    if (stepIndex >= TOTAL_MAIN) return;
    goNext();
  };

  return (
    <TourContext.Provider value={ctx}>
      {children}
      {mounted && active && typeof document !== "undefined"
        ? createPortal(
            <div ref={burstHostRef} className="fixed inset-0 z-[199]">
              <AnimatePresence mode="wait">
                {!isCompletion ? (
                  <SpotlightOverlay
                    key="spot"
                    rect={spotlightRect}
                    dimmed
                    onDimClick={onOverlayClick}
                  />
                ) : (
                  <motion.div
                    key="complete-bg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] bg-black/55 backdrop-blur-[2px]"
                  />
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {!isCompletion && step ? (
                  <GlassTourCard
                    key={step.id}
                    step={step}
                    stepIndex={stepIndex}
                    spotlightRect={spotlightRect}
                    onNext={goNext}
                    onPrev={goPrev}
                    onSkip={skipTour}
                  />
                ) : isCompletion ? (
                  <CompletionCard
                    key="done"
                    onDone={finishCompletion}
                    reducedMotion={!!reduceMotion}
                    burstRef={burstHostRef}
                  />
                ) : null}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </TourContext.Provider>
  );
}
