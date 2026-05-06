"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  FileDown,
  Link2,
  Menu,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppFooter } from "@/components/layout/app-footer";
import { WorkspaceFlowerBg } from "@/components/layout/workspace-flower-bg";
import { AppTopbar } from "@/components/layout/app-topbar";
import { MobileNavDrawerPortal } from "@/components/layout/mobile-nav-drawer-portal";
import {
  APP_CHROME_UNDERLINE,
  APP_SIDEBAR_BRAND_ROW,
  SIDEBAR_EXPANDED_GUTTER_X,
  SIDEBAR_EXPANDED_ROW,
  WORKSPACE_GUTTERS,
  WORKSPACE_MAX_W,
} from "@/components/layout/workspace-layout";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { useMeeshoStore } from "@/store/use-meesho-store";

const nav = [
  { href: "/export-labels", label: "Label PDF", icon: FileDown },
  { href: "/mapping", label: "SKU Mapping", icon: Link2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const sidebarInteraction =
  "transition-[background-color,border-color,color,transform] duration-200 ease-smooth active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100";

type SidebarNavLinksProps = {
  pathname: string;
  collapsed: boolean;
  /** Phone drawer: 44px+ touch rows, Zoho-style list rhythm */
  comfortTouch?: boolean;
  onNavigate?: () => void;
};

/** Isolated from shell body so route content re-renders don’t rebuild nav nodes. */
const SidebarNavLinks = React.memo(function SidebarNavLinks({
  pathname,
  collapsed,
  comfortTouch = false,
  onNavigate,
}: SidebarNavLinksProps) {
  return (
    <>
      {nav.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "w-full touch-manipulation rounded-md text-[13px] font-medium leading-snug outline-none select-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]",
              sidebarInteraction,
              collapsed
                ? "flex min-h-10 justify-center gap-0 border-l-0 px-0 py-2"
                : cn(
                    SIDEBAR_EXPANDED_ROW,
                    comfortTouch
                      ? "min-h-12 rounded-[10px] py-3 pl-3 pr-2.5"
                      : "min-h-9"
                  ),
              active
                ? collapsed
                  ? "bg-sidebar-primary/12 text-sidebar-primary"
                  : "border-l-sidebar-primary bg-sidebar-primary/[0.09] font-medium text-sidebar-foreground [&_svg]:text-sidebar-primary dark:bg-sidebar-primary/[0.14]"
                : collapsed
                  ? "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  : "text-sidebar-foreground/68 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Icon
              className={cn(
                "size-[17px] shrink-0 transition-transform duration-200 ease-smooth motion-reduce:transition-none",
                active && "scale-[1.04] motion-reduce:scale-100"
              )}
              strokeWidth={1.5}
              aria-hidden
            />
            {!collapsed && (
              <span className="min-w-0 truncate">{item.label}</span>
            )}
          </Link>
        );
      })}
    </>
  );
});

