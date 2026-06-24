"use client";
/** Notification center — bell with unread dot + dropdown feed. */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Boxes, Clock, Inbox, IndianRupee, Info } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { AppNotification } from "@/book/lib/v2/types";
import { fmtDate } from "./common";
import { cn } from "@/book/components/ui";

const ICON: Record<AppNotification["kind"], React.ComponentType<{ className?: string }>> = {
  import: Inbox,
  low_stock: Boxes,
  qc_aging: Clock,
  unpaid_aging: IndianRupee,
  settlement: IndianRupee,
  info: Info,
};

export default function NotificationBell() {
  const { state, actions } = useV2();
  const [open, setOpen] = useState(false);
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open && unread) actions.markNotificationsRead(); }}
        className="relative rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Notifications</div>
              <div className="max-h-96 divide-y divide-border overflow-y-auto">
                {state.notifications.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">All caught up ✨</p>
                )}
                {[...state.notifications].reverse().map((n) => {
                  const Icon = ICON[n.kind];
                  return (
                    <div key={n.id} className={cn("flex gap-3 px-4 py-3", !n.read && "bg-muted/40")}>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{n.title}</p>
                        <p className="text-xs text-muted-foreground">{n.body}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(n.at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
