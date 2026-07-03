/**
 * Feature flags (spec §3.9): new modules ship dark and roll out by flipping a
 * flag. Deliberately a plain module — no runtime service — so flags are
 * greppable and their dead code is deletable once a rollout is permanent.
 */
export const flags = {
  /** Phase 1: COA management, accounting periods, opening balances on /book/ledger. */
  accountingSetup: true,
  /** Phase 2: contact editing/merge/CSV + stock-adjustment reason codes. */
  contactsPlus: true,
  /** Phase 4: purchase orders, vendor credits, landed cost. */
  purchasing: true,
} as const;
