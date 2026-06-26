"use client";
/**
 * App-switcher — hop between Tulmin's apps (Filter & auto crop ⇄ Tulmin Book)
 * from one place. Shared by both shells; highlights the current app by route.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, IndianRupee, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

type AppDef = {
  id: "labels" | "book";
  name: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const APPS: AppDef[] = [
  { id: "labels", name: "Filter & auto crop", desc: "Label dispatch tool", href: "/export-labels", icon: Scissors },
  { id: "book", name: "Tulmin Book", desc: "Accounting & books", href: "/book/dashboard", icon: IndianRupee },
];

export function AppSwitcher({ className }: { className?: string }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const current: AppDef["id"] = pathname.startsWith("/book") ? "book" : "labels";
  const cur = APPS.find((a) => a.id === current)!;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Warm the other app's route on intent (open/hover) so the switch lands instantly.
  const warm = () => APPS.forEach((a) => a.id !== current && router.prefetch(a.href));

  return (
    <div ref={ref} className={cn("relative", className)} onMouseEnter={warm}>
      <button
        onClick={() => { warm(); setOpen((o) => !o); }}
        className="flex w-full items-center gap-2 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-muted"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <cur.icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold leading-tight tracking-tight">{cur.name}</span>
          <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">Tulmin · switch app</span>
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -4 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-0 top-full z-50 mt-1.5 w-64 origin-top-left rounded-2xl border border-border bg-card p-1.5 shadow-xl"
        >
          {APPS.map((a) => {
            const active = a.id === current;
            return (
              <Link
                key={a.id}
                href={a.href}
                prefetch
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors",
                  active ? "bg-muted" : "hover:bg-muted"
                )}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  <a.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.desc}</span>
                </span>
                {active && <Check className="size-4 shrink-0 text-primary" />}
              </Link>
            );
          })}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