/** Shared chrome for desktop sidebar + portal mobile drawer (two instances; stateless JSX). */
function SidebarRailPanels({
  variant,
  collapsed,
  pathname,
  onCollapseClick,
  onNavNavigate,
}: {
  variant: "desktop" | "mobile";
  collapsed: boolean;
  pathname: string;
  onCollapseClick: () => void;
  onNavNavigate?: () => void;
}) {
  /** Mobile drawer always expands labels/icons for touch UX (ignore persisted collapsed). */
  const navCollapsed =
    variant === "mobile" ? false : collapsed;
  const brandCollapsed =
    variant === "mobile" ? false : collapsed;

  return (
    <>
      <div
        className={cn(
          "box-border flex items-center",
          variant === "mobile" && "pt-safe-top",
          brandCollapsed ? "justify-center px-2" : SIDEBAR_EXPANDED_GUTTER_X,
          APP_SIDEBAR_BRAND_ROW,
          APP_CHROME_UNDERLINE
        )}
      >
        {!brandCollapsed ? (
          <div
            className={cn(
              SIDEBAR_EXPANDED_ROW,
              "items-center border-l-transparent"
            )}
          >
            <span className="block size-[17px] shrink-0" aria-hidden />
            <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-none">
              <span className="text-[0.9375rem] font-semibold tracking-tight text-sidebar-foreground">
                Label
              </span>
              <span className="text-[11px] font-normal leading-snug tracking-wide text-sidebar-foreground/48">
                Label PDF · SKU Mapping
              </span>
            </div>
          </div>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/90">
            L
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]">
        <nav
          className={cn(
            "flex flex-col gap-0.5 pb-28 pt-2",
            navCollapsed ? "px-2" : SIDEBAR_EXPANDED_GUTTER_X
          )}
          aria-labelledby={variant === "mobile" ? "mobile-nav-heading" : undefined}
        >
          {variant === "mobile" ? (
            <div className="px-3 pb-2 pt-0.5" id="mobile-nav-heading">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/38">
                Navigate
              </p>
            </div>
          ) : null}
          <SidebarNavLinks
            pathname={pathname}
            collapsed={navCollapsed}
            comfortTouch={variant === "mobile"}
            onNavigate={onNavNavigate}
          />
        </nav>
      </div>
      <div
        className={cn(
          "absolute bottom-3 flex flex-col gap-2",
          navCollapsed ? "left-2 right-2" : "left-3 right-3"
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "hidden h-9 w-full border border-transparent bg-transparent text-[12px] font-medium text-sidebar-foreground/75 shadow-none transition-[background-color,border-color,color,transform] duration-200 ease-smooth hover:border-sidebar-border/50 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 lg:inline-flex",
            collapsed && "justify-center px-2"
          )}
          onClick={onCollapseClick}
        >
          {collapsed ? (
            <Menu className="size-4" strokeWidth={1.5} />
          ) : (
            <>
              <ChevronLeft className="size-4" strokeWidth={1.5} /> Collapse
            </>
          )}
        </Button>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const persistedCollapsed = useMeeshoStore((s) => s.sidebarCollapsed);
  const setCollapsed = useMeeshoStore((s) => s.setSidebarCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  /** Until Zustand rehydrates from storage, render expanded desktop rail (stable SSR ↔ first paint). */
  const collapsedDesktop = hydrated ? persistedCollapsed : false;

  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), []);

  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const desktopSidebarW = collapsedDesktop ? "lg:w-[4.25rem]" : "lg:w-[15rem]";
  const mainOffset = collapsedDesktop ? "lg:pl-[4.25rem]" : "lg:pl-[15rem]";

  const drawerOpen = mobileNavOpen;

  return (
    <div className="relative min-h-app-screen w-full bg-[#eef1f6] font-sans text-foreground antialiased dark:bg-background">
      {/* Desktop: fixed rail only (`hidden` removes it from layout on small screens). */}
      <aside
        aria-label="Main navigation"
        className={cn(
          "hidden lg:flex lg:translate-x-0",
          "fixed inset-y-0 left-0 z-[38] w-[min(17.5rem,88vw)] max-w-[18rem] flex-col bg-sidebar text-sidebar-foreground shadow-sidebar-panel transition-[width] duration-300 ease-panel lg:border-r lg:border-border lg:backdrop-blur-none",
          desktopSidebarW
        )}
      >
        <SidebarRailPanels
          variant="desktop"
          collapsed={collapsedDesktop}
          pathname={pathname}
          onCollapseClick={() => setCollapsed(!persistedCollapsed)}
        />
      </aside>

      <MobileNavDrawerPortal open={drawerOpen} onClose={closeMobileNav}>
        <aside
          id="main-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
          tabIndex={-1}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[min(17.5rem,88vw)] max-w-[18rem] flex-col border-r border-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground shadow-sidebar-panel outline-none animate-in slide-in-from-left duration-300 ease-panel motion-reduce:animate-none motion-reduce:duration-0 lg:hidden"
          )}
        >
          <SidebarRailPanels
            variant="mobile"
            collapsed={persistedCollapsed}
            pathname={pathname}
            onCollapseClick={() => setCollapsed(!persistedCollapsed)}
            onNavNavigate={closeMobileNav}
          />
        </aside>
      </MobileNavDrawerPortal>

      <div
        className={cn(
          "relative flex min-h-app-screen min-w-0 flex-col bg-background pb-[env(safe-area-inset-bottom)]",
          mainOffset
        )}
      >
        <WorkspaceFlowerBg />
        <AppTopbar
          mobileNavOpen={drawerOpen}
          onMobileMenuToggle={() =>
            setMobileNavOpen((o) => !o)
          }
        />
        <main
          className={cn(
            "mx-auto flex w-full flex-1 flex-col min-h-0",
            WORKSPACE_MAX_W,
            WORKSPACE_GUTTERS,
            "pb-6 pt-5 sm:pb-8 sm:pt-8 lg:pb-10"
          )}
        >
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
