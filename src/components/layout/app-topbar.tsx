"use client";

import Link from "next/link";
import { CircleUserRound, MenuIcon } from "lucide-react";

import {
  APP_TOPBAR_INNER_ROW,
  WORKSPACE_GUTTERS,
  WORKSPACE_MAX_W,
} from "@/components/layout/workspace-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { useAuth } from "@/lib/supabase/auth-context";

export function AppTopbar({
  mobileNavOpen,
  onMobileMenuToggle,
}: {
  mobileNavOpen: boolean;
  onMobileMenuToggle: () => void;
}) {
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();

  const guestSignedOut = authReady && !user;

  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-card/95 pt-safe-top shadow-chrome-under backdrop-blur-md supports-[backdrop-filter]:bg-card/82">
      {/* `border-b` lives on this row (same as sidebar brand strip) so the rule shares one Y with the rail — not on `<header>` where it sat below the inner `h-14` box */}
      <div
        className={cn(
          "mx-auto box-border flex w-full items-center gap-2.5 border-b border-transparent sm:gap-4",
          APP_TOPBAR_INNER_ROW,
          WORKSPACE_MAX_W,
          WORKSPACE_GUTTERS
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="touch-manipulation min-h-11 min-w-11 shrink-0 lg:hidden"
          aria-expanded={mobileNavOpen}
          aria-controls="main-nav-drawer"
          aria-label={
            mobileNavOpen ? "Close navigation menu" : "Open navigation menu"
          }
          onClick={onMobileMenuToggle}
        >
          <MenuIcon className="size-6" aria-hidden />
        </Button>

        <div className="flex min-w-0 flex-1 flex-col truncate lg:hidden">
          <span className="block truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">
            Label Workspace
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-foreground">
            PDFs · SKU map · Settings
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5 lg:justify-end">
          {guestSignedOut ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-primary hover:bg-primary/10 sm:size-10"
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
                "size-11 shrink-0 text-muted-foreground hover:text-foreground sm:size-10"
              )}
            >
              <CircleUserRound className="size-[22px] sm:size-5" strokeWidth={1.5} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
