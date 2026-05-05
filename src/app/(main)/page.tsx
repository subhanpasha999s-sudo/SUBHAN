"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Static export cannot use server `redirect()`; `/` swaps to Label PDF locally. */
export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/export-labels");
  }, [router]);
  return (
    <p className="px-6 py-10 text-center text-sm text-muted-foreground">
      Opening workspace…
    </p>
  );
}
