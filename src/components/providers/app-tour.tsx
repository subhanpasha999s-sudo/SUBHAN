"use client";

/**
 * AppTour — a premium first-visit product tour.
 *
 * Design:
 *  • Dark overlay with a transparent "spotlight" cut-out around the target element.
 *  • Floating popover (top/bottom/center) with step copy, progress dots, and nav buttons.
 *  • 5 steps covering the full label-export workflow.
 *  • Shown once per browser (localStorage key "lable.tour-seen-v1").
 *    Reset by removing the key or calling resetTour() from context.
 *  • Skippable at any point.
 *  • Keyboard: Escape = skip, ArrowRight / Enter = next, ArrowLeft = prev.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

type TourStep = {
  /** CSS selector of the element to spotlight. Null = centred intro card. */
  target: string | null;
  title: string;
  body: string;
  /** Where to place the popover relative to the spotlight. */
  placement: "top" | "bottom" | "center";
  /** Extra y-offset in px for finer placement (positive = down). */
  yOffset?: number;
};

// ─── step definitions ─────────────────────────────────────────────────────────

const STEPS: TourStep[] = [
  {
    target: null,
    placement: "center",
    title: "Welcome to Tulmin 👋",
    body: "You're 3 steps away from exporting Meesho labels 5× faster. Let's show you exactly how it works.",
  },
  {
    target: '[data-tour="import-pdf"]',
    placement: "bottom",
    title: "Step 1 — Import your label PDF",
    body: "Drop the Meesho label PDF you download from the Supplier Panel right here. Tulmin parses every label in seconds.",
    yOffset: 12,
  },
  {
    target: '[data-tour="sku-map-link"]',
    placement: "bottom",
    title: "Step 2 — Map SKUs once",
    body: "Go to SKU Mapping and link each listing SKU to a master name. You only do this once — Tulmin remembers it forever.",
    yOffset: 10,
  },
  {
    target: '[data-tour="filter-bar"]',
    placement: "bottom",
    title: "Step 3 — Filter by SKU, qty, or carrier",
    body: "Use these filters to instantly show only the labels you need — by SKU, quantity, or delivery partner.",
    yOffset: 12,
  },
  {
    target: '[data-tour="download-btn"]',
    placement: "top",
    title: "Step 4 — Download your selection",
    body: "Download a merged PDF or a ZIP with one file per SKU — exactly what you filtered. No manual sorting ever again.",
    yOffset: -12,
  },
];

// ─── constants ────────────────────────────────────────────────────────────────

const TOUR_SEEN_KEY = "lable.tour-seen-v1";
const SPOTLIGHT_PADDING = 10; // px around the target element

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

// ─── utilities ────────────────────────────────────────────────────────────────

function getSpotlightRect(selector: string | null): DOMRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect;
}

// ─── spotlight overlay ────────────────────────────────────────────────────────

type SpotlightRect = { top: number; left: number; width: number; height: number } | null;

function SpotlightOverlay({
  rect,
  onClick,
}: {
  rect: SpotlightRect;
  onClick: () => void;
}) {
  if (!rect) {
    return (
      <div
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-[2px]"
        onClick={onClick}
      />
    );
  }

  const top = rect.top - SPOTLIGHT_PADDING;
  const left = rect.left - SPOTLIGHT_PADDING;
  const w = rect.width + SPOTLIGHT_PADDING * 2;
  const h = rect.height + SPOTLIGHT_PADDING * 2;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* top */}
      <div
        className="absolute bg-black/72 backdrop-blur-[2px] pointer-events-auto"
        style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }}
        onClick={onClick}
      />
      {/* left */}
      <div
        className="absolute bg-black/72 pointer-events-auto"
        style={{ top: Math.max(0, top), left: 0, width: Math.max(0, left), height: h }}
        onClick={onClick}
      />
      {/* right */}
      <div
        className="absolute bg-black/72 pointer-events-auto"
        style={{ top: Math.max(0, top), left: left + w, right: 0, height: h }}
        onClick={onClick}
      />
      {/* bottom */}
      <div
        className="absolute bg-black/72 backdrop-blur-[2px] pointer-events-auto"
        style={{ top: Math.max(0, top) + h, left: 0, right: 0, bottom: 0 }}
        onClick={onClick}
      />
      {/* spotlight ring */}
      <div
        className="absolute rounded-2xl ring-2 ring-primary/60 ring-offset-0 shadow-[0_0_0_4px_rgba(96,165,250,0.15)]"
        style={{ top, left, width: w, height: h }}
      />
    </div>
  );
}

// ─── popover ──────────────────────────────────────────────────────────────────

