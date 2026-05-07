"use client";

import dynamic from "next/dynamic";

function AccountPageSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-xl space-y-6 py-2"
      aria-busy
      aria-label="Loading account"
    >
      <div className="space-y-3">
        <div className="h-7 w-44 animate-pulse rounded-md bg-muted sm:h-8" />
        <div className="h-4 max-w-lg animate-pulse rounded bg-muted/70" />
      </div>
      <div className="h-52 animate-pulse rounded-xl border border-border bg-card p-6 shadow-sm sm:h-56" />
      <div className="h-40 animate-pulse rounded-xl border border-border bg-card p-6 shadow-sm" />
    </div>
  );
}

export default dynamic(
  () =>
    import("./account-page-client").then((m) => ({
      default: m.AccountPageClient,
    })),
  { ssr: false, loading: () => <AccountPageSkeleton /> },
);
