import type { ReactNode } from "react";
import Link from "next/link";

import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function ModulePageHeader({
  breadcrumb,
  title,
  description,
  badges,
  actions,
  accentClassName,
}: {
  breadcrumb: BreadcrumbItem[];
  title: string;
  description?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  accentClassName?: string;
}) {
  return (
    <header className="overflow-hidden rounded-xl border border-border bg-card shadow-layer-card ring-1 ring-border/20 sm:rounded-2xl">
      <div className="px-4 py-5 sm:px-7 sm:py-7 md:px-8 md:py-8">
        <nav
          className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground sm:mb-4 sm:text-[13px]"
          aria-label="Breadcrumb"
        >
          {breadcrumb.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {i > 0 ? (
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted-foreground/70"
                  aria-hidden
                />
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="min-h-11 touch-manipulation rounded-md font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="min-w-0 space-y-2.5 sm:space-y-3">
            <h1 className="text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-[1.65rem] sm:leading-tight md:text-[1.75rem] lg:max-w-3xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground sm:text-[15px]">
                {description}
              </p>
            ) : null}
            {badges ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">{badges}</div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex w-full shrink-0 flex-col gap-2.5 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:pt-0 lg:w-auto lg:justify-end">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "h-px w-full shrink-0",
          accentClassName || "bg-border"
        )}
        aria-hidden
      />
    </header>
  );
}
