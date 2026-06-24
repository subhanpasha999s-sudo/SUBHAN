/**
 * Bank transaction categorization — rules-first, AI-fallback.
 * Priority: user rules → starter rules → learned hints → AI (async).
 */
import { COA, CoaKey } from "./accounting";
import type { CategorizationRule } from "@/book/lib/v2/types";

// ── COA option lists for UI dropdowns ────────────────────────────────

export interface CoaOption {
  key: CoaKey;
  label: string;
  code: string;
  direction: "debit" | "credit" | "both";
}

export const COA_OPTIONS: CoaOption[] = [
  // Debit-side (money out) accounts
  { key: "COGS",         label: "Cost of Goods Sold",        code: COA.COGS.code,         direction: "debit" },
  { key: "RETURN_LOSS",  label: "Return & RTO Losses",       code: COA.RETURN_LOSS.code,  direction: "debit" },
  { key: "PLATFORM_FEE", label: "Platform & Affiliate Fees", code: COA.PLATFORM_FEE.code, direction: "debit" },
  { key: "ADS",          label: "Advertising",               code: COA.ADS.code,           direction: "debit" },
  { key: "QC_WRITEOFF",  label: "QC Damage Write-offs",      code: COA.QC_WRITEOFF.code,  direction: "debit" },
  { key: "OPERATING",    label: "Operating Expenses",        code: COA.OPERATING.code,    direction: "debit" },
  { key: "INVENTORY",    label: "Inventory Purchase",        code: COA.INVENTORY.code,    direction: "debit" },
  // Credit-side (money in) accounts
  { key: "SALES",        label: "Sales Revenue",             code: COA.SALES.code,        direction: "credit" },
  { key: "CLAIM_REV",    label: "Claims & Compensation",     code: COA.CLAIM_REV.code,    direction: "credit" },
  { key: "LOST_COMP",    label: "Lost Order Compensation",   code: COA.LOST_COMP.code,    direction: "credit" },
  { key: "RETAINED",     label: "Owner Deposit / Equity",    code: COA.RETAINED.code,     direction: "credit" },
];

export function categoryLabelToCode(label: string): string | null {
  return COA_OPTIONS.find(o => o.label === label)?.code ?? null;
}

export function categoryCodeToLabel(code: string): string | null {
  return COA_OPTIONS.find(o => o.code === code)?.label ?? null;
}

// ── Starter rules (shipped with the app, user can disable/edit) ───────

export const STARTER_RULES: CategorizationRule[] = [
  { id: "sr-01", pattern: "amazon",        isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-02", pattern: "flipkart",      isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-03", pattern: "swiggy",        isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-04", pattern: "zomato",        isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-05", pattern: "uber",          isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-06", pattern: "ola cabs",      isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-07", pattern: "delhivery",     isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-08", pattern: "bluedart",      isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-09", pattern: "dtdc",          isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-10", pattern: "ecom express",  isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-11", pattern: "packaging",     isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-12", pattern: "salary",        isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-13", pattern: "rent",          isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-14", pattern: "electricity",   isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-15", pattern: "broadband",     isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-16", pattern: "internet",      isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-17", pattern: "insurance",     isRegex: false, category: "Operating Expenses",        coaCode: COA.OPERATING.code,    direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-18", pattern: "google ads",    isRegex: false, category: "Advertising",               coaCode: COA.ADS.code,          direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-19", pattern: "meta ads",      isRegex: false, category: "Advertising",               coaCode: COA.ADS.code,          direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-20", pattern: "facebook",      isRegex: false, category: "Advertising",               coaCode: COA.ADS.code,          direction: "debit",  isStarter: true, timesMatched: 0, createdAt: "" },
  { id: "sr-21", pattern: "meesho",        isRegex: false, category: "Platform & Affiliate Fees", coaCode: COA.PLATFORM_FEE.code, direction: "credit", isStarter: true, timesMatched: 0, createdAt: "" },
];

// ── Rules engine ──────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export interface CategoryMatch {
  category: string;
  coaCode: string;
  source: "user_rule" | "starter_rule" | "hint" | "ai" | "none";
  ruleId?: string;
  confidence: number;   // 0–1
}

export function applyCategoryRules(
  txn: { description: string; debit: number; credit: number },
  userRules: CategorizationRule[],
  hints: { pattern: string; category: string }[]
): CategoryMatch | null {
  const desc = normalize(txn.description);
  const dir: "debit" | "credit" = txn.debit > 0 ? "debit" : "credit";

  // 1. User-defined rules first (highest priority)
  for (const rule of userRules.filter(r => !r.isStarter)) {
    if (rule.direction !== "both" && rule.direction !== dir) continue;
    let hit = false;
    try {
      hit = rule.isRegex
        ? new RegExp(rule.pattern, "i").test(txn.description)
        : desc.includes(normalize(rule.pattern));
    } catch { /* invalid regex */ }
    if (hit) return { category: rule.category, coaCode: rule.coaCode, source: "user_rule", ruleId: rule.id, confidence: 1 };
  }

  // 2. Starter rules
  for (const rule of STARTER_RULES) {
    if (rule.direction !== "both" && rule.direction !== dir) continue;
    if (desc.includes(normalize(rule.pattern))) {
      return { category: rule.category, coaCode: rule.coaCode, source: "starter_rule", ruleId: rule.id, confidence: 0.95 };
    }
  }

  // 3. Learned hints (longest pattern wins)
  let bestHint: { pattern: string; category: string } | null = null;
  for (const h of hints) {
    if (desc.includes(normalize(h.pattern))) {
      if (!bestHint || h.pattern.length > bestHint.pattern.length) bestHint = h;
    }
  }
  if (bestHint) {
    const code = categoryLabelToCode(bestHint.category) ?? COA.OPERATING.code;
    return { category: bestHint.category, coaCode: code, source: "hint", confidence: 0.85 };
  }

  return null;
}
