"use client";

import dynamic from "next/dynamic";

function SkuMappingSkeleton() {
  return (
    <div className="space-y-5" aria-busy aria-label="Loading SKU Mapping">
      <div className="animate-pulse space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="h-6 w-48 rounded-md bg-muted" />
        <div className="h-4 max-w-xl rounded-md bg-muted/80" />
      </div>
      <div className="animate-pulse h-36 rounded-xl border border-dashed border-border bg-gradient-to-b from-card to-muted/20" />
      <div className="animate-pulse h-[min(380px,50vh)] rounded-xl border border-border bg-card shadow-sm" />
    </div>
  );
}

const SkuMappingModule = dynamic(
  () =>
    import("@/components/sku-mapping-module/sku-mapping-module").then(
      (mod) => mod.SkuMappingModule
    ),
  { ssr: false, loading: () => <SkuMappingSkeleton /> }
);

export function MappingBody() {
  return <SkuMappingModule />;
}
