/**
 * localStorage persistence for the MVP. The shape is deliberately a thin
 * "data layer" interface so a database can be swapped in later.
 * PHASE2: Supabase auth + Postgres replaces this module behind the same API.
 * PHASE2: Razorpay subscription gate — check plan before allowing >1 month.
 */
import { CogsMap, MonthData, PnlSettings } from "./engine";
import { OpeningStockMap } from "./engine/inventory";

const KEY = "meeshoprofit:v1";

export interface AppState {
  months: Record<string, MonthData>; // keyed by month label
  cogsMap: CogsMap;
  openingStock: OpeningStockMap;
  settings: PnlSettings;
  appName: string; // working name — configurable
}

export const DEFAULT_STATE: AppState = {
  months: {},
  cogsMap: {},
  openingStock: {},
  settings: { expenseCogsOnReturns: false },
  appName: "Tulmin Book",
};

export function loadState(): AppState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed, settings: { ...DEFAULT_STATE.settings, ...parsed.settings } };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: AppState): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    // quota exceeded — caller may retry with trimmed orders
    return false;
  }
}

export function clearState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
