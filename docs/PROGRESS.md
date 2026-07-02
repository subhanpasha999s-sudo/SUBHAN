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
- Operator reviewed and approved ("Go") → Phase 1 started.

## Phase 1 — Org & COA management on the live core (2026-07-02) ✅
- **Migration 020 (applied + probe-verified live):** posting into a CLOSED
  accounting period is rejected by a DB trigger (every write path, not just
  UI); `post_journal_entry` refuses archived accounts; system accounts cannot
  be archived. Probes: closed-period post rejected with clear message, open
  period posts, custom account posts then rejects after archive, 1000 Cash
  archive blocked — all rolled back.
- **Opening-balance builder** (`core/postings.ts:openingBalanceEntry`):
  balanced single entry with automatic Owner Equity (3100) plug on the correct
  side, zero-row filtering, idempotent externalId `opening-balance`; 4 tests.
- **Remote layer** (`core/ledgerRemote.ts`): fetch/add/archive accounts,
  fetch periods, generate Indian FY (Apr–Mar, duplicate-safe), close/reopen.
- **UI** (`components/v2/AccountingSetup.tsx`, mounted on /book/ledger behind
  `flags.accountingSetup`): COA manager (custom accounts, archive/restore,
  system badge), periods card (generate FY, lock/unlock with DB note),
  opening-balances wizard (natural-side inputs, live equity-plug preview).
- Suite: **60 tests green**; tsc clean; /book/ledger renders with signed-out
  gate, no console errors. Authed flows ride the probe-verified DB layer.
- Known limit: period close/reopen + account archive are RLS-scoped to org
  members but not yet role-gated server-side (UI-level only) — hardening item.
