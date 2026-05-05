/**
 * Capability checks for brittle environments (Safari/WebView/file URLs/custom schemes).
 * Used to pick Worker vs main-thread paths so parsing never wedges the whole app.
 */

export function canUseDedicatedModuleWorker(): boolean {
  if (typeof Worker === "undefined" || typeof window === "undefined") {
    return false;
  }

  try {
    const { protocol } = window.location;
    /** `file:` / blob preview / opaque origins break module Workers or workerSrc resolution */
    if (
      protocol === "file:" ||
      protocol === "blob:" ||
      protocol === "about:" ||
      protocol === "chrome-extension:" ||
      protocol === "moz-extension:"
    ) {
      return false;
    }

    /** `http[s]:` (+ LAN dev) — supported. Custom schemes (`ionic://`, etc.) skip Worker. */
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function raceWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeoutLabel: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${onTimeoutLabel} timed out — try again or use a smaller PDF.`));
    }, ms);
  });

  return Promise.race([
    promise.finally(() => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }),
    timeoutPromise,
  ]);
}
