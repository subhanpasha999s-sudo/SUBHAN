"use client";

import * as React from "react";

import "./globals.css";

/**
 * Renders outside the root layout when the root fails — keep self-contained HTML + calm copy.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-50 p-8 font-sans antialiased">
        <div className="w-full max-w-md rounded-3xl border border-neutral-200/80 bg-white p-10 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Error</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">
            Session interrupted
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
            Reload almost always restores things. Local data stays in this browser when storage is allowed.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="interaction-press mt-8 w-full rounded-full bg-neutral-950 py-3 text-[15px] font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
