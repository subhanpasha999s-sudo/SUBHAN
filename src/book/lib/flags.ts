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
  /** Phase 7: India GST pack — GSTR-1 B2C, HSN, GSTR-3B, TCS/TDS ledger. */
  gstPack: true,
  /** Phase 8: Meesho settlement 2.0 — exceptions queue + deduction breakdown. */
  settlement2: true,
  /** Phase 9: marketplace pack framework (Meesho live; Flipkart/Amazon planned). */
  marketplacePacks: true,
  /** Phase 10: org profile editing + full-organization backup/restore. */
  orgSettings: true,
  /** Phase 10: user-defined custom fields on core entities. */
  customFields: true,
  /** Phase 10: public REST API + key management. */
  publicApi: true,
  /** Staff logins: role-scoped invite codes + shared workspace access. */
  staffLogin: true,
} as const;
