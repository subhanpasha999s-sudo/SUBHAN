/**
 * Clean empty starting state for the app — no demo/dummy business data.
 *
 * The seed (./seed) is retained for the test suite only. The running app
 * boots from this empty state so a real seller starts from a blank slate and
 * fills it by importing their own Meesho files.
 */
import { DEFAULT_EXPENSE_CATEGORIES } from "@/book/lib/engine";
import { V2State } from "./types";

/** Random-ish inbound address so each workspace looks unique (demo stub). */
function inboundAddress(): string {
  const tag = Math.random().toString(36).slice(2, 8);
  return `meesho-${tag}@in.meeshoprofit.app`;
}

export function buildEmptyState(): V2State {
  return {
    org: { name: "My Store", gstin: "", state: "", plan: "free", settleAfterDays: 60 },
    // A single owner account. Invite teammates from the Team screen.
    users: [{ id: "u-owner", name: "Owner", role: "owner", active: true }],
    currentUserId: "u-owner",
    skus: [],
    cogsHistory: [],
    purchases: [],
    ledger: [],
    orders: [],
    events: [],
    returnsQueue: [],
    claims: [],
    expenses: [],
    bankTxns: [],
    categoryHints: [],
    // expense categories are configuration defaults, not business data
    expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES, "Marketplace Ads"],
    uploads: [],
    disputed: [],
    audit: [],
    skuMap: [],
    vendors: [],
    inboundAddress: inboundAddress(),
    notifications: [],
    stagingTxns: [],
    bankMappings: [],
    categorizationRules: [],
    bankAccounts: [],
    customers: [],
    invoices: [],
    receipts: [],
    creditNotes: [],
    estimates: [],
    recurringInvoices: [],
    billPayments: [],
    importBatches: [],
  };
}