function TourPopover({
  step,
  stepIndex,
  total,
  spotlightRect,
  onNext,
  onPrev,
  onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  total: number;
  spotlightRect: SpotlightRect;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Position logic
  const [style, setStyle] = React.useState<React.CSSProperties>({});

  React.useLayoutEffect(() => {
    if (step.placement === "center" || !spotlightRect) {
      setStyle({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      });
      return;
    }

    const popoverH = popoverRef.current?.offsetHeight ?? 220;
    const popoverW = Math.min(360, window.innerWidth - 32);
    const vw = window.innerWidth;

    let top: number;
    if (step.placement === "bottom") {
      top = spotlightRect.top + spotlightRect.height + SPOTLIGHT_PADDING + (step.yOffset ?? 10);
    } else {
      top = spotlightRect.top - SPOTLIGHT_PADDING - popoverH + (step.yOffset ?? -10);
    }

    // Horizontal: centre on target, clamp to viewport
    const targetCx = spotlightRect.left + spotlightRect.width / 2;
    let left = targetCx - popoverW / 2;
    left = Math.max(16, Math.min(left, vw - popoverW - 16));

    // Vertical clamp
    top = Math.max(16, Math.min(top, window.innerHeight - popoverH - 16));

    setStyle({ position: "fixed", top, left, width: popoverW });
  }, [step, spotlightRect]);

  return (
    <div
      ref={popoverRef}
      style={style}
      className={cn(
        "z-[210] max-w-[22rem] rounded-2xl border border-border/50 bg-popover px-6 py-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.06]",
        "animate-in fade-in-0 zoom-in-95 duration-200 ease-smooth"
      )}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {isFirst && (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Sparkles className="size-3.5 text-primary" />
            </span>
          )}
          <p className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            {step.title}
          </p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          title="Skip tour"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {step.body}
      </p>

      {/* progress dots */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "block h-1.5 rounded-full transition-all duration-200",
                i === stepIndex
                  ? "w-5 bg-primary"
                  : i < stepIndex
                  ? "w-1.5 bg-primary/40"
                  : "w-1.5 bg-muted-foreground/25"
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={onPrev}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground shadow-[0_4px_18px_-6px_rgb(96_165_250/0.7)] transition-all hover:brightness-[1.08] active:scale-[0.97]"
          >
            {isLast ? "Done" : "Next"}
            {!isLast && <ArrowRight className="size-3" />}
          </button>
        </div>
      </div>

      {/* skip link */}
      {!isLast && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 block w-full text-center text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
        >
          Skip tour
        </button>
      )}
    </div>
  );
}

// ─── main provider ────────────────────────────────────────────────────────────

export function AppTourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [spotlightRect, setSpotlightRect] = React.useState<SpotlightRect>(null);
  const [mounted, setMounted] = React.useState(false);

  // Only run client-side
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-start on first visit (delayed so the app fully paints first)
  React.useEffect(() => {
    if (!mounted) return;
    const seen = localStorage.getItem(TOUR_SEEN_KEY);
    if (!seen) {
      const t = setTimeout(() => {
        setStepIndex(0);
        setActive(true);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [mounted]);

  // Recalculate spotlight rect when step changes
  React.useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];
    if (!step) return;

    const measure = () => {
      const rect = getSpotlightRect(step.target);
      if (rect) {
        // Scroll element into view before spotlighting
        const el = document.querySelector(step.target!);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        // Small delay to let scroll settle
        setTimeout(() => {
          const freshRect = getSpotlightRect(step.target);
          setSpotlightRect(freshRect);
        }, 350);
      } else {
        setSpotlightRect(null);
      }
    };

    measure();
  }, [active, stepIndex]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!active) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  function finish() {
    setActive(false);
    if (mounted) localStorage.setItem(TOUR_SEEN_KEY, "1");
  }

  function handleNext() {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      finish();
    }
  }

  function handlePrev() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  const startTour = React.useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const resetTour = React.useCallback(() => {
    if (mounted) localStorage.removeItem(TOUR_SEEN_KEY);
    setStepIndex(0);
    setActive(true);
  }, [mounted]);

  const ctx = React.useMemo(() => ({ startTour, resetTour }), [startTour, resetTour]);

  return (
    <TourContext.Provider value={ctx}>
      {children}
      {mounted && active && typeof document !== "undefined"
        ? createPortal(
            <>
              <SpotlightOverlay
                rect={spotlightRect}
                onClick={handleNext}
              />
              <TourPopover
                step={STEPS[stepIndex]!}
                stepIndex={stepIndex}
                total={STEPS.length}
                spotlightRect={spotlightRect}
                onNext={handleNext}
                onPrev={handlePrev}
                onSkip={finish}
              />
            </>,
            document.body
          )
        : null}
    </TourContext.Provider>
  );
}
