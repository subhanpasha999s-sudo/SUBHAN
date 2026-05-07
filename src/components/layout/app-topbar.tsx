"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, MenuIcon } from "lucide-react";

import {
  WORKSPACE_GUTTERS,
  WORKSPACE_MAX_W,
} from "@/components/layout/workspace-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { useAuth } from "@/lib/supabase/auth-context";

function mobileBreadcrumb(pathname: string): string {
  if (pathname === "/" || pathname === "") return "Home";
  if (pathname.startsWith("/export-labels")) return "PDFs / SKU mapping";
  if (pathname.startsWith("/mapping")) return "SKU mapping";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/privacy")) return "Privacy";
  if (pathname.startsWith("/terms")) return "Terms";
  return "Workspace";
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

  return (
    <header className="sticky top-0 z-30 pt-safe-top">
      {/* Premium mobile chrome: translucent bar, slim divider */}
      <div className="border-b border-white/[0.06] bg-background/80 shadow-[inset_0_-1px_0_0_rgb(148_163_184/0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/72 dark:bg-background/78 dark:border-white/[0.05] dark:shadow-[inset_0_-1px_0_0_rgb(255_255_255/0.04)]">
      <div
        className={cn(
          "mx-auto flex w-full items-center gap-2 sm:gap-4",
          "min-h-[56px] py-2 sm:py-2",
          WORKSPACE_MAX_W,
          WORKSPACE_GUTTERS
        )}
      >
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
            Label Workspace
          </span>
          <span className="mt-px block truncate text-[11px] font-medium text-muted-foreground">
            {mobileBreadcrumb(pathname)}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5 lg:justify-end">
          {guestSignedOut ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 min-h-10 w-10 shrink-0 text-primary hover:bg-primary/10 sm:size-10"
              aria-label="Profile — sign in with email code"
              onClick={openOptionalSignIn}
            >
              <CircleUserRound className="size-[22px] sm:size-5" strokeWidth={1.65} aria-hidden />
            </Button>
          ) : authReady && user ? (
            <Link
              href="/settings"
              prefetch={false}
              aria-label="Account · Settings"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "h-10 min-h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground sm:size-10"
              )}
            >
              <CircleUserRound className="size-[21px] sm:size-5" strokeWidth={1.5} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
      </div>
    </header>
  );
}
