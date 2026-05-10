"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleUserRound, Cloud, MenuIcon } from "lucide-react";

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
    return { title: "Tulmin", subtitle: "Smart label filtering for Meesho sellers" };
  }
  if (p.startsWith("/export-labels")) {
    return { title: "Labels", subtitle: "Filter by SKU · QTY · courier partner" };
  }
  if (p.startsWith("/mapping")) {
    return { title: "SKU Mapping", subtitle: "Link listings to master SKUs" };
  }
  if (p.startsWith("/blog")) {
    return { title: "Blog", subtitle: "Meesho seller guides · Tulmin" };
  }
  if (p.startsWith("/settings")) {
    return { title: "Settings", subtitle: "Theme · data · Tulmin" };
  }
  if (p.startsWith("/account")) {
    return { title: "Account", subtitle: "Profile · Tulmin" };
  }
  if (p.startsWith("/privacy")) {
    return { title: "Privacy", subtitle: "Tulmin policy" };
  }
  if (p.startsWith("/terms")) {
    return { title: "Terms", subtitle: "Tulmin legal" };
  }
  return { title: "Tulmin", subtitle: "Meesho dispatch · labels" };
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
  const { title, subtitle } = pageChrome(pathname);

  return (
    <header className="sticky top-0 z-30 pt-safe-top">
      <div className="border-b border-white/[0.05] bg-background/80 shadow-[inset_0_-1px_0_0_rgb(148_163_184/0.05)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/72 dark:bg-background/76 dark:border-white/[0.04] dark:shadow-[inset_0_-1px_0_0_rgb(255_255_255/0.03)]">
        <div
          className={cn(
            "mx-auto flex w-full max-w-[100vw] items-center gap-3 sm:gap-4",
            "min-h-[56px] py-2.5",
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
                Smart label filtering for Meesho sellers
              </span>
            </div>

            <div className="hidden min-w-0 flex-col justify-center truncate lg:flex">
              <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground/90">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div
              className="hidden items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-white/[0.05] sm:flex dark:bg-muted/22"
              title={
                user
                  ? "Workspace synced — Tulmin can keep your map in the cloud"
                  : "Tulmin Ready — working on this device"
              }
            >
              <Cloud
                className={cn(
                  "size-3.5 shrink-0",
                  user ? "text-primary" : "text-muted-foreground/70"
                )}
                aria-hidden
                strokeWidth={1.75}
              />
              <span className="tabular-nums">{user ? "Workspace synced" : "Tulmin Ready"}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled
              title="Notifications (coming soon)"
              aria-label="Notifications — coming soon"
              className="hidden size-10 text-muted-foreground opacity-35 sm:inline-flex"
            >
              <Bell className="size-[18px]" strokeWidth={1.65} aria-hidden />
            </Button>

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
