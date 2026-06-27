"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  ChevronsLeft,
  CircleUserRound,
  FileScan,
  Link2,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";

import { TulminLogoMark } from "@/components/brand/tulmin-logo";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { AppSwitcher } from "@/components/app-switcher";
import { Button } from "@/components/ui/button";
import { AppFooter } from "@/components/layout/app-footer";
import { AppTopbar } from "@/components/layout/app-topbar";
import { MobileNavDrawerPortal } from "@/components/layout/mobile-nav-drawer-portal";
import {
  SIDEBAR_PAD_X,
  WORKSPACE_GUTTERS,
  WORKSPACE_MAX_W,
} from "@/components/layout/workspace-layout";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/supabase/auth-context";
import { useMeeshoStore } from "@/store/use-meesho-store";

type NavDef = {
  href?: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  step?: string;
  soon?: boolean;
  /** Same-path shortcuts (e.g. Filters) — never show active rail */
  quickLink?: boolean;
};

type NavGroup = { id: string; label: string; items: NavDef[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "flow",
    label: "Flow",
    items: [
      {
        href: "/mapping",
        label: "SKU Mapping",
        description: "Save SKU names once",
        icon: Link2,
        step: "01",
      },
      {
        href: "/export-labels",
        label: "Run Labels",
        description: "Filter, crop, export",
        icon: FileScan,
        step: "02",
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        href: "/settings",
        label: "Settings",
        description: "Theme and data",
        icon: Settings2,
      },
    ],
  },
];

type URLSearchParamsLike = { get: (key: string) => string | null };

const EMPTY_SEARCH_PARAMS: URLSearchParamsLike = new URLSearchParams();

const railEase = "cubic-bezier(0.32, 0.72, 0, 1)";
const navInteraction =
  "transition-[background-color,box-shadow,color,transform] duration-150 ease-smooth active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100";
const TOUR_MOBILE_NAV_EVENT = "tulmin:tour-mobile-nav";

function SidebarBrandSigil({ compact = false }: { compact?: boolean }) {
  return (
    <TulminLogoMark
      className={cn("shrink-0", compact ? "size-11" : "size-9")}
      imageClassName="drop-shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
    />
  );
}

function navItemActive(pathname: string, sp: URLSearchParamsLike, item: NavDef): boolean {
  if (!item.href || item.soon || item.quickLink) return false;
  const [rawPath, rawQuery = ""] = item.href.split("?");
  const path = rawPath || "/";
  const pathMatches =
    path === "/"
      ? pathname === "/" || pathname === ""
      : pathname === path || pathname.startsWith(`${path}/`);
  if (!pathMatches) return false;
  const want = new URLSearchParams(rawQuery);
  if ([...want.keys()].length === 0) return true;
  for (const [k, v] of want.entries()) {
    if (sp.get(k) !== v) return false;
  }
  return true;
}

