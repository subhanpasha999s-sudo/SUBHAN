import Link from "next/link";

export default function MainNotFound() {
  return (
    <div className="flex min-h-[min(480px,calc(100vh-12rem)] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-neutral-200/90 bg-neutral-50/80 px-8 py-20 text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-400">404</span>
      <h1 className="mt-3 text-[1.625rem] font-semibold tracking-[-0.03em] text-neutral-950">
        Page not found
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-neutral-500">
        This URL isn&apos;t valid. Choose a workspace section from the sidebar.
      </p>
      <Link
        href="/export-labels"
        className="mt-10 inline-flex rounded-full bg-neutral-950 px-8 py-3 text-[15px] font-semibold text-white transition hover:bg-neutral-900"
      >
        Back to Label PDF
      </Link>
    </div>
  );
}
