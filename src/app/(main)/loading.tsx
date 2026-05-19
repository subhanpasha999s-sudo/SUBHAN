import { WorkspaceSectionStack } from "@/components/layout/workspace-layout";

/** Server-rendered shell: zero client JS until the route chunk hydrates — shows structure, not blank. */
export default function MainLoading() {
  return (
    <WorkspaceSectionStack>
      <div
        aria-busy="true"
        aria-label="Loading page"
        className="motion-page-enter rounded-2xl border border-border bg-card p-7 shadow-layer-card ring-1 ring-border/25 sm:p-8"
      >
        <div className="mb-6 flex flex-wrap items-center gap-1">
          <span className="skeleton-shimmer h-4 w-24 rounded md:w-28" />
        </div>
        <div className="space-y-3 pb-6">
          <span className="skeleton-shimmer block h-[1.625rem] w-[min(16rem,70%)] rounded-lg md:h-8 md:w-[min(20rem,80%)]" />
          <span className="skeleton-shimmer block h-11 max-w-xl rounded-lg" />
        </div>
        <span className="block h-px w-full bg-border" aria-hidden />
      </div>

      <div className="space-y-8">
        <div className="motion-page-enter rounded-2xl border border-border bg-card p-6 shadow-layer-card ring-1 ring-border/50 md:p-7">
          <div className="skeleton-shimmer h-44 rounded-xl border border-dashed border-border/80 md:h-48" />
          <div className="mt-5 flex gap-3">
            <div className="skeleton-shimmer h-11 w-[40%] max-w-[9.5rem] rounded-lg" />
            <div className="skeleton-shimmer h-11 flex-1 max-w-[13rem] rounded-lg" />
          </div>
        </div>

        <div className="motion-page-enter rounded-2xl border border-border bg-card p-6 shadow-layer-card ring-1 ring-border/50 md:p-8">
          <div className="skeleton-shimmer mb-6 h-[11px] w-40 rounded-full" />
          <div className="skeleton-shimmer h-[min(200px,32vh)] rounded-xl border border-border" />
        </div>
      </div>
    </WorkspaceSectionStack>
  );
}
