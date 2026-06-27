"use client";
/** Shared sub-nav + date-range/view filter bar for the three Payout & P/L pages. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Download } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { monthsAvailable } from "@/book/lib/v2/derived";
import { PnlView } from "@/book/lib/engine";
import { Button, cn } from "@/book/components/ui";
import { useInstantNavigation } from "./InstantNavigation";

const TABS = [
  { href: "/book/pnl/orders", label: "Orders" },
  { href: "/book/pnl/products", label: "Products" },
  { href: "/book/pnl/summary", label: "Profit/Loss" },
  { href: "/book/pnl/payouts", label: "Payouts" },
];

export interface PnlControls {
  fromMonth: string;
  toMonth: string;
  view: PnlView;
}

export function PnlNav({
  controls, onChange, onExport,
}: {
  controls: PnlControls;
  onChange: (c: PnlControls) => void;
  onExport?: () => void;
}) {
  const pathname = usePathname();
  const instant = useInstantNavigation();
  const { state } = useV2();
  const months = monthsAvailable(state);
  const activePath = instant?.activePath ?? pathname;

  useEffect(() => {
    for (const t of TABS) instant?.prefetch(t.href);
  }, [instant]);

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="grid w-full grid-cols-4 gap-1 rounded-2xl bg-muted p-1 md:max-w-xl">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href}
              prefetch
              onMouseEnter={() => instant?.prefetch(t.href)}
              onClick={(event) => instant?.navigate(event, t.href)}
              className={cn("min-w-0 rounded-xl px-2.5 py-2 text-center text-sm font-medium leading-none transition-colors sm:px-4",
                activePath === t.href ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </Link>
          ))}
        </div>
        {onExport && (
          <Button variant="secondary" className="w-full sm:w-auto md:ml-auto" onClick={onExport}>
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">From</span>
        <select value={controls.fromMonth} onChange={(e) => onChange({ ...controls, fromMonth: e.target.value })}
          className="min-w-28 rounded-xl border border-border bg-card px-3 py-2">
          {months.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="text-muted-foreground">to</span>
        <select value={controls.toMonth} onChange={(e) => onChange({ ...controls, toMonth: e.target.value })}
          className="min-w-28 rounded-xl border border-border bg-card px-3 py-2">
          {months.map((m) => <option key={m}>{m}</option>)}
        </select>
        <div className="ml-0 grid grid-cols-2 rounded-xl bg-muted p-1 sm:ml-2">
          {(["accrual", "cash"] as const).map((v) => (
            <button key={v} onClick={() => onChange({ ...controls, view: v })}
              className={cn("rounded-lg px-4 py-1.5 capitalize", controls.view === v && "bg-card font-medium shadow-card")}>
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Default range = all available months, accrual. */
export function useDefaultPnlControls(): PnlControls {
  const { state } = useV2();
  const months = monthsAvailable(state);
  return {
    fromMonth: months[0] ?? "",
    toMonth: months[months.length - 1] ?? "",
    view: "accrual",
  };
}
