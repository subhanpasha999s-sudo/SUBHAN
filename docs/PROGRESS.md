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
## Phase 1 — Org & COA management on the live core (2026-07-02) ✅
- Migration 020 (applied + probe-verified): closed accounting periods reject
  postings via trigger; post_journal_entry refuses archived accounts; system
  accounts cannot be archived.
- `core/postings.ts openingBalanceEntry`: opening-balances wizard entry with
  automatic Owner Equity plug, idempotent externalId (4 new tests).
- `ledgerRemote`: accounts CRUD (add custom, archive/restore), periods
  (fetch, generate Indian FY Apr–Mar, close/reopen).
- Feature flag module `src/book/lib/flags.ts` (spec §3.10).

## Phase 2 — Contacts + items polish (2026-07-03) ✅
- Customer/Vendor types enriched (GSTIN, state, phone, email, address, notes —
  all optional, blob-compatible).
- `core/contacts.ts` (+7 tests): RFC-4180 CSV export, fuzzy-header import
  mapping, case/space-insensitive dedupe, mergeCustomerRecords (reassign
  invoices, fill-empty-fields-only, remove duplicate), stock-adjustment
  reason codes.
- Store actions: updateCustomer, mergeCustomers, importCustomers,
  updateVendor, importVendors (guarded, audited).
- UI: customers page — Export/Import CSV, inline contact editor, duplicate
  merge; vendors page — Export/Import CSV; inventory — reason-code select
  (+ mandatory note for OTHER) behind flags.contactsPlus.
- Browser-verified: CSV import (fuzzy headers, in-file dup skipped), edit
  persistence, merge (count 3→2, kept fields preserved, empty email filled
  from duplicate, audit trail CUSTOMER_IMPORT/EDIT/MERGE); vendors import
  round-trip. Inventory reason select is unit-tested + typechecked (not
  click-tested — needs a product in the fresh preview profile).
