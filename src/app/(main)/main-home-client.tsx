"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Static export cannot use server `redirect()`; send users to Labels quickly. */
export function MainHomeClient() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/export-labels");
  }, [router]);

  return (
    <main className="mx-auto max-w-lg px-6 py-10 text-center">
      <h1 className="text-balance text-lg font-semibold tracking-tight text-foreground">
        Tulmin · smart label filtering for Meesho sellers
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Process bulk labels without manual sorting. Filter by SKU, courier partner, and quantity—then
        export only what you need. From one hour of manual work to under three minutes.
      </p>
      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
        Opening Tulmin…
      </p>
      <p className="mt-4">
        <Link
          href="/export-labels"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to Labels
        </Link>
      </p>
    </main>
  );
}
