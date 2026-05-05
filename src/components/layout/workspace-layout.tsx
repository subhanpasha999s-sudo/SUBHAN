import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Pure layout primitives (Server Component compatible).
 * Kept separate from `"use client"` shells so `(main)/layout` does not hydrate the whole subtree.
 */

export const WORKSPACE_MAX_W = "max-w-[1224px]";
/** Narrow phones: tighter Zoho-like gutters; widen at sm/tablet+. */
export const WORKSPACE_GUTTERS = "px-4 sm:px-7 lg:px-10";

export const APP_SIDEBAR_BRAND_ROW = "box-border h-14 shrink-0";

export const APP_TOPBAR_INNER_ROW =
  "box-border min-h-14 shrink-0 lg:h-14 lg:min-h-0 lg:max-h-14";

export const APP_CHROME_UNDERLINE = "border-b border-border";

export const SIDEBAR_EXPANDED_GUTTER_X = "px-3";

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
    <div className={cn("flex flex-col gap-6 sm:gap-8 lg:gap-10", className)}>{children}</div>
  );
}

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
        "rounded-2xl border border-border bg-card shadow-layer-card ring-1 ring-border/20",
        padding,
        className
      )}
    >
      {children}
    </section>
  );
}