- Suite: 67 tests green. Deliberate cut: committed-vs-available stock deferred
  (Book doesn't track dispatch state; noted in GAP_ANALYSIS).

## Phase 3 (slice 1) — Credit notes + complete back-fill (2026-07-03) ✅
- CreditNote document (v1: invoice-linked, auto-applied, clamped to
  outstanding; standalone credits + cash refunds deferred, logged in
  GAP_ANALYSIS). Invoice gains amountCredited; status/settlement math and
  receipt clamping are credit-aware everywhere (store, AR aging, customer
  balances, invoices UI).
- addCreditNote store action (guarded, audited, CN-#### numbering).
- Ledger: credit notes post DR Sales / CR AR via collectDocumentPostings —
  "Sync from activity" is now the complete idempotent back-fill (derived GL +
  invoices + receipts + credit notes), fulfilling spec §6 migration duty.
- UI: Credit action on invoices (amount + reason prompts, "+ CN ₹x" under
  Paid); customer statements list credit notes with running balance.
- Browser-verified: invoice 1000 → receipt 300 (AR 700, partial) → CN 200
  (AR 500, "+ CN" shown) → CN 500 (AR 0, paid, actions gone); statement runs
  1000→700→500→0 "Settled"; blob holds CN-0001/CN-0002 with reasons.
- Suite: 68 tests green. Remaining Phase 3: estimates→invoice, recurring
  invoices, payment reminders, PDF templates.

## Phase 3 (slice 2) — Estimates + recurring invoices (2026-07-03) ✅
- Estimate document (EST-#### numbering; open → accepted/declined → invoiced;
  non-financial — never posts to the ledger; conversion creates a normal
  invoice that posts AR, with a "From EST-x" note + invoiceId back-link).
- RecurringInvoice schedules (monthly, day-of-month with short-month clamping)
  materialized client-side: `core/salesDocs.ts` pure date math (+8 tests:
  advanceMonthly Jan-31→Feb-28→Mar-31, firstRunDate, computeDueRuns catch-up +
  cap), catch-up on invoices-page load (ADS_AUTO pattern), and due-today
  billing done atomically inside addRecurringInvoice — a stale-stateRef race
  between back-to-back action calls was found in browser testing and fixed.
- UI: Estimates + Recurring cards on /book/invoices (create, accept/decline,
  → Invoice, pause/resume, next-run display).
- Browser-verified: EST-0001 → accept → convert → INV-0002 (AR 750);
  reload materialized INV-0003 ₹250 (next 2026-08-03); post-fix schedule
  billed INV-0004 ₹99 in the same click (audit "billed 1 immediately"),
  AR ₹1,099. Suite: 76 tests green.
- Remaining Phase 3: payment reminders, PDF templates.

## Phase 3 (slice 3 — final) — Payment reminders + invoice PDFs (2026-07-03) ✅
- Reminders: pure overdue/throttle logic in core/salesDocs (isOverdue counts
  credits; shouldRemind once per 7 days; +2 test blocks). Store actions
  runPaymentReminders (page-load, batched notification per overdue invoice,
  sets lastReminderAt) + remindInvoice (manual nudge). Invoices UI: red ⚠ due
  dates, Remind button on overdue rows.
- Invoice PDF: core/invoicePdf.ts via pdf-lib (A4, org/GSTIN header, bill-to
  block, amount + received/credited/balance summary, status; "Rs" because
  WinAnsi fonts can't encode ₹; 2 tests incl. re-parse). PDF button per row
  (lazy-imported).
- Browser-verified: overdue INV-0005 → reload raised exactly one notification
  ("INV-0005 is 32 days overdue · Bharat Traders owes 400"), second reload
  raised none (throttle), PDF click produced a 1.7 KB application/pdf blob.
- Suite: 80 tests green. **Phase 3 complete** (credit notes, back-fill,
  estimates→invoice, recurring, reminders, PDFs).

## Phase 4 — Purchases completion (2026-07-03) ✅
- PurchaseOrder document (PO-####; open/received/cancelled; non-financial
  until received). Receive → bill via the existing addPurchase path (stock IN
  + weighted-avg COGS + AP posting untouched), quick-creating unknown SKUs.
- Landed-cost allocation: core/purchaseDocs.ts (by value|quantity, remainder-
  to-last-line so totals are exact, degenerate-weight fallbacks; GST on goods
  only, landed added net; 5 tests). Unit costs grossed up before receive so
  weighted-avg COGS absorbs freight with zero engine changes.
- VendorCredit (VC-####, bill-linked, clamped): posts DR AP / CR Inventory in
  the derived GL; AP outstanding/aging/status and payment clamp are credit-
  aware. Characterization: bill 1000 − credit 300 → AP 700 / Inventory 700.
- UI: Purchase-orders card (form with line items + landed cost + live totals,
  Receive → bill, Cancel) + Credit action per bill, behind flags.purchasing.
- Browser-verified: PO-0001 (10×50 @5% GST + ₹100 landed = ₹625) → receive
  created pending bill ₹625, SKU auto-created with COGS 60 (=50+100/10),
  stock +10, PO received+linked; VC-0001 ₹125 "short shipment" → AP ₹500,
  bill partial. Suite: 86 tests green.
- Deferred: recurring bills (same pattern as recurring invoices — small
  follow-up), vendor advances.

## Phase 5 — Banking: matching + payout tie-out (2026-07-03) ✅
- core/bankMatch.ts (pure, 7 tests): payoutBatches (net per Meesho Transaction
  ID = payout batch), suggestPayoutMatches (deposit↔batch, ₹1/1% tolerance,
  greedy one-batch-per-deposit), suggestDocMatches (credit↔open invoice,
  debit↔open bill by outstanding), bankBalanceSummary (running statement
  balance + cleared/uncleared).
- Single-source cash (no double-count): matching a bank line records the
  receipt/bill-payment (the GL cash source) and marks the bank line EXCLUDED
  so the GL builder skips it; a Meesho deposit matched to a payout batch is
  only reconciled (settlement already posted DR Cash) — never re-booked.
- Store: matchBankToInvoice / matchBankToBill / matchDepositToPayout /
  unmatchBankTxn (payout unmatch reverts cleanly; doc unmatch reopens the line
  but the receipt/payment stays — append-only correction). matchedBatchId
  added to StoredBankTxn.
- New /book/matching page (section "matching", nav "Bank Match"): summary
  cards, auto-suggested one-click matches + manual picker, matched list w/
  unmatch.
- Browser-verified (injected fixtures): 3 lines → payout 350 / invoice
  INV-0003 250 / bill PO-0001 500 all auto-suggested with exact ✓; applying
  set invoice open→paid (receipt created), bill partial→paid (bill-payment
  created), all three bank lines EXCLUDED, unmatched 0; unmatch reverted the
  payout line to PENDING and the suggestion reappeared. Suite: 93 tests green.
- Deferred: split transactions, account transfers (transferPairId exists),
  editing the 1473-line bank import page — kept matching self-contained.

## Phase 6 — Reporting framework: General Ledger + drill-down (2026-07-03) ✅
- core/generalLedger.ts (posting-based, 6 tests): LedgerPosting model;
  postingsFromGl (each GlEntry → debit+credit posting) + postingsFromJournal
  (each document line → posting) so the GL view reflects the COMPLETE ledger
  (derived GL + invoices/receipts/credit notes), matching what sync writes to
  the stored ledger. accountLedger (opening/closing + running natural-sign
  balance, date range), activeAccountCodes, compareAccountMovements (two-range
  net-movement comparison).
- /book/gl "General Ledger" page (section "gl", nav): account picker (flags
  no-activity accounts), from/to range, opening→rows→closing with running
  balance and totals footer, per-row drill link to the source document
  (orders/purchases/invoices/matching), and a this-month-vs-last-month
  comparison table (click a row to jump to that account).
- Browser-verified: AR account now shows invoices/receipts/credit-note
  postings with running balance (closing ₹1,249); Cash drill links resolve to
  /book/orders/REC_* and /book/invoices; compare-months table renders.
  Existing P&L/Balance Sheet/Cash Flow/Trial Balance reports unchanged.
  Suite: 99 tests green.
- Deferred: scheduled email delivery, saved report customizations, accrual/cash
  toggle on every report.

## Phase 7 — India GST pack (2026-07-04) ✅
- core/gstPack.ts (pure, 8 tests): GST state-code reference map with fuzzy
  normalization + aliases; placeOfSupply (org vs buyer state; unknown buyer →
  inter-state "OT", unset org → conservative inter-state); splitByPlace
  (CGST/SGST halves incl. odd-paise, IGST inter); gstr1B2C (net B2C table by
  POS × rate, returns subtract); hsnSummary (GSTR-1 table 12); gstr3b
  (3.1(a) outward + IGST/CGST/SGST + ITC + GST-TCS credit, floor-0 payable);
  tcsTdsLedger (monthly + cumulative marketplace withholdings, payment-date
  basis). No statutory rate hardcoded — rates ride on items.
- /book/gst page (flag gstPack): GSTR-3B stat row, GSTR-1 B2C POS table, HSN
  summary, TCS/TDS credit ledger; GSTR export workbook gains GSTR-1 B2C /
  HSN / GSTR-3B / TCS-TDS sheets. Same month + classification basis as the
  existing working summary so totals reconcile with outputGst.
- Verification note: preview tooling was unavailable this session — tax math
  is fully unit-tested (the right instrument); the page additions are
  typechecked + linted but not click-tested yet. Suite: 107 tests green.
- Deferred: cross-month return credit notes in GSTR-1, e-invoicing (IRN/QR)
  provider interface, composition scheme (operator: regular only).

## Phase 8 — Meesho settlement 2.0 (2026-07-04) ✅
- core/settlementHealth.ts (pure, 8 tests): detectSettlementExceptions
  (MISSING_SETTLEMENT past grace, NEGATIVE_ON_DELIVERED, LOW_REALIZATION vs
  customer price, UNMATCHED_PAYOUT) with configurable thresholds + a "why"
  detail on each; openExceptions (applies resolutions); deductionBreakdown
  (per-month gross-in / return-charges / platform-fees / claims / recovery /
  TCS / TDS / net, payment-date basis). OBSERVES only — GL posting rules
  untouched (MEESHO_RULES §4 golden master intact).
- Store: settlementResolutions state + resolve/reopen actions (guarded
  mark_disputed, audited).
- /book/reconciliation (flag settlement2): exceptions queue with resolve/
  ignore + at-stake total + order drill-links, and a 6-month deduction
  breakdown table.
- Browser-verified: injected 3 fixtures → all three exception kinds fired
  (open 3, at-stake shown), deduction table rendered; Resolve persisted
  (settlementResolutions + audit SETTLEMENT_EXC), open 3→2. Suite: 115 tests.
- Deferred: per-deduction-type SEPARATE ledger accounts (would change golden
  GL — needs operator sign-off); ad-spend allocation into per-order profit.

## Phase 9 — Marketplace pack framework (2026-07-04) ✅
- core/marketplacePack.ts (5 tests): MarketplacePack interface (file formats,
  deduction taxonomy, capability flags incl. multiAccount, pure parsers).
  MEESHO_PACK = pack #1, a NON-INVASIVE wrapper over the existing engine
  parsers (parseOrderRows/parsePaymentRows) — zero behavior change, golden
  master intact. FLIPKART_PACK + AMAZON_PACK scaffolded as "planned" with
  their deduction taxonomies (operator order Meesho→Flipkart→Amazon).
  Registry (MARKETPLACE_PACKS/getPack/livePacks) + packParseOrders/Payments
  that throw PackNotLiveError for planned packs.
- /book/integrations (flag marketplacePacks): Marketplaces card — Meesho Live,
  Flipkart/Amazon Planned, with file formats + taxonomy chips per pack.
- Browser-verified: card renders all three packs with correct Live/Planned
  badges and taxonomies. Tests prove Meesho pack delegates to the real
  parsers (400.50 settlement, legend row skipped) and planned packs refuse.
  Suite: 120 tests green.
- Note: §7.4 per-order/SKU profitability + §7.5 seller dashboard already
  shipped (orderPnlRows/productPnlRows, dashboard/analytics) — this phase
  delivered the §7.6 framework. Deferred: full multi-account UI, ad-spend
  per-order allocation, column-mapping fallback UI (§7.7).

## Phase 10 (slice 1) — Org settings + full-org backup/restore (2026-07-04) ✅
- core/backup.ts (7 tests): versioned envelope (format/version/exportedAt),
  serializeBackup, parseBackup (never throws; rejects non-JSON, foreign files,
  newer-version, missing required keys; flags older versions),
  backupRecordCount for the replace confirmation.
- Store: updateOrg (name/GSTIN/state — state closes the GST place-of-supply
  loop from Phase 7) + restoreBackup (full replace after validated+confirmed).
- /book/team (flag orgSettings): Organization card — editable profile with a
  GST-state datalist, Export backup (downloads versioned JSON), Restore backup
  (validates → record-count confirm → replace).
- Browser-verified: set org state Karnataka → saved (audit ORG_EDIT); Export
  produced a valid tulmin-book-backup v1 envelope. Restore validation
  unit-tested. Suite: 127 tests green.
- Remaining Phase 10: workflow rules, custom fields, public REST API +
  webhooks (API needs server routes — separate slice).

## Phase 10 (slice 2) — Custom fields (2026-07-04) ✅
- core/customFields.ts (7 tests): CustomFieldDef (text/number/date/select/
  checkbox, per entity); validateFieldValue (empty clears; number strips
  commas/rejects non-numeric; date requires ISO; select must be an option;
  checkbox normalizes truthy strings); formatFieldValue; fieldsForEntity +
  customFieldHeaders for CSV.
- State: customFieldDefs[] + Customer.customFields. Store: addCustomFieldDef /
  deleteCustomFieldDef (manage_team) + setCustomerCustomField (validated).
- UI: Custom fields manager in /book/team settings (add label/entity/type/
  options, list, remove); editable custom-field card on the customer statement
  (flag customFields).
- Browser-verified: defined "Loyalty tier" select (Gold/Silver/Bronze) →
  appeared on a customer → set Gold → persisted to customFields; audit
  CUSTOM_FIELD_ADD. Suite: 134 tests green.
- Remaining Phase 10: workflow rules; public REST API + webhooks (needs server
  routes — separate slice from the client-blob model).

## Phase 10 (slice 3) — Public REST API v1 (2026-07-04) ✅
- core/apiKeys.ts (4 tests): generate (tul_live_ prefix + random), SHA-256
  hash (only the hash is stored), prefix for display, constant-time compare,
  bearer parse.
- Migration 021 (applied): api_keys table (org-scoped, key_hash unique, scopes,
  RLS owner/manager). Migration 022 (applied): post_journal_entry relaxes its
  membership guard to JWT callers only, so the service-role API path (already
  key-authed) can post.
- src/lib/api/authenticate.ts: bearer → SHA-256 → api_keys lookup → org+scopes
  (service role; API layer is the tenancy boundary), pagination, scope guard.
- Routes: GET /api/v1/accounts, GET+POST /api/v1/journal-entries,
  GET /api/v1/trial-balance. docs/API.md.
- core/apiKeysRemote.ts + Team-page API-keys card: generate (plaintext shown
  once), list, revoke (flag publicApi).
- Verified LIVE via curl against a throwaway org+key+entries: 401 no/bad key;
  accounts paginated; entries with joined lines; trial balance balanced;
  POST balanced -> 201, unbalanced -> 422 (exact error), idempotent externalId
  -> same id; trial balance updated to 1500=1500. Probe org cleaned up
  (immutability trigger correctly blocked the delete → toggled for cleanup →
  re-enabled). Suite: 138 tests green.
- Deferred: webhooks (no delivery queue in this stack).

## Phase 12 (slice 1) — Hardening: money, isolation, RBAC (2026-07-04) ✅
- Money (spec §3.4): DECISION — a full integer-paise rewrite of the
  golden-mastered engine is a §10 big-bang risk to MEESHO_RULES, so NOT done.
  Instead: core/money.ts exact paise primitives (toPaise/fromPaise/sumMoney/
  subMoney/splitMoney/allocateMoney — conserve totals to the paisa) for new
  code + future migration; money.test.ts (6 tests) incl. fuzz proving round2
  sums match exact-paise sums over 1000 amounts (<½ paisa) and a 500-entry
  ledger fuzz nets to zero. Recommend deferring the engine migration unless the
  operator wants it (would need a full golden-master re-verify).
- Tenant isolation (spec §3.5): scripts/tenant-isolation-probe.mjs (rolled
  back) — PROVED live: a user sees only their org's entries/accounts/lines
  (unfiltered scan exposes exactly 1 org), cannot read another org's data, and
  cannot post into it ("not a member"). Runnable on demand. Exit 0 = holds.
- RBAC audit: rbac.test.ts (9 tests) — every section/action has a valid
  non-empty role list; owner sees/does all; returns_manager walled off from
  all financial areas (incl. the ledger/gl/matching sections added this
  initiative); only owner manages team; unknown actions denied.
- Suite: 153 tests green (20 files).

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
