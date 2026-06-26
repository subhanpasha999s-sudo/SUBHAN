"use client";
/**
 * V2 app shell — left sidebar (bottom tab bar on mobile), role-gated nav,
 * Cmd/Ctrl+K global search, demo role switcher, dark mode.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { motion } from "framer-motion";
import { Aurora, PageReveal } from "./motion";
import {
  BarChart3, Boxes, ChevronDown, Cloud, CloudOff, FileSpreadsheet, GitCompare, IndianRupee, LayoutDashboard, Scissors, Link2,
  ListOrdered, Menu, Moon, PackageOpen, Receipt, RotateCcw, Search, Settings, Shuffle,
  ShoppingCart, Store, Sun, Timer, Users, X, BookOpen, Landmark,
} from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { AppSection, canSee, homeFor, ROLE_LABELS } from "@/book/lib/v2/rbac";
import { cn } from "@/book/components/ui";
import { useAuth } from "@/lib/supabase/auth-context";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { AppSwitcher } from "@/components/app-switcher";
import NotificationBell from "./NotificationBell";
import AnalyticsPage from "@/app/book/analytics/page";
import DashboardPage from "@/app/book/dashboard/page";
import ExpensesPage from "@/app/book/expenses/page";
import GstPage from "@/app/book/gst/page";
import IntegrationsPage from "@/app/book/integrations/page";
import InventoryPage from "@/app/book/inventory/page";
import MappingPage from "@/app/book/mapping/page";
import OrdersPage from "@/app/book/orders/page";
import PnlOrdersPage from "@/app/book/pnl/orders/page";
import PnlPayoutsPage from "@/app/book/pnl/payouts/page";
import PnlProductsPage from "@/app/book/pnl/products/page";
import PnlSummaryPage from "@/app/book/pnl/summary/page";
import PurchasesPage from "@/app/book/purchases/page";
import ReconciliationPage from "@/app/book/reconciliation/page";
import BankPage from "@/app/book/bank/page";
import ReportsPage from "@/app/book/reports/page";
import ReturnsPage from "@/app/book/returns/page";
import SettlementsPage from "@/app/book/settlements/page";
import TeamPage from "@/app/book/team/page";
import VendorsPage from "@/app/book/vendors/page";
import { InstantNavigationProvider } from "./InstantNavigation";

interface NavItem { section: AppSection; href: string; label: string; icon: React.ComponentType<{ className?: string }> }
interface NavGroup { label: string; icon: React.ComponentType<{ className?: string }>; children: NavItem[] }
type NavEntry = NavItem | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

const NAV: NavEntry[] = [
  { section: "dashboard", href: "/book/dashboard", label: "Dashboard", icon: LayoutDashboard },
  // Sale dropdown — orders, how they come in, and what comes back
  { label: "Sale", icon: Store, children: [
    { section: "orders", href: "/book/orders", label: "Orders", icon: ListOrdered },
    { section: "integrations", href: "/book/integrations", label: "Integrations", icon: Link2 },
    { section: "returns", href: "/book/returns", label: "Returns & QC", icon: RotateCcw },
  ] },
  // Payout & P/L dropdown — the statement plus settlement tracking & reconciliation
  { label: "Payout & P/L", icon: IndianRupee, children: [
    { section: "pnl", href: "/book/pnl/summary", label: "Summary", icon: IndianRupee },
    { section: "settlements", href: "/book/settlements", label: "Settlements", icon: Timer },
    { section: "reconciliation", href: "/book/reconciliation", label: "Reconciliation", icon: GitCompare },
  ] },
  // Inventory dropdown — items and listing→inventory SKU mapping
  { label: "Inventory", icon: Boxes, children: [
    { section: "inventory", href: "/book/inventory", label: "Item", icon: Boxes },
    { section: "mapping", href: "/book/mapping", label: "SKU Mapping", icon: Shuffle },
  ] },
  // Purchase dropdown — vendors, bills, expenses
  { label: "Purchase", icon: ShoppingCart, children: [
    { section: "vendors", href: "/book/vendors", label: "Vendors", icon: Users },
    { section: "purchases", href: "/book/purchases", label: "Purchase Bill", icon: Receipt },
    { section: "expenses", href: "/book/expenses", label: "Expense", icon: Receipt },
  ] },
  { section: "reports", href: "/book/reports", label: "Reports", icon: BookOpen },
  { section: "bank",    href: "/book/bank",    label: "Bank Import", icon: Landmark },
  { section: "analytics", href: "/book/analytics", label: "Analytics", icon: BarChart3 },
  { section: "gst", href: "/book/gst", label: "GST", icon: FileSpreadsheet },
  { section: "team", href: "/book/team", label: "Team", icon: Users },
  // Sibling app — the Label tool, native (not an iframe), at the bottom
  { section: "tulmin", href: "/export-labels", label: "Filter & auto crop", icon: Scissors },
];

const INSTANT_ROUTES: Record<string, React.ComponentType> = {
  "/book/analytics": AnalyticsPage,
  "/book/dashboard": DashboardPage,
  "/book/expenses": ExpensesPage,
  "/book/gst": GstPage,
  "/book/integrations": IntegrationsPage,
  "/book/inventory": InventoryPage,
  "/book/mapping": MappingPage,
  "/book/orders": OrdersPage,
  "/book/pnl/orders": PnlOrdersPage,
  "/book/pnl/payouts": PnlPayoutsPage,
  "/book/pnl/products": PnlProductsPage,
  "/book/pnl/summary": PnlSummaryPage,
  "/book/purchases": PurchasesPage,
  "/book/reconciliation": ReconciliationPage,
  "/book/bank": BankPage,
  "/book/reports": ReportsPage,
  "/book/returns": ReturnsPage,
  "/book/settlements": SettlementsPage,
  "/book/team": TeamPage,
  "/book/vendors": VendorsPage,
};

function navItemForPath(path: string): NavItem | undefined {
  return flatNav("owner")
    .filter((item) => path.startsWith(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Flatten visible leaf nav items (for command palette + mobile bar). */
