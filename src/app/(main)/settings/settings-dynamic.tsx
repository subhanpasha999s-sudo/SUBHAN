"use client";

import dynamic from "next/dynamic";

function SettingsPageSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-xl space-y-6 py-2"
      aria-busy
      aria-label="Loading settings"
    >
      <div className="space-y-3">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted sm:h-8" />
        <div className="h-4 max-w-lg animate-pulse rounded bg-muted/70" />
      </div>
      <div className="h-44 animate-pulse rounded-xl border border-border bg-card p-6 shadow-sm sm:h-48" />
      <div className="h-56 animate-pulse rounded-xl border border-border bg-card p-6 shadow-sm" />
    </div>
  );
}

export default dynamic(
  () =>
    import("./settings-page-client").then((m) => ({
      default: m.SettingsPageClient,
    })),
  { ssr: false, loading: () => <SettingsPageSkeleton /> },
);
