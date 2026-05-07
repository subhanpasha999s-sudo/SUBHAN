"use client";

import * as React from "react";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function MainSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[min(520px,70vh)] flex-col items-center justify-center rounded-[1.75rem] border border-neutral-200/70 bg-white px-8 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div
        className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-neutral-950/[0.04] ring-1 ring-neutral-950/[0.06]"
        aria-hidden
      >
        <RefreshCw className="size-7 text-neutral-700" strokeWidth={1.25} />
      </div>
      <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-neutral-950">
        This view couldn’t load
      </h2>
      <p className="mx-auto mt-3 max-w-[340px] text-[15px] leading-relaxed text-neutral-500">
        Retry anytime—nothing leaves this device unless you export or sync.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          onClick={() => reset()}
          size="lg"
          className="min-w-[8.5rem] rounded-full bg-neutral-950 px-8 font-semibold text-white hover:bg-neutral-900"
        >
          Retry
        </Button>
        <Link
          href="/export-labels"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-[15px] font-medium whitespace-nowrap text-foreground outline-none ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Labels
        </Link>
      </div>
      {process.env.NODE_ENV === "development" ? (
        <details className="mt-14 w-full max-w-lg text-left">
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            Details (development)
          </summary>
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-neutral-50 p-4 font-mono text-[11px] leading-relaxed text-neutral-700">
            {error.message}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
