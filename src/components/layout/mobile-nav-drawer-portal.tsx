"use client";

import * as React from "react";
import { createPortal } from "react-dom";

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
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);

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
    /** Scroll bleed on iOS / Android when full-screen backdrop is shown */
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    root.style.touchAction = "none";

    return () => {
      root.style.overflow = prevRootOverflow;
      body.style.overflow = prevBodyOverflow;
      root.style.touchAction = prevRootTouch;
    };
  }, [open, mounted]);

  if (!mounted || typeof document === "undefined" || !open) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 animate-in fade-in-0 bg-black/50 duration-200 motion-reduce:animate-none lg:hidden touch-manipulation"
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={onClose}
      />
      {children}
    </>,
    document.body
  );
}
