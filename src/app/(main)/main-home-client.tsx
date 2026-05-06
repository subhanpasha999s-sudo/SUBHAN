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
        Label — Meesho label PDF tools & SKU mapping
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Parse Meesho shipping label PDFs in the browser, filter by mapped SKU, quantity,
        and courier (Delhivery, Shadowfax, and others on the sheet), map listing SKUs to
        warehouse-style group SKUs, and export grouped or selected pages. Built for sellers
        and fulfilment workflows—no installers.
      </p>
      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
        Opening the Label PDF workspace…
      </p>
      <p className="mt-4">
        <Link
          href="/export-labels"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Open Label PDF workspace
        </Link>
      </p>
    </main>
  );
}
