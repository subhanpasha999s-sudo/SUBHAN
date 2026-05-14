/**
 * Heuristic device capability for UI + PDF parse scheduling.
 * No SSR: only run in the browser (`typeof window !== "undefined"`).
 */

export type RuntimePerformanceTier = "low" | "medium" | "high";

/** How often we yield during PDF page loops (main thread or worker). */
export type PdfParseYieldPolicy = "responsive" | "balanced" | "throughput";

export type VirtualListTuning = {
  overscan: number;
  useAnimationFrameWithResizeObserver: boolean;
};

function connectionHints(): { saveData: boolean; slowNet: boolean } {
  if (typeof navigator === "undefined") {
    return { saveData: false, slowNet: false };
  }
  const c = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!c) return { saveData: false, slowNet: false };
  const t = c.effectiveType ?? "";
  const slowNet = t === "slow-2g" || t === "2g";
  return { saveData: Boolean(c.saveData), slowNet };
}

/** Single score → tier. Tuned for laptops/phones; unknowns default to medium. */
export function computeRuntimePerformanceTier(): RuntimePerformanceTier {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "medium";
  }

  const { saveData, slowNet } = connectionHints();
  if (saveData || slowNet) return "low";

  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  let score = 0;
  if (cores >= 10) score += 2;
  else if (cores >= 6) score += 1;
  else if (cores <= 2) score -= 2;
  else if (cores <= 4) score -= 1;

  if (typeof mem === "number") {
    if (mem <= 2) score -= 2;
    else if (mem <= 4) score -= 1;
    else if (mem >= 8) score += 1;
  }

  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      score -= 1;
    }
  } catch {
    /* noop */
  }

  if (score <= -1) return "low";
  if (score >= 2) return "high";
  return "medium";
}

export function pdfParseYieldPolicyForTier(
  tier: RuntimePerformanceTier
): PdfParseYieldPolicy {
  switch (tier) {
    case "low":
      return "responsive";
    case "high":
      return "throughput";
    default:
      return "balanced";
  }
}

/** @tanstack/react-virtual tuning by tier. */
export function virtualListTuningForTier(
  tier: RuntimePerformanceTier,
  kind: "label-grid" | "label-mobile-cards" | "sku-table"
): VirtualListTuning {
  const useRaf = tier !== "low";
  if (kind === "label-mobile-cards") {
    if (tier === "low") return { overscan: 4, useAnimationFrameWithResizeObserver: false };
    if (tier === "medium")
      return { overscan: 6, useAnimationFrameWithResizeObserver: true };
    return { overscan: 9, useAnimationFrameWithResizeObserver: true };
  }
  if (kind === "label-grid") {
    if (tier === "low") return { overscan: 5, useAnimationFrameWithResizeObserver: false };
    if (tier === "medium")
      return { overscan: 8, useAnimationFrameWithResizeObserver: true };
    return { overscan: 12, useAnimationFrameWithResizeObserver: true };
  }
  /** sku-table */
  if (tier === "low") return { overscan: 6, useAnimationFrameWithResizeObserver: false };
  if (tier === "medium")
    return { overscan: 9, useAnimationFrameWithResizeObserver: true };
  return { overscan: 14, useAnimationFrameWithResizeObserver: true };
}
