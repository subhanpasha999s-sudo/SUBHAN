"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BookOpenText,
  CircleUserRound,
  FileDown,
  Link2,
  MenuIcon,
  Sparkles,
} from "lucide-react";

import {
  WORKSPACE_GUTTERS,
  WORKSPACE_MAX_W,
} from "@/components/layout/workspace-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { useAuth } from "@/lib/supabase/auth-context";

function pageChrome(pathname: string) {
  const p = pathname || "";
  if (p === "/" || p === "") {
    return {
      title: "Tulmin",
      subtitle: "Smart label filtering for marketplace sellers",
      ctaHref: "/mapping",
      ctaLabel: "Map SKUs",
    };
  }
  if (p.startsWith("/export-labels")) {
    return {
      title: "Run Labels",
      subtitle: "",
      ctaHref: "/mapping",
      ctaLabel: "Map SKUs",
    };
  }
  if (p.startsWith("/mapping")) {
    return {
      title: "SKU Mapping",
      subtitle: "",
      ctaHref: "/export-labels",
      ctaLabel: "Run labels",
    };
  }
  if (p.startsWith("/blog")) {
    return {
      title: "Playbooks",
      subtitle: "Meesho seller workflows and operating guides",
      ctaHref: "/export-labels",
      ctaLabel: "Try workflow",
    };
  }
  if (p.startsWith("/settings")) {
    return {
      title: "Settings",
      subtitle: "Workspace, theme, and data controls",
      ctaHref: "/export-labels",
      ctaLabel: "Back to work",
    };
  }
  if (p.startsWith("/account")) {
    return {
      title: "Account",
      subtitle: "Profile and cloud sync",
      ctaHref: "/export-labels",
      ctaLabel: "Back to work",
    };
  }
  if (p.startsWith("/privacy")) {
    return {
      title: "Privacy",
      subtitle: "Tulmin policy",
      ctaHref: "/export-labels",
      ctaLabel: "Back to app",
    };
  }
  if (p.startsWith("/terms")) {
    return {
      title: "Terms",
      subtitle: "Tulmin legal",
      ctaHref: "/export-labels",
      ctaLabel: "Back to app",
    };
  }
  return {
    title: "Tulmin",
    subtitle: "Marketplace dispatch · labels",
    ctaHref: "/export-labels",
    ctaLabel: "Start run",
  };
}

const TOPBAR_FLOW = [
  { href: "/mapping", label: "Map", icon: Link2 },
  { href: "/export-labels", label: "Run", icon: FileDown },
  { href: "/blog", label: "Learn", icon: BookOpenText },
];

function flowItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppTopbar({
  mobileNavOpen,
  onMobileMenuToggle,
}: {
  mobileNavOpen: boolean;
  onMobileMenuToggle: () => void;
}) {
  const pathname = usePathname();
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();

  const guestSignedOut = authReady && !user;
  const { title, subtitle, ctaHref, ctaLabel } = pageChrome(pathname);

  return (
    <header className="sticky top-0 z-30 pt-safe-top">
      <div className="border-b border-white/[0.05] bg-background/90 shadow-[0_12px_34px_-30px_rgb(15_23_42/0.5),inset_0_-1px_0_0_rgb(148_163_184/0.05)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 dark:bg-background/84 dark:border-white/[0.04] dark:shadow-[0_16px_40px_-34px_rgb(0_0_0/0.8),inset_0_-1px_0_0_rgb(255_255_255/0.03)]">
        <div
          className={cn(
            "mx-auto flex w-full max-w-[100vw] items-center gap-3 sm:gap-4",
            "min-h-[60px] py-2.5",
            WORKSPACE_MAX_W,
            WORKSPACE_GUTTERS
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="touch-manipulation h-10 min-h-10 w-10 min-w-10 shrink-0 lg:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="main-nav-drawer"
              aria-label={
                mobileNavOpen ? "Close navigation menu" : "Open navigation menu"
              }
              onClick={onMobileMenuToggle}
            >
              <MenuIcon className="size-[22px]" aria-hidden />
            </Button>

            <div className="flex min-w-0 flex-1 flex-col justify-center truncate lg:hidden">
              <span className="block truncate text-[14px] font-semibold leading-tight tracking-tight text-foreground">
                Tulmin
              </span>
              <span className="mt-px block truncate text-[11px] font-medium text-muted-foreground">
                Smart label filtering for marketplace sellers
              </span>
            </div>

            <div className="hidden min-w-0 flex-col justify-center truncate lg:flex">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-[linear-gradient(135deg,rgb(63_108_255/0.24),rgb(16_185_129/0.12))] text-primary shadow-[0_16px_34px_-28px_rgb(63_108_255/0.9),inset_0_1px_0_rgb(255_255_255/0.12)]">
                  <Sparkles className="size-[18px]" strokeWidth={1.8} aria-hidden />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-[20px] font-semibold leading-tight tracking-tight text-foreground">
                    {title}
                  </h1>
                  {subtitle ? (
                    <p className="mt-1 truncate text-[12px] font-medium text-muted-foreground/90">
                      {subtitle}
                    </p>
                  ) : null}
                </div>
                <div className="hidden items-center gap-1 rounded-2xl border border-border/55 bg-card/75 p-1.5 shadow-elevate-sm ring-1 ring-white/[0.035] xl:flex">
                  {TOPBAR_FLOW.map((item) => {
                    const active = flowItemActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold transition-[background-color,color,box-shadow,transform] duration-200 ease-smooth hover:-translate-y-px",
                          active
                            ? "bg-primary text-primary-foreground shadow-[0_14px_28px_-18px_rgb(63_108_255/0.95)]"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground hover:shadow-elevate-xs"
                        )}
                      >
                        <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div
            className="flex shrink-0 items-center gap-1 sm:gap-2"
            data-tour="login-cloud"
          >
            <Link
              href={ctaHref}
              prefetch={false}
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "hidden h-10 rounded-2xl px-4 text-[13px] font-semibold shadow-[0_16px_34px_-22px_rgb(63_108_255/0.95)] ring-1 ring-primary/20 sm:inline-flex"
              )}
            >
              {ctaLabel}
              <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
            </Link>

            {guestSignedOut ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 min-h-10 w-10 shrink-0 text-primary hover:bg-primary/10 sm:size-10"
                aria-label="Profile — sign in with email code"
                onClick={openOptionalSignIn}
              >
                <CircleUserRound
                  className="size-[22px] sm:size-5"
                  strokeWidth={1.65}
                  aria-hidden
                />
              </Button>
            ) : authReady && user ? (
              <Link
                href="/account"
                prefetch={false}
                aria-label="Tulmin account"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "h-10 min-h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground sm:size-10"
                )}
              >
                <CircleUserRound
                  className="size-[21px] sm:size-5"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