function flatNav(role: Parameters<typeof canSee>[0]): NavItem[] {
  const out: NavItem[] = [];
  for (const e of NAV) {
    if (isGroup(e)) out.push(...e.children.filter((c) => canSee(role, c.section)));
    else if (canSee(role, e.section)) out.push(e);
  }
  return out;
}

function CommandK() {
  const { state, me } = useV2();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const screens = flatNav(me.role)
      .filter((n) => n.label.toLowerCase().includes(needle))
      .slice(0, 4)
      .map((n) => ({ type: "screen" as const, id: n.href, label: n.label, sub: "Go to screen" }));
    const orders = state.orders
      .filter((o) => o.subOrderNo.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((o) => ({ type: "order" as const, id: o.subOrderNo, label: o.subOrderNo, sub: o.productName }));
    const skus = state.skus
      .filter((s) => s.skuCode.toLowerCase().includes(needle) || s.productName.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((s) => ({ type: "sku" as const, id: s.skuCode, label: s.skuCode, sub: s.productName }));
    return [...screens, ...orders, ...skus];
  }, [q, state.orders, state.skus, me.role]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 pt-24 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to Sub Order No or SKU…"
            className="w-full bg-transparent py-3 text-sm outline-none"
          />
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 && q && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          )}
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                setOpen(false);
                router.push(
                  r.type === "screen" ? r.id
                    : r.type === "order" ? `/book/orders/${encodeURIComponent(r.id)}`
                    : `/book/sku/${encodeURIComponent(r.id)}`
                );
              }}
            >
              {r.type === "order" ? <ListOrdered className="h-4 w-4 text-muted-foreground" /> : r.type === "sku" ? <PackageOpen className="h-4 w-4 text-muted-foreground" /> : <Search className="h-4 w-4 text-muted-foreground" />}
              <span className="font-mono text-xs">{r.label}</span>
              <span className="truncate text-xs text-muted-foreground">{r.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Collapsible sidebar group (Sale / Purchase). Auto-opens on active child. */
function NavGroupItem({
  group,
  activePath,
  onNavigate,
}: {
  group: NavGroup;
  activePath: string;
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const active = group.children.some((c) => activePath.startsWith(c.href));
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <group.icon className="h-4 w-4" />
        {group.label}
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-3">
          {group.children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              prefetch
              onClick={(event) => onNavigate(event, c.href)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                activePath.startsWith(c.href) ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shared nav body — rendered in the desktop sidebar AND the mobile drawer. */
function NavList({
  visible,
  activePath,
  onNavigate,
}: {
  visible: NavEntry[];
  activePath: string;
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return (
    <>
      {visible.map((e) =>
        isGroup(e) ? (
          <NavGroupItem key={e.label} group={e} activePath={activePath} onNavigate={onNavigate} />
        ) : (
          <Link
            key={e.href}
            href={e.href}
            prefetch
            onClick={(event) => onNavigate(event, e.href)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              activePath.startsWith(e.href)
                ? "bg-muted text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <e.icon className="h-4 w-4" />
            {e.label}
          </Link>
        )
      )}
    </>
  );
}

/** Cloud-sync status — signed-in users sync their Book data; others can sign in. */
function BookCloudSync() {
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  if (!authReady) return null;
  if (user) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs">
        <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span className="min-w-0 flex-1 truncate text-emerald-600 dark:text-emerald-400">
          Synced · {user.email ?? user.phone ?? "signed in"}
        </span>
      </div>
    );
  }
  return (
    <button
      onClick={openOptionalSignIn}
      className="flex w-full items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10"
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0" />
      <span className="text-left leading-tight">Sign in to sync across devices</span>
    </button>
  );
}

/** Theme toggle + demo role switcher — shared by sidebar and drawer footers. */
function ShellFooter({
  dark,
  toggleTheme,
}: {
  dark: boolean;
  toggleTheme: () => void;
}) {
  const { state, me, actions } = useV2();
  const router = useRouter();
  return (
    <div className="space-y-2 border-t border-border p-3">
      <BookCloudSync />
      <button
        onClick={toggleTheme}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        {dark ? "Light mode" : "Dark mode"}
      </button>
      <div className="rounded-xl bg-muted p-3">
        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Settings className="h-3 w-3" /> {state.users.length > 1 ? "Viewing as" : "Account"}
        </p>
        {state.users.length > 1 ? (
          <select
            value={me.id}
            onChange={(e) => {
              actions.switchUser(e.target.value);
              const u = state.users.find((x) => x.id === e.target.value);
              if (u) router.push(homeFor(u.role));
            }}
            className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
          >
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {ROLE_LABELS[u.role]}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs font-medium">{me.name} — {ROLE_LABELS[me.role]}</p>
        )}
      </div>
      <p className="px-1 text-[10px] text-muted-foreground">
        {state.org.name} · press <kbd className="rounded bg-muted px-1">⌘K</kbd> to search
      </p>
    </div>
  );
}

function InstantRoutePreview({ path }: { path: string }) {
  const item = navItemForPath(path);
  const title = item?.label ?? "Loading";
  return (
    <div className="space-y-6">
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[routeProgress_0.9s_ease-in-out_infinite] rounded-full bg-primary" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Opening</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        <div className="ml-auto hidden h-9 w-28 rounded-lg bg-muted md:block" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="skeleton h-3 w-20" />
            <div className="mt-4 skeleton h-7 w-28" />
            <div className="mt-3 skeleton h-2 w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="skeleton h-4 w-36" />
          <div className="skeleton h-8 w-24" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-12 gap-3">
              <div className="skeleton col-span-4 h-4" />
              <div className="skeleton col-span-3 h-4" />
              <div className="skeleton col-span-2 h-4" />
              <div className="skeleton col-span-3 h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InstantRouteContent({ path }: { path: string }) {
  const Component = INSTANT_ROUTES[path];
  if (!Component) return <InstantRoutePreview path={path} />;
  return <Component />;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { me, persistError } = useV2();
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [activePath, setActivePath] = useState(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    setActivePath(pathname);
    setMenuOpen(false); // close the mobile drawer on navigation
  }, [pathname]);

  // visible nav entries (groups keep only their permitted children)
  const visible: NavEntry[] = useMemo(
    () => NAV
      .map((e) => isGroup(e) ? { ...e, children: e.children.filter((c) => canSee(me.role, c.section)) } : e)
      .filter((e) => isGroup(e) ? e.children.length > 0 : canSee(me.role, e.section)),
    [me.role]
  );
  const mobileNav = useMemo(() => flatNav(me.role).slice(0, 5), [me.role]);
  const visibleHrefs = useMemo(
    () => visible.flatMap((e) => isGroup(e) ? e.children.map((c) => c.href) : [e.href]),
    [visible]
  );
  const showInstantPreview = activePath !== pathname;

  useEffect(() => {
    for (const href of visibleHrefs) router.prefetch(href);
  }, [router, visibleHrefs]);

  function navigateTo(event: React.MouseEvent<HTMLElement>, href: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;
    event.preventDefault();
    if (href === pathname) {
      setActivePath(href);
      return;
    }
    flushSync(() => setActivePath(href));
    router.push(href);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("meeshoprofit:theme", next ? "dark" : "light"); } catch {}
  }

  return (
    <div className="flex min-h-screen">
      <Aurora />
      <InstantNavigationProvider value={{ activePath, navigate: navigateTo, prefetch: router.prefetch }}>
      <CommandK />

      {/* Top bar (mobile) — logo + notifications + menu trigger */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="-ml-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <AppSwitcher className="min-w-0 flex-1" />
        <div className="shrink-0"><NotificationBell /></div>
      </header>

      {/* Slide-in drawer (mobile) — the FULL nav, theme + role switcher */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            transition={{ type: "tween", duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-border bg-card"
          >
            <div className="flex items-center gap-2 px-3 py-4">
              <AppSwitcher className="min-w-0 flex-1" />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
              <NavList visible={visible} activePath={activePath} onNavigate={navigateTo} />
            </nav>
            <ShellFooter dark={dark} toggleTheme={toggleTheme} />
          </motion.aside>
        </div>
      )}

      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-1 px-3 py-4">
          <AppSwitcher className="min-w-0 flex-1" />
          <div className="shrink-0"><NotificationBell /></div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          <NavList visible={visible} activePath={activePath} onNavigate={navigateTo} />
        </nav>
        <ShellFooter dark={dark} toggleTheme={toggleTheme} />
      </aside>

      {/* Main — cinematic page-reveal on route change */}
      <main className="min-w-0 flex-1 px-4 pb-24 pt-[4.25rem] md:px-8 md:pb-10 md:pt-6">
        <PageReveal routeKey={showInstantPreview ? activePath : pathname}>
          {persistError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              <span aria-hidden>⚠️</span>
              <p>
                <strong>Couldn&apos;t save to browser storage.</strong> Your latest import/changes are
                in memory but may be lost on reload — the dataset likely exceeds this browser&apos;s
                ~5&nbsp;MB local limit. Delete an old import (Integrations → trash) or export, then retry.
                Your SKU mappings are stored separately and remain safe.
              </p>
            </div>
          )}
          {showInstantPreview ? <InstantRouteContent path={activePath} /> : children}
        </PageReveal>
      </main>

      {/* Bottom tab bar (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="flex justify-around">
          {mobileNav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch
              onClick={(event) => navigateTo(event, href)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium",
                activePath.startsWith(href) ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
      </InstantNavigationProvider>
    </div>
  );
}
