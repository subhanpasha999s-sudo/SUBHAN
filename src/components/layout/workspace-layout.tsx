import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Pure layout primitives (Server Component compatible).
 * Kept separate from `"use client"` shells so `(main)/layout` does not hydrate the whole subtree.
 */

/** Readable line length for workspace content */
export const WORKSPACE_MAX_W = "max-w-[1224px]";

/**
 * App shell content gutters — mobile 16px; tablet+ scale toward 24–32px desktop.
 */
export const WORKSPACE_GUTTERS = "px-4 sm:px-6 lg:px-8";

/** Desktop sidebar — expanded (260px) per premium SaaS rail spec */
export const SIDEBAR_W_EXPANDED = "16.25rem";
/** Collapsed icon rail — 78px */
export const SIDEBAR_W_COLLAPSED = "4.875rem";

export const SIDEBAR_PAD_X = "px-4";

export const APP_SIDEBAR_BRAND_ROW = "box-border shrink-0";

export const APP_TOPBAR_INNER_ROW =
  "box-border min-h-14 shrink-0 lg:h-14 lg:min-h-0 lg:max-h-14";

export const APP_CHROME_UNDERLINE = "border-b border-border";

/** Legacy expanded row grid — kept for any callers; prefer flex nav rows in sidebar */
export const SIDEBAR_EXPANDED_GUTTER_X = SIDEBAR_PAD_X;

export const SIDEBAR_EXPANDED_ROW =
  "grid w-full grid-cols-[17px_minmax(0,1fr)] items-center gap-x-3 border-l-[3px] border-l-transparent py-2 pl-3 pr-2.5";

export function WorkspaceSectionStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 sm:gap-8 lg:gap-10",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Premium SaaS surface — soft elevation, minimal border, subtle hover depth */
export function WorkspaceSurfaceCard({
  children,
  className,
  padding = "p-1 sm:p-1.5",
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/30 bg-card/90 shadow-elevate-sm ring-1 ring-black/[0.03] backdrop-blur-[1px] transition-[box-shadow,border-color,background-color] duration-200 ease-smooth",
        "dark:border-border/40 dark:bg-card/80 dark:ring-white/[0.05]",
        "hover:border-border/45 hover:shadow-elevate-md dark:hover:border-border/50",
        padding,
        className
      )}
    >
      {children}
    </section>
  );
}
