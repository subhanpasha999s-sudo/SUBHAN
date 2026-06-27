"use client";
/**
 * App-switcher — hop between Tulmin's apps (Filter & auto crop ⇄ Tulmin Book)
 * from one place. Shared by both shells; highlights the current app by route.
 * Premium dropdown: branded tiles, staggered reveal, hover affordances, route
 * prefetch on intent so the switch lands instantly.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, IndianRupee, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

type AppDef = {
  id: "labels" | "book";
  name: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** branded gradient tile for the app mark */
  tile: string;
};

const APPS: AppDef[] = [
  {
    id: "labels",
    name: "Filter & auto crop",
    desc: "Label dispatch tool",
    href: "/export-labels",
    icon: Scissors,
    tile: "bg-gradient-to-br from-sky-500/30 to-blue-600/15 text-sky-300 ring-1 ring-sky-400/20",
  },
  {
    id: "book",
    name: "Tulmin Book",
    desc: "Accounting & books",
    href: "/book/dashboard",
    icon: IndianRupee,
    tile: "bg-gradient-to-br from-emerald-500/30 to-emerald-600/15 text-emerald-300 ring-1 ring-emerald-400/20",
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Warm the other app's route on intent (open/hover) so the switch lands instantly.
  const warm = () => APPS.forEach((a) => a.id !== current && router.prefetch(a.href));

  return (
    <div ref={ref} className={cn("relative", className)} onMouseEnter={warm}>
      <button
        onClick={() => { warm(); setOpen((o) => !o); }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-muted",
          open && "bg-muted"
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", cur.tile)}>
          <cur.icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold leading-tight tracking-tight">{cur.name}</span>
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tulmin · switch app
          </span>
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute left-0 top-full z-50 mt-2 w-[17rem] origin-top-left overflow-hidden rounded-2xl border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl ring-1 ring-black/5"
          >
            <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Switch workspace
            </p>
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } }}
              className="space-y-0.5"
            >
              {APPS.map((a) => {
                const active = a.id === current;
                return (
                  <motion.div
                    key={a.id}
                    variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                    transition={{ duration: 0.22, ease: EASE }}
                  >
                    <Link
                      href={a.href}
                      prefetch
                      onMouseEnter={() => router.prefetch(a.href)}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors",
                        active ? "bg-muted" : "hover:bg-muted"
                      )}
                    >
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", a.tile)}>
                        <a.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{a.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{a.desc}</span>
                      </span>
                      {active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                          <Check className="size-3" /> Current
                        </span>
                      ) : (
                        <ArrowRight className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                      )}
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
            <p className="px-2.5 pb-1 pt-2 text-[10px] text-muted-foreground">
              One login · shared across both apps
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
