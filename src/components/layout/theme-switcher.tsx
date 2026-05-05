"use client";

import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/lib/theme/constants";
import { useTheme } from "@/components/providers/theme-provider";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

const themeOptionEase =
  "transition-[background-color,color,transform,border-color,box-shadow] duration-200 ease-smooth motion-reduce:transition-none";

function ModeIcon({
  p,
  className,
}: {
  p: ThemePreference;
  className?: string;
}) {
  const iconClass = cn("shrink-0", className ?? "size-[1.125rem]");
  if (p === "dark") {
    return <MoonIcon className={iconClass} strokeWidth={1.65} aria-hidden />;
  }
  if (p === "system") {
    return <MonitorIcon className={iconClass} strokeWidth={1.65} aria-hidden />;
  }
  return <SunIcon className={iconClass} strokeWidth={1.65} aria-hidden />;
}

const THEME_OPTIONS: { value: ThemePreference; hint: string }[] = [
  { value: "light", hint: "Light" },
  { value: "dark", hint: "Dark" },
  { value: "system", hint: "System default" },
];

/** Icon row for Settings and other forms — avoids header dropdown clutter. */
export function ThemePreferenceControl({
  className,
}: {
  className?: string;
}) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("flex flex-wrap items-center gap-3", className)}
    >
      {THEME_OPTIONS.map(({ value, hint }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={hint}
            className={cn(
              themeOptionEase,
              "flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground outline-none hover:bg-muted/70 hover:text-foreground motion-safe:active:scale-[0.985] motion-reduce:active:scale-100",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary/55 bg-primary/10 text-foreground shadow-sm ring-2 ring-primary/25"
                : "border-border shadow-layer-card"
            )}
            onClick={() => setPreference(value)}
          >
            <ModeIcon p={value} className="size-[1.375rem]" />
            <span className="sr-only">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
