"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const LEN = 6;

/** Six single-character fields with paste/backspace chaining; synced to digits-only string ≤6. */
export function OtpSixInput({
  value,
  onChange,
  disabled,
  idPrefix = "otp",
  className,
}: {
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
  idPrefix?: string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const safe = value.replace(/\D/g, "").slice(0, LEN);

  function setAt(index: number, raw: string) {
    const d = raw.replace(/\D/g, "").slice(-1);
    const arr = safe.padEnd(LEN, " ").split("");
    arr[index] = d || " ";
    const next = arr.join("").replace(/\s/g, "").slice(0, LEN);
    onChange(next);
    if (d && index < LEN - 1) {
      requestAnimationFrame(() => refs.current[index + 1]?.focus());
    }
  }

  return (
    <div
      className={cn("flex justify-center gap-2 sm:gap-2.5", className)}
      role="group"
      aria-label="One-time password, 6 digits"
    >
      {Array.from({ length: LEN }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={`${idPrefix}-${i}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={safe[i] ?? ""}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              if (safe[i]) {
                setAt(i, "");
              } else if (i > 0) {
                refs.current[i - 1]?.focus();
                const nextVal = `${safe.slice(0, i - 1)}${safe.slice(i)}`;
                onChange(nextVal);
              }
              e.preventDefault();
            }
            if (e.key === "ArrowLeft" && i > 0) {
              refs.current[i - 1]?.focus();
              e.preventDefault();
            }
            if (e.key === "ArrowRight" && i < LEN - 1) {
              refs.current[i + 1]?.focus();
              e.preventDefault();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LEN);
            onChange(text);
            const next = Math.min(text.length, LEN - 1);
            requestAnimationFrame(() => refs.current[next]?.focus());
          }}
          className={cn(
            "h-12 w-10 rounded-lg border border-input bg-background text-center font-mono text-lg tabular-nums shadow-sm outline-none transition-[box-shadow,border-color]",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/45",
            "disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11"
          )}
        />
      ))}
    </div>
  );
}
