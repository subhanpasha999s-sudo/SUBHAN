"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Static export cannot use server `redirect()`; send users to Label PDF quickly. */
export function MainHomeClient() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/export-labels");
  }, [router]);

  return (
    <main className="mx-auto max-w-lg px-6 py-10 text-center">
      <h1 className="text-balance text-lg font-semibold tracking-tight text-foreground">
        Label - Premium dispatch workspace for Meesho teams
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Import once, filter with confidence, and export exactly what your operations team needs.
        Label helps reduce manual burden, save packing time, and keep SKU decisions consistent
        across every dispatch run.
      </p>
      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
        Opening your high-speed label workspace...
      </p>
      <p className="mt-4">
        <Link
          href="/export-labels"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Launch Label workspace
        </Link>
      </p>
    </main>
  );
}
