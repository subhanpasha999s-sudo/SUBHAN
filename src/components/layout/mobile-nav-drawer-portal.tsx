"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Renders overlay + drawer at `document.body` so stacking/hit-testing is never intercepted
 * by parent layout (fixes mobile menu “dead” taps from z-index / transform quirks).
 */
export function MobileNavDrawerPortal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactElement;
}) {
  const [mounted, setMounted] = React.useState(false);
  const touchStartX = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open || !mounted || typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      document.getElementById("main-nav-drawer")?.focus({ preventScroll: true });
    });
  }, [open, mounted]);

  React.useEffect(() => {
    if (!open || !mounted || typeof document === "undefined") return;

    const root = document.documentElement;
    const body = document.body;
    const prevRootOverflow = root.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevRootTouch = root.style.touchAction;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    root.style.touchAction = "none";

    return () => {
      root.style.overflow = prevRootOverflow;
      body.style.overflow = prevBodyOverflow;
      root.style.touchAction = prevRootTouch;
    };
  }, [open, mounted]);

  const augmentDrawer = React.useMemo(() => {
    if (!React.isValidElement(children)) return children;
    type WithTouch = React.ReactElement<{
      onTouchStart?: React.TouchEventHandler<HTMLElement>;
      onTouchEnd?: React.TouchEventHandler<HTMLElement>;
    }>;
    const prevOnTouchStart = (children.props as WithTouch["props"]).onTouchStart;
    const prevOnTouchEnd = (children.props as WithTouch["props"]).onTouchEnd;

    return React.cloneElement(children as WithTouch, {
      onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
        prevOnTouchStart?.(e);
        if (e.touches.length !== 1) {
          touchStartX.current = null;
          return;
        }
        touchStartX.current = e.touches[0]?.clientX ?? null;
      },
      onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
        prevOnTouchEnd?.(e);
        if (touchStartX.current == null) return;
        const end = e.changedTouches[0]?.clientX ?? touchStartX.current;
        const delta = end - touchStartX.current;
        touchStartX.current = null;
        if (delta < -72) onClose();
      },
    });
  }, [children, onClose]);

  if (!mounted || typeof document === "undefined" || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[45] lg:hidden">
      <button
        type="button"
        className={cnBackdrop()}
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="fixed inset-y-0 left-0 z-50 flex h-full max-w-[min(19rem,calc(100vw-16px))] min-w-0">
        {augmentDrawer}
      </div>
    </div>,
    document.body
  );
}

function cnBackdrop() {
  return cn(
    "absolute inset-0 touch-manipulation",
    "animate-in fade-in duration-200 motion-reduce:animate-none",
    "bg-slate-950/45 backdrop-blur-md supports-[backdrop-filter]:bg-slate-950/35 dark:bg-black/55 dark:supports-[backdrop-filter]:bg-black/42"
  );
}
