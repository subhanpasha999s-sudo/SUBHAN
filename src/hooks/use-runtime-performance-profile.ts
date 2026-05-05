"use client";

import * as React from "react";

import {
  computeRuntimePerformanceTier,
  pdfParseYieldPolicyForTier,
  type PdfParseYieldPolicy,
  type RuntimePerformanceTier,
  virtualListTuningForTier,
  type VirtualListTuning,
} from "@/lib/runtime/performance-tier";

export type RuntimePerformanceProfile = {
  tier: RuntimePerformanceTier;
  parseYieldPolicy: PdfParseYieldPolicy;
  labelsGridVirtual: VirtualListTuning;
  labelsMobileCardsVirtual: VirtualListTuning;
  skuTableVirtual: VirtualListTuning;
  /** Prefer instant filter updates vs deferred (weak devices defer heavy list recomputation while typing). */
  deferListingSearchFilter: boolean;
};

/** Computed once per mount — navigator hints are stable for the tab lifetime. */
export function useRuntimePerformanceProfile(): RuntimePerformanceProfile {
  return React.useMemo(() => {
    const tier = computeRuntimePerformanceTier();
    return {
      tier,
      parseYieldPolicy: pdfParseYieldPolicyForTier(tier),
      labelsGridVirtual: virtualListTuningForTier(tier, "label-grid"),
      labelsMobileCardsVirtual: virtualListTuningForTier(tier, "label-mobile-cards"),
      skuTableVirtual: virtualListTuningForTier(tier, "sku-table"),
      deferListingSearchFilter: tier !== "high",
    };
  }, []);
}