function SidebarNavButton({
  item,
  pathname,
  searchParams,
  collapsed,
  comfortTouch,
  onNavigate,
}: {
  item: NavDef;
  pathname: string;
  searchParams: URLSearchParamsLike;
  collapsed: boolean;
  comfortTouch?: boolean;
  onNavigate?: () => void;
}) {
  const active = item.href ? navItemActive(pathname, searchParams, item) : false;
  const Icon = item.icon;

  const content = (
    <>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl transition-[background-color,box-shadow,color,transform] duration-200 ease-smooth",
          collapsed ? "size-10" : "size-8",
          active
            ? "bg-[var(--sidebar-primary)] text-[var(--sidebar-primary-foreground)] shadow-[0_10px_24px_-18px_rgb(59_130_246/0.95),inset_0_1px_0_rgb(255_255_255/0.18)]"
            : "bg-[color-mix(in_srgb,var(--sidebar-foreground)_5%,transparent)] text-[color-mix(in_srgb,var(--sidebar-foreground)_70%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--sidebar-foreground)_10%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--sidebar-primary)_12%,transparent)] group-hover:text-[var(--sidebar-foreground)]"
        )}
      >
        <Icon
          className={cn(
            "shrink-0 transition-transform duration-200 ease-smooth",
            collapsed ? "size-[18px]" : "size-[16px]",
            active && "scale-[1.03] motion-reduce:scale-100"
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 text-left leading-tight">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-[13px] font-semibold text-sidebar-foreground/92">
              {item.label}
            </span>
            {item.step ? (
              <span className="rounded-md bg-sidebar-foreground/[0.045] px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-sidebar-foreground/42 ring-1 ring-sidebar-foreground/8">
                {item.step}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] font-medium text-sidebar-foreground/42">
            {item.description}
          </span>
        </span>
      )}
      {!collapsed && item.badge ? (
        <span className="shrink-0 rounded-md bg-sidebar-primary/18 px-1.5 py-px text-[10px] font-semibold tabular-nums text-sidebar-primary">
          {item.badge}
        </span>
      ) : null}
      {!collapsed && item.soon ? (
        <span className="shrink-0 rounded-full bg-sidebar-foreground/[0.07] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sidebar-foreground/45 ring-1 ring-sidebar-foreground/10">
          Soon
        </span>
      ) : null}
    </>
  );

  const itemClass = cn(
    "group relative flex w-full touch-manipulation items-center outline-none select-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]",
    navInteraction,
    collapsed
      ? "mx-auto h-12 w-12 justify-center rounded-2xl border border-transparent p-0"
      : cn(
          "gap-3 rounded-xl py-2 pl-2 pr-2.5",
          comfortTouch && "min-h-[3.25rem] py-2.5"
        ),
    item.soon && "cursor-not-allowed opacity-55",
    active &&
      !item.soon &&
      cn(
        "bg-[var(--sidebar-accent)] text-sidebar-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.055),0_0_0_1px_rgb(91_156_247/0.14)]",
        "before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-6 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary before:content-['']",
        collapsed &&
          "border-[color-mix(in_srgb,var(--sidebar-primary)_34%,transparent)] bg-[color-mix(in_srgb,var(--sidebar-primary)_12%,transparent)] before:left-0.5",
        "dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.045),0_0_0_1px_rgb(96_165_250/0.13)]"
      ),
    !active &&
      !item.soon &&
      "text-sidebar-foreground/68 hover:bg-[var(--sidebar-accent)] hover:text-sidebar-foreground hover:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.035)]"
  );

  if (item.soon || !item.href) {
    return (
      <span
        role="link"
        aria-disabled="true"
        title={collapsed ? item.label : undefined}
        className={itemClass}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={itemClass}
      {...(item.href === "/mapping" ? { "data-tour": "sku-map-link" } : {})}
    >
      {content}
    </Link>
  );
}

function SidebarNavHydrated({
  pathname,
  collapsed,
  comfortTouch,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  comfortTouch?: boolean;
  onNavigate?: () => void;
}) {
  const searchParams = useSearchParams();
  return (
    <SidebarNavBody
      pathname={pathname}
      searchParams={searchParams}
      collapsed={collapsed}
      comfortTouch={comfortTouch}
      onNavigate={onNavigate}
    />
  );
}

