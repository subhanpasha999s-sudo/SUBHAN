"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function BookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[tulmin-book]", error);
  }, [error]);

  return (
    <div className="flex min-h-[68vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle className="size-7" />
      </div>
      <div className="max-w-sm">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A reload usually fixes it. Your books are saved to your account and this browser.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <RefreshCw className="size-4" /> Try again
        </button>
        <Link href="/book/dashboard" className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
