# PROGRESS

## Pre-spec foundation (2026-07-01 → 07-02, branch merge/tulmin-book)
Landed before CLAUDE_UPGRADE_SPEC.md was adopted; maps to spec-P1/P4/P5 basics:
- **Accounting core live on Supabase** (migrations 018–019): per-org tenancy,
  immutable double-entry ledger with DB-enforced balancing + reversal-only
  corrections + RLS, seeded 19-account COA, transactional idempotent
  `post_journal_entry` + `ensure_org` RPCs. Verified with rolled-back DB probes.
- **Double-entry primitives + posting rules** (`src/book/lib/core/**`):
  journal validation/reversal, derived-GL→ledger port (parity proven pure +
  SQL), domain postings (invoice/receipt/credit-note/bill/bill-payment/vendor-
  credit/stock-adjustment/bank-txn), AR/AP aging.
- **Screens (browser-verified)**: /book/ledger (org bootstrap, sync-from-
  activity, stored trial balance w/ parity column, manual JE), /book/invoices
  (create, full/partial receipts), /book/customers (balances + running-balance
  statements), purchases page bill payments (AP outstanding, Pay action).
- **AP correctness**: bills always post to AP; payments move AP→Cash
  (partial-safe, characterization-pinned).

## Phase 0 — Audit & gap analysis (2026-07-02) ✅ awaiting operator review
- `docs/STACK.md`, `docs/MEESHO_RULES.md` (crown jewels), `docs/GAP_ANALYSIS.md`
  (with adjusted phase order; Projects & time dropped), `CLAUDE.md`,
  `CLAUDE_UPGRADE_SPEC.md` saved at root.
- **Meesho behavior pinned**: `engine/meesho.rules.test.ts` (14 tests: header
  drift, preamble/legend rows, skip accounting, canonical merge, dedupe across
  months/batches, exchange-then-return double-QC, sub-order-no normalization)
  + existing `core/reconciliation.characterization.test.ts` golden master.
  Suite: **56 tests green**.
- **Operator answers (2026-07-02):**
  (a) Tax pack: **India GST, regular scheme only** (composition deferred).
  (b) Active data sources locked byte-for-byte: **order CSV + payment XLSX**
  (supplier-panel exports — exactly what the current parsers handle).
  (c) Marketplace packs: **Meesho now; plan Flipkart next, then Amazon** —
  design the pack interface around these three settlement models.
- STOPPED for operator review of Phase 0 before starting Phase 1
  (Org & COA management UI per the adjusted phase order in GAP_ANALYSIS.md).
