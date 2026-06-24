"use client";
/** Shared V2 widgets: page guard, count-up numbers, empty states, badges. */
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useV2 } from "@/book/lib/v2/store";
import { AppSection, canSee, homeFor } from "@/book/lib/v2/rbac";
import { Card, cn } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { LifecycleStatus, OrderClass } from "@/book/lib/engine";
import { Badge } from "@/book/components/ui";

/** Layer-3 RBAC: deep links to forbidden sections get a friendly screen. */
export function Guard({ section, children }: { section: AppSection; children: React.ReactNode }) {
  const { me } = useV2();
  if (!canSee(me.role, section)) {
    return (
      <Card className="mx-auto mt-16 max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-warning" />
        <h2 className="text-lg font-semibold">No access to this area</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role ({me.role.replace("_", " ")}) doesn&apos;t include this section.
          Ask the org owner if you need it.
        </p>
        <Link href={homeFor(me.role)} className="mt-4 inline-block text-sm font-medium text-primary">
          ← Back to your home
        </Link>
      </Card>
    );
  }
  return <>{children}</>;
}

/** Count-up ₹ number (micro-delight). */
export function CountUpINR({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 80, damping: 20 });
  const text = useTransform(spring, (v) => formatINR(v, true));
  useEffect(() => { mv.set(value); }, [value, mv]);
  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>;
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function EmptyState({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <Card className="p-12 text-center">
      <p className="text-4xl">{emoji}</p>
      <p className="mt-3 font-medium">{title}</p>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export function ClassBadge({ cls }: { cls: OrderClass }) {
  const tone: Record<OrderClass, "success" | "danger" | "warning" | "default" | "info"> = {
    DELIVERED: "success", RTO: "warning", RETURN: "danger", CANCELLED: "default",
    LOST: "info", EXCHANGE: "info", CLAIM: "success", PLATFORM_FEE: "default", UNKNOWN: "warning",
  };
  const label: Record<OrderClass, string> = {
    DELIVERED: "Delivered", RTO: "RTO", RETURN: "Return", CANCELLED: "Cancelled",
    LOST: "Lost", EXCHANGE: "Exchange", CLAIM: "Claim", PLATFORM_FEE: "Platform fee", UNKNOWN: "Unknown",
  };
  return <Badge tone={tone[cls]}>{label[cls]}</Badge>;
}

export function LifecycleBadge({ status }: { status: LifecycleStatus }) {
  const map: Record<LifecycleStatus, { tone: "success" | "danger" | "warning" | "info"; label: string }> = {
    SETTLED: { tone: "success", label: "Settled" },
    PARTIALLY_SETTLED: { tone: "info", label: "Partially settled" },
    AWAITING_PAYMENT: { tone: "warning", label: "Awaiting payment" },
    DISPUTED: { tone: "danger", label: "Disputed" },
  };
  return <Badge tone={map[status].tone}>{map[status].label}</Badge>;
}

/** IST date display: DD MMM YYYY. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
