"use client";

import Link from "next/link";
import { BarChart3, CreditCard, FileText } from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ADMIN_NAV_ITEMS = [
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/billing", label: "MRR & billing", icon: CreditCard },
  { href: "/admin/blogs", label: "Blogs", icon: FileText },
] as const;

export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#0d121b]",
        className
      )}
    >
      {ADMIN_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors",
              active
                ? "bg-[#335cff] text-white shadow-[0_10px_28px_-20px_#335cff]"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
