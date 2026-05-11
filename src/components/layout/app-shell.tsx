"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  ChevronsLeft,
  CircleUserRound,
  FileDown,
  Layers2,
  Link2,
  Settings2,
  X,
} from "lucide-react";

import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { Button } from "@/components/ui/button";
import { AppFooter } from "@/components/layout/app-footer";
import { WorkspaceFlowerBg } from "@/components/layout/workspace-flower-bg";
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
  icon: LucideIcon;
  badge?: string;
  soon?: boolean;
  /** Same-path shortcuts (e.g. Filters) — never show active rail */
  quickLink?: boolean;
};

type NavGroup = { id: string; label: string; items: NavDef[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/export-labels", label: "Labels", icon: FileDown },
      { href: "/mapping", label: "SKU Mapping", icon: Link2 },
      { href: "/blog", label: "Blog", icon: BookOpenText },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings2 }],
  },
];

type URLSearchParamsLike = { get: (key: string) => string | null };

const EMPTY_SEARCH_PARAMS: URLSearchParamsLike = new URLSearchParams();

const railEase = "cubic-bezier(0.32, 0.72, 0, 1)";
const navInteraction =
  "transition-[background-color,box-shadow,color,transform] duration-200 ease-smooth active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100";

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
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-[color,transform] duration-200 ease-smooth",
          active && "scale-[1.03] text-sidebar-primary motion-reduce:scale-100",
          !active && "text-sidebar-foreground/55 group-hover:text-sidebar-foreground/88"
        )}
        strokeWidth={1.65}
        aria-hidden
      />
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium leading-snug">
          {item.label}
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
      ? "justify-center rounded-xl px-0 py-2.5"
      : cn(
          "gap-3 rounded-xl py-2.5 pl-3 pr-2.5",
          comfortTouch && "min-h-12 py-3"
        ),
    item.soon && "cursor-not-allowed opacity-55",
    active &&
      !item.soon &&
      cn(
        "bg-sidebar-primary/[0.14] text-sidebar-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_0_0_1px_rgb(91_156_247/0.18),0_10px_28px_-16px_rgb(59_130_246/0.45)]",
        "before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-[58%] before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary before:content-['']",
        "dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05),0_0_0_1px_rgb(96_165_250/0.16),0_12px_36px_-18px_rgb(59_130_246/0.35)]"
      ),
    !active &&
      !item.soon &&
      "text-sidebar-foreground/72 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground hover:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)]"
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
        <div key={group.id} className={cn(gi > 0 && "mt-6")}>
          {!collapsed && (
            <p
              className={cn(
                "mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/38",
                SIDEBAR_PAD_X
              )}
            >
              {group.label}
            </p>
          )}
          <div
            className={cn(
              "flex flex-col gap-1",
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

  return (
    <>
      {/* Header */}
      <header
        className={cn(
          "flex shrink-0 flex-col gap-3 border-b border-sidebar-border/25 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]",
          SIDEBAR_PAD_X,
          variant === "desktop" && "lg:pt-5",
          variant === "mobile" && "relative pr-14"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div
              className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary/90 to-[#4178c9] shadow-[0_8px_24px_-14px_rgb(59_130_246/0.55)] ring-1 ring-white/15"
              aria-hidden
            >
              <Layers2 className="size-[20px] text-sidebar-primary-foreground" strokeWidth={1.85} />
            </div>
            {!navCollapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[15px] font-semibold tracking-tight text-sidebar-foreground">
                  Tulmin
                </p>
                <div className="mt-1.5 inline-flex items-center rounded-full bg-emerald-500/14 px-2 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-500/35 dark:text-emerald-200 dark:ring-emerald-400/28">
                  Tulmin Ready
                </div>
              </div>
            )}
          </div>
          {variant === "desktop" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCollapseClick}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "-mr-1 size-9 shrink-0 rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                collapsed && "mx-auto"
              )}
            >
              <ChevronsLeft
                className={cn(
                  "size-[18px] transition-transform duration-300 ease-panel",
                  collapsed && "rotate-180"
                )}
                strokeWidth={1.65}
              />
              <span className="sr-only">
                {collapsed ? "Expand navigation" : "Collapse navigation"}
              </span>
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
        {navCollapsed && variant === "desktop" ? (
          <span
            className="mx-auto block w-full text-center"
            title="Tulmin · Tulmin Ready"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/50">
              TM
            </span>
          </span>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]">
        <nav
          className="flex flex-col pb-36 pt-2"
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
              onNavigate={onNavNavigate}
            />
          </Suspense>
        </nav>
      </div>

      {variant === "mobile" ? (
        <footer
          className={cn(
            "mt-auto shrink-0 space-y-1 border-t border-sidebar-border/30 bg-sidebar/50 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm",
            SIDEBAR_PAD_X
          )}
        >
          {guestSignedOut ? (
            <button
              type="button"
              onClick={() => {
                openOptionalSignIn();
                onNavNavigate?.();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-semibold text-sidebar-primary transition-colors hover:bg-sidebar-primary/12"
            >
              <CircleUserRound className="size-[18px]" strokeWidth={1.6} />
              Sign in to sync
            </button>
          ) : authReady && user ? (
            <Link
              href="/account"
              prefetch={false}
              onClick={onNavNavigate}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent"
            >
              <CircleUserRound className="size-[18px] text-sidebar-foreground/50" strokeWidth={1.6} />
              Account
            </Link>
          ) : null}
        </footer>
      ) : null}
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

  const drawerOpen = mobileNavOpen;

  return (
    <div className="relative min-h-app-screen w-full bg-background font-sans text-foreground antialiased dark:bg-background">
      <aside
        aria-label="Main navigation"
        style={{ transitionTimingFunction: railEase } as React.CSSProperties}
        className={cn(
          "hidden lg:flex lg:translate-x-0",
          "fixed inset-y-0 left-0 z-[38] flex-col text-sidebar-foreground",
          "bg-sidebar-rail backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/86",
          "shadow-sidebar-panel transition-[width] duration-[320ms] ease-panel motion-reduce:transition-none",
          collapsedDesktop ? "lg:w-[4.875rem]" : "lg:w-[16.25rem]"
        )}
      >
        <SidebarChrome
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
          aria-label="Navigation menu"
          tabIndex={-1}
          className={cn(
            "relative flex h-full min-h-0 w-full flex-col rounded-r-[22px] border-r border-white/[0.06] bg-sidebar-rail",
            "pb-[env(safe-area-inset-bottom)] shadow-[16px_0_56px_-28px_rgb(0_0_0/0.45)] backdrop-blur-2xl supports-[backdrop-filter]:bg-sidebar/90",
            "outline-none animate-in slide-in-from-left duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none motion-reduce:duration-0"
          )}
        >
          <SidebarChrome
            variant="mobile"
            collapsed={false}
            pathname={pathname}
            onCollapseClick={() => setCollapsed(!persistedCollapsed)}
            onNavNavigate={closeMobileNav}
            onMobileClose={closeMobileNav}
          />
        </aside>
      </MobileNavDrawerPortal>

      <div
        className={cn(
          "relative flex min-h-app-screen min-w-0 flex-col bg-background pb-[env(safe-area-inset-bottom)]",
          "transition-[padding] duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          collapsedDesktop ? "lg:pl-[4.875rem]" : "lg:pl-[16.25rem]"
        )}
      >
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_82%_52%_at_50%_-14%,rgb(59_130_246/0.045),transparent_56%)] dark:bg-[radial-gradient(ellipse_78%_46%_at_50%_-10%,rgb(96_165_250/0.05),transparent_55%)]" />
        <WorkspaceFlowerBg />
        <AppTopbar
          mobileNavOpen={drawerOpen}
          onMobileMenuToggle={() => setMobileNavOpen((o) => !o)}
        />
        <main
          className={cn(
            "mx-auto flex w-full min-h-0 flex-1 flex-col",
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
