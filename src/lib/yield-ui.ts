/** Yields one frame — keeps taps/scroll responsive during tight loops */
export async function yieldToMain(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Yield when the browser is idle (or bounded wait). Better for PDF page loops than rAF-only.
 */
export async function yieldToIdle(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => resolve(), { timeout: 48 });
      return;
    }
    requestAnimationFrame(() => resolve());
  });
}
