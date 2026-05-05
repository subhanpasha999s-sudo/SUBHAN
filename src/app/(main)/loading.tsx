import { WorkspaceSectionStack } from "@/components/layout/workspace-layout";

/** Server-rendered shell: zero client JS until the route chunk hydrates — shows structure, not blank. */
export default function MainLoading() {
  return (
    <WorkspaceSectionStack>
      <div
        aria-busy="true"
        aria-label="Loading page"
        className="rounded-2xl border border-border bg-card p-7 shadow-layer-card ring-1 ring-border/25 sm:p-8"
      >
        <div className="mb-6 flex flex-wrap items-center gap-1">
          <span className="h-4 w-24 animate-pulse rounded bg-muted md:w-28" />
        </div>
        <div className="space-y-3 pb-6">
          <span className="block h-[1.625rem] w-[min(16rem,70%)] animate-pulse rounded-lg bg-muted-foreground/15 md:h-8 md:w-[min(20rem,80%)]" />
          <span className="block h-11 max-w-xl animate-pulse rounded-lg bg-muted-foreground/10" />
        </div>
        <span className="block h-px w-full animate-pulse bg-border" aria-hidden />
      </div>

      <div className="space-y-8">
        <div className="animate-pulse rounded-2xl border border-border bg-card p-6 shadow-layer-card ring-1 ring-border/50 md:p-7">
          <div className="h-44 rounded-xl border border-dashed border-border/80 bg-muted/30 md:h-48" />
          <div className="mt-5 flex gap-3">
            <div className="h-11 w-[40%] max-w-[9.5rem] rounded-lg bg-muted" />
            <div className="h-11 flex-1 max-w-[13rem] rounded-lg bg-muted/70" />
          </div>
        </div>

        <div className="animate-pulse rounded-2xl border border-border bg-card p-6 shadow-layer-card ring-1 ring-border/50 md:p-8">
          <div className="mb-6 h-[11px] w-40 rounded-full bg-muted" />
          <div className="h-[min(200px,32vh)] rounded-xl border border-border bg-muted/20 dark:bg-muted/12" />
        </div>
      </div>
    </WorkspaceSectionStack>
  );
}
