"use client";

import * as React from "react";

/**
 * True after mount — avoids SSR/client divergence for persisted client state (localStorage/Zustand).
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