function SidebarNavBody({
  pathname,
  searchParams,
  collapsed,
  comfortTouch,
  onNavigate,
}: {
  pathname: string;
  searchParams: URLSearchParamsLike;
  collapsed: boolean;
  comfortTouch?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.id} className={cn(gi > 0 && "mt-5")}>
          {!collapsed && (
            <div
              className={cn(
                "mb-2 px-1",
                SIDEBAR_PAD_X
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/34">
                {group.label}
              </span>
            </div>
          )}
          <div
            className={cn(
              "flex flex-col gap-0.5",
              collapsed ? "px-2" : SIDEBAR_PAD_X
            )}
          >
            {group.items.map((item) => (
              <SidebarNavButton
                key={`${group.id}-${item.label}`}
                item={item}
                pathname={pathname}
                searchParams={searchParams}
                collapsed={collapsed}
                comfortTouch={comfortTouch}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function SidebarChrome({
  variant,
  collapsed,
  pathname,
  onCollapseClick,
  onNavNavigate,
  onMobileClose,
}: {
  variant: "desktop" | "mobile";
  collapsed: boolean;
  pathname: string;
  onCollapseClick: () => void;
  onNavNavigate?: () => void;
  onMobileClose?: () => void;
}) {
  const navCollapsed = variant === "mobile" ? false : collapsed;
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  const guestSignedOut = authReady && !user;
  const userEmail = user?.email ?? "";
  const showExpandedChrome = !(navCollapsed && variant === "desktop");

  return (
    <>
      {/* Header */}
      <header
        className={cn(
          "flex shrink-0 flex-col gap-3 border-b border-sidebar-border/18 pb-3.5 pt-[calc(0.9rem+env(safe-area-inset-top,0px))]",
          navCollapsed && variant === "desktop"
            ? "items-center px-2"
            : SIDEBAR_PAD_X,
          variant === "desktop" && "lg:pt-4",
          variant === "mobile" && "relative pr-14"
        )}
      >
        {navCollapsed && variant === "desktop" ? (
          <>
            <button
              type="button"
              onClick={onCollapseClick}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className={cn(
                "flex size-12 items-center justify-center rounded-2xl border border-sidebar-border/45",
                "bg-sidebar-accent/65 text-sidebar-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_14px_34px_-24px_rgb(59_130_246/0.55)]",
                "transition-[background-color,color,box-shadow,transform] duration-150 ease-smooth hover:-translate-y-0.5 hover:bg-sidebar-accent hover:text-sidebar-primary active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]"
              )}
            >
              <ChevronsLeft className="size-5 rotate-180" strokeWidth={1.85} />
            </button>
            <Link
              href="/"
              prefetch={false}
              title="Back to Tulmin landing page"
              aria-label="Back to Tulmin landing page"
              className="rounded-xl outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-sidebar-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]"
            >
              <SidebarBrandSigil compact />
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <Link
                href="/"
                prefetch={false}
                onClick={variant === "mobile" ? onMobileClose : undefined}
                title="Back to Tulmin landing page"
                aria-label="Back to Tulmin landing page"
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sidebar-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]"
              >
                <SidebarBrandSigil />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[15px] font-semibold tracking-tight text-sidebar-foreground">
                    Tulmin
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-medium text-sidebar-foreground/42">
                    Dispatch AI workspace
                  </span>
                </span>
              </Link>
              {variant === "desktop" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onCollapseClick}
                  title="Collapse sidebar"
                  className="-mr-1 size-9 shrink-0 rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <ChevronsLeft
                    className="size-[18px] transition-transform duration-300 ease-panel"
                    strokeWidth={1.65}
                  />
                  <span className="sr-only">Collapse navigation</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onMobileClose}
                  className={cn(
                    "absolute right-3 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-[1]",
                    "-mr-1 size-11 rounded-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <X className="size-[22px]" strokeWidth={1.6} />
                  <span className="sr-only">Close menu</span>
                </Button>
              )}
            </div>
            <AppSwitcher className="w-full" />
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]">
        <nav
          className={cn("flex flex-col pb-5", showExpandedChrome ? "pt-4" : "pt-3")}
          aria-label={variant === "mobile" ? "Main navigation" : undefined}
        >
          <Suspense
            fallback={
              <SidebarNavBody
                pathname={pathname}
                searchParams={EMPTY_SEARCH_PARAMS}
                collapsed={navCollapsed}
                comfortTouch={variant === "mobile"}
                onNavigate={onNavNavigate}
              />
            }
          >
            <SidebarNavHydrated
              pathname={pathname}
              collapsed={navCollapsed}
              comfortTouch={variant === "mobile"}
              onNavigate={
                variant === "mobile"
                  ? () => {
                      window.setTimeout(() => onNavNavigate?.(), 80);
                    }
                  : onNavNavigate
              }
            />
          </Suspense>
        </nav>
      </div>

      <footer
        className={cn(
          "mt-auto shrink-0 border-t border-sidebar-border/18 bg-sidebar/35 px-4 py-3 backdrop-blur-sm",
          variant === "mobile"
            ? "pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "pb-4",
          navCollapsed ? "px-2" : SIDEBAR_PAD_X
        )}
      >
        {navCollapsed && variant === "desktop" ? (
          <Link
            href="/account"
            prefetch={false}
            title={user ? "Account" : "Sign in to sync"}
            className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-sidebar-accent/65 text-sidebar-foreground/70 ring-1 ring-sidebar-border/35 transition-colors hover:text-sidebar-foreground"
          >
            <CircleUserRound className="size-[18px]" strokeWidth={1.65} aria-hidden />
          </Link>
        ) : guestSignedOut ? (
          <button
            type="button"
            onClick={() => {
              openOptionalSignIn();
              onNavNavigate?.();
            }}
            className="group flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[12px] font-semibold text-sidebar-foreground/75 ring-1 ring-sidebar-border/25 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-foreground/[0.04] text-sidebar-primary ring-1 ring-sidebar-border/25">
              <CircleUserRound className="size-[15px]" strokeWidth={1.7} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">Sync workspace</span>
            </span>
          </button>
        ) : authReady && user ? (
          <Link
            href="/account"
            prefetch={false}
            onClick={onNavNavigate}
            className="flex min-h-12 items-center gap-3 rounded-2xl px-2.5 text-[13px] font-semibold text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-200">
              <BadgeCheck className="size-[17px]" strokeWidth={1.7} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">Account</span>
              <span className="mt-0.5 block truncate text-[10.5px] font-medium text-sidebar-foreground/48">
                {userEmail || "Workspace synced"}
              </span>
            </span>
          </Link>
        ) : (
          <div className="flex min-h-12 items-center gap-3 rounded-2xl px-2.5 text-sidebar-foreground/45">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-foreground/[0.045]">
              <Sparkles className="size-[17px]" strokeWidth={1.7} aria-hidden />
            </span>
            <span className="text-[12px] font-medium">Preparing workspace</span>
          </div>
        )}
      </footer>

    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const persistedCollapsed = useMeeshoStore((s) => s.sidebarCollapsed);
  const setCollapsed = useMeeshoStore((s) => s.setSidebarCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const collapsedDesktop = hydrated ? persistedCollapsed : false;

  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), []);

  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const onTourMobileNav = (event: Event) => {
      const custom = event as CustomEvent<{ open?: boolean }>;
      setMobileNavOpen(Boolean(custom.detail?.open));
    };
    window.addEventListener(TOUR_MOBILE_NAV_EVENT, onTourMobileNav);
    return () => {
      window.removeEventListener(TOUR_MOBILE_NAV_EVENT, onTourMobileNav);
    };
  }, []);

  const drawerOpen = mobileNavOpen;

  if (pathname === "/" || pathname === "") {
    return (
      <div className="min-h-app-screen bg-background font-sans text-foreground antialiased dark:bg-background">
        {children}
      </div>
    );
  }

  return (
    <div className="relative min-h-app-screen w-full bg-background font-sans text-foreground antialiased dark:bg-background">
      <aside
        aria-label="Main navigation"
        style={{ transitionTimingFunction: railEase } as React.CSSProperties}
        className={cn(
          "hidden lg:flex lg:translate-x-0",
          "fixed inset-y-0 left-0 z-[38] flex-col text-sidebar-foreground",
          "bg-sidebar-rail backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/88",
          "shadow-sidebar-panel transition-[width] duration-200 ease-panel will-change-[width] motion-reduce:transition-none",
          collapsedDesktop ? "lg:w-[4.875rem]" : "lg:w-[16.25rem]"
        )}
      >
        <SidebarChrome
          variant="desktop"
          collapsed={collapsedDesktop}
          pathname={pathname}
          onCollapseClick={() => setCollapsed(!collapsedDesktop)}
        />
      </aside>

      <MobileNavDrawerPortal open={drawerOpen} onClose={closeMobileNav}>
        <aside
          id="main-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          tabIndex={-1}
          className={cn(
            "relative flex h-full min-h-0 w-full flex-col rounded-r-[22px] border-r border-white/[0.06] bg-sidebar-rail",
            "pb-[env(safe-area-inset-bottom)] shadow-[16px_0_44px_-30px_rgb(0_0_0/0.42)] backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/92",
            "outline-none animate-in slide-in-from-left duration-200 ease-panel motion-reduce:animate-none motion-reduce:duration-0"
          )}
        >
          <SidebarChrome
            variant="mobile"
            collapsed={false}
            pathname={pathname}
            onCollapseClick={() => setCollapsed(!collapsedDesktop)}
            onNavNavigate={closeMobileNav}
            onMobileClose={closeMobileNav}
          />
        </aside>
      </MobileNavDrawerPortal>

      <div
        className={cn(
          "relative flex min-h-app-screen min-w-0 flex-col bg-background pb-[env(safe-area-inset-bottom)]",
          "transition-[padding] duration-200 ease-panel motion-reduce:transition-none",
          collapsedDesktop ? "lg:pl-[4.875rem]" : "lg:pl-[16.25rem]"
        )}
      >
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_82%_52%_at_50%_-14%,rgb(59_130_246/0.045),transparent_56%)] dark:bg-[radial-gradient(ellipse_78%_46%_at_50%_-10%,rgb(96_165_250/0.05),transparent_55%)]" />
        <AppTopbar
          mobileNavOpen={drawerOpen}
          onMobileMenuToggle={() => setMobileNavOpen((o) => !o)}
        />
        <main
          className={cn(
            "motion-page-enter mx-auto flex w-full min-h-0 flex-1 flex-col",
            WORKSPACE_MAX_W,
            WORKSPACE_GUTTERS,
            "pb-8 pt-6 sm:pb-10 sm:pt-8 lg:pb-12 lg:pt-9"
          )}
        >
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
