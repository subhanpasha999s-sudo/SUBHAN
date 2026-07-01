# Tulmin Book — Phase 0 Audit

> Written for the "evolve into a full accounting SaaS (Zoho-Books-class) while
> keeping e-commerce reconciliation first-class" initiative.
> Scope of this audit: the **Book** module of the Tulmin repo
> (`src/app/book/**`, `src/book/**`). It does **not** cover the dispatch/label
> tool that shares the repo.

---

## 1. Tech Stack Inventory

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Framework | Next.js (App Router, `"use client"` heavy), React 18 |
| Styling / UI | Tailwind CSS, shadcn primitives, `class-variance-authority`, framer-motion, lucide-react, recharts |
| State | Custom React Context provider (`V2Provider` in `src/book/lib/v2/store.tsx`). `zustand` is a dependency but Book state does **not** use it. |
| Persistence | **localStorage** (instant cache) **+ Supabase Postgres** (`book_state`, one JSON blob per user). Debounced full-state write (~1.2 s). |
| DB / Backend | Supabase (Postgres + Row-Level Security + Auth via `@supabase/ssr`) |
| Auth | Supabase Auth (`src/lib/supabase/*`). Book itself is **not** login-walled — value-first; sign-in is prompted at save time. |
| Payments/Billing | Razorpay (subscriptions, usage credits) — `src/app/api/billing/**` |
| Product analytics | PostHog |
| File ingestion | `papaparse` (CSV), `xlsx`, `pdf-lib` + `pdfjs-dist`, `tesseract.js` (OCR for bank statements) |
| AI | `/api/categorize` → Claude Haiku (bank-transaction categorization) |
| Mobile | Capacitor (Android), via `TULMIN_STATIC_EXPORT` static export |
| Background jobs | **None.** All computation is synchronous in the browser. |
| Tests | **None in this repo** (no vitest/jest config, no `*.test.ts`). The standalone `meeshoprofit` sibling has a `vitest.config.ts`; Tulmin does not. |
| Hosting/Deploy | External dashboard watching `main` on GitHub (no CI/deploy config committed). |

---

## 2. Feature Inventory

Routes live under `src/app/book/<section>/page.tsx`; logic under
`src/book/lib/engine/**` (pure functions) and `src/book/lib/v2/**` (state +
derivations). Nav/RBAC in `src/book/lib/v2/rbac.ts`.

| Section (route) | What it does | Completeness | Key code |
|---|---|---|---|
| `dashboard` | KPI home (revenue, returns, cash, pending recon) | Solid | `derived.ts:dashboardData`, `HealthBanner` |
| `orders` | Order list + lifecycle/funnel | Solid | `derived.ts:ordersOverview/orderFlowFunnel`, `OrderFlow` |
| `settlements` | Payment-truth-per-order (paid/unpaid, unacknowledged payouts) | Solid | `derived.ts:orderRowViews/unmatchedPayouts` |
| `reconciliation` | Matched / awaiting / closed reconciliation state | Solid | `derived.ts:reconciliationState` |
| `upload` / `integrations` | "Smart file ingestion" of Meesho order/payment files (Meesho API unavailable) | Solid, **file-based only** | `engine/parse.ts`, `headerMatcher.ts`, `applyPaymentUpload` |
| `mapping` | Listing-SKU → inventory-SKU mapping (+ bundles) | Solid | `engine/skuMap.ts`, `skuMap` state |
| `inventory` / `sku` | Item master, stock, weighted-avg COGS, reorder | Partial→Solid | `engine/stock.ts/inventory.ts` |
| `purchases` / `vendors` | Purchase bills (stock IN, weighted-avg COGS), vendor master | Partial (no PO, no bill→payment lifecycle) | `BillForm.tsx`, `store.addPurchase/addVendor` |
| `returns` | Returns/RTO queue + QC workflow | Solid | `returnsQueue`, `engine/reconcile.ts` QC helpers |
| `expenses` | Expense recording w/ categories | Solid | `engine/expense.ts` |
| `bank` | Bank statement import wizard, categorization, bank↔ledger recon | Solid | `engine/bankParse.ts/bankCategorize.ts`, `/api/categorize` |
| `pnl` | P&L (accrual/cash), per-order & per-product | Solid | `derived.ts:pnlStatement/orderPnlRows` |
| `gst` | GST monthly summary (CGST/SGST/IGST, TCS) | Partial (summary, not filing-grade GSTR-1/3B) | `engine/gst.ts`, `derived.ts:gstForMonth` |
| `reports` | Trial balance, P&L, Balance Sheet, Cash Flow | **Solid — real double-entry** | `reportDerived.ts`, `engine/accounting.ts` |
| `analytics` | Trends, SKU/state aggregates, insights | Solid | `derived.ts:*Aggregates/insightsFeed` |
| `team` | Users + roles (in-state) | Partial (demo-grade) | `rbac.ts`, `users` in state |

---

## 3. Data Model Map

**The entire Book domain is one in-memory object, `V2State`
(`src/book/lib/v2/types.ts`).** It is cached in localStorage and persisted as a
single `jsonb` blob — one row per user — in Supabase `book_state`
(`migrations/017_book_state.sql`, RLS by `auth.uid()`).

`V2State` fields (all arrays unless noted):

- **Org/identity:** `org` (name, gstin, state, plan, settleAfterDays), `users[]`, `currentUserId`
- **Catalog:** `skus[]`, `skuMap[]` (listing→inventory + bundles), `cogsHistory[]`
- **E-commerce core:** `orders[]` (`OrderRow`, unique `subOrderNo`), `events[]` (`PaymentEvent`), `ledger[]` (`LedgerEvent` = inventory stock movements), `returnsQueue[]`, `claims[]`, `disputed[]`
- **Purchases:** `purchases[]`, `vendors[]`
- **Money in/out:** `expenses[]`, `bankTxns[]`, `bankAccounts[]`, `customers[]`, `invoices[]`
- **Banking import:** `stagingTxns[]`, `bankMappings[]`, `categorizationRules[]`, `importBatches[]`, `categoryHints[]`
- **Ops:** `uploads[]`, `notifications[]`, `audit[]`, `expenseCategories[]`, `inboundAddress`

### Accounting data (flagged)
- **Chart of Accounts** — `engine/accounting.ts` `COA` (assets 1xxx, liabilities 2xxx, equity 3xxx, revenue 4xxx, expenses 5xxx–6xxx).
- **General Ledger** — **derived, never stored.** `reportDerived.ts:buildGlEntries(state, reconciled)` produces balanced `GlEntry[]` (single debitCode/creditCode/amount) on the fly from settlements, COGS, purchases, expenses, and bank txns.
- **Financial statements** — `trialBalanceReport`, `pnlReport`, `balanceSheet`, `cashFlowStatement` all derive from the GL.
- **Tax** — `engine/gst.ts`; TDS/TCS posted to receivable accounts in `buildGlEntries`.

> **Key insight:** there is a genuine double-entry engine, but the ledger is a
> **pure projection of `V2State`**, recomputed every render. There is no stored,
> immutable journal, no posting/period concept, no per-account row in the DB.

---

## 4. E-commerce Reconciliation Deep-Dive (the asset to protect)

**Marketplace coverage:** Meesho is first-class; Amazon/Flipkart appear only as
"coming soon" copy. There are **no live marketplace APIs** — Meesho's is
unavailable, so ingestion is **file-based** (order CSV + payment XLSX), parsed
via `engine/parse.ts` + `headerMatcher.ts` (tolerant to Meesho's shifting
headers/preamble rows).

End-to-end flow:

1. **Ingest** — `applyPaymentUpload` / order import. Idempotency via **file hash**
   (`uploads[]`) and `eventDedupeKey` per payment event. Re-uploading the same
   file does not double-count.
2. **Normalize** — `normalizeSubOrderNo`; `paymentRowToEvent` turns raw payment
   rows into typed `PaymentEvent`s (settlement, fee, claim, TDS, TCS…).
3. **Match** — `reconcileOrder` groups events under an order by `subOrderNo`;
   `sortEvents` → `latestStatus` → `cumulativeSettlement`.
4. **Classify** — `classifyReconciled` / `lifecycleOf` assign a class
   (DELIVERED, RTO, RETURN, EXCHANGE, CLAIM, LOST, PLATFORM_FEE, CANCELLED…).
   Exchange-then-return double-counting is handled explicitly.
5. **Report reconciliation** — `reconciliationState` (matched / awaiting / closed),
   `openSettlements`, `unmatchedPayouts` ("money with no known order"),
   `settlementStatusOf`.
6. **Bank tie-out** — `derived.ts:bankReconciliation` relates payouts to bank
   deposits; the bank module matches ledger vs statement.
7. **Auto-post to GL** — `buildGlEntries`: positive settlement → DR Cash / CR
   Revenue (Sales/Exchange/Claim/Lost); platform fee → DR Platform Fee / CR Cash;
   TDS/TCS → DR receivable / CR Revenue; negative settlement → DR Return Loss /
   CR Cash; per-order COGS → DR COGS / CR Inventory.

**Matching logic lives in:** `engine/reconcile.ts` (crown jewel),
`engine/classify.ts`, and the projections in `derived.ts`.

**Behaviours encoded as business rules (must not regress):** Exchange→Return
counts as 2 customer returns; cancelled/RTO/return-no-event = "closed" (never
"awaiting"); reconciliation identity `matched + awaiting + closed`.

---

## 5. Architecture Assessment

**Clean / strong**
- Pure, well-factored calculation engine (`engine/**`) — testable in isolation.
- A **real** double-entry accounting core already exists and balances.
- Reconciliation logic is thorough, rule-rich, and idempotent.
- Clear 3-layer RBAC intent (RLS → server actions → UI nav).

**Tangled / risky**
- **Single JSON-blob state is the dominant constraint.** Every mutation
  re-serializes all of `V2State` and rewrites one Supabase row; reads pull the
  whole blob. This caps data volume (localStorage quota loss already happened
  historically), blocks server-side queries, blocks concurrent multi-user edits,
  and forces all accounting math into the browser.
- **Tenancy is per-USER, not per-ORG.** `book_state` is keyed by `user_id`. The
  `org`/`users[]` inside the blob are effectively single-user; there is no shared
  book, so RBAC roles/team are demo-grade rather than true collaboration.
- **The GL is derived, not posted.** Great for "no backfill," but it precludes
  immutable journals, period locking/closing, opening balances as first-class
  postings, and audit-grade correction/reversal semantics — all table-stakes for
  Zoho-class accounting.
- **No tests** on money math — dangerous for an accounting system.
- **Duplication risk:** the Book code is mirrored between the Tulmin repo
  (`src/book/**`) and the standalone `meeshoprofit` app; changes must be made in
  both.
- **No server compute / jobs** — no place for scheduled syncs, return filing,
  recurring invoices/bills, or heavy report generation.

**Scaling blockers (ranked)**
1. JSON-blob-in-browser state model.
2. Per-user (not per-org) multi-tenancy.
3. Derived-only ledger (no immutable posted journal + periods).
4. No automated tests around financial correctness.

---

## 6. Gap Analysis vs Target Feature Set (Section 4 of the brief)

| Feature | Status | Notes / Where it lives |
|---|---|---|
| **A. Core accounting** |||
| Chart of Accounts | Partial | Fixed COA in `accounting.ts`; no custom/templated accounts, no DB table |
| Double-entry ledger / GL | Have (derived) | `buildGlEntries`; not a stored immutable journal |
| Journal entries (manual + auto) | Partial | Auto only; **no manual JE UI** |
| Accounting periods / fiscal year / locking | Missing | none |
| Opening balances | Partial | `openingStock`, `bankAccount.openingBalance`; no equity opening JE |
| Multi-currency | Missing | INR-only assumptions |
| Trial balance | Have | `trialBalanceReport` |
| **B. Sales & receivables** |||
| Customer management | Partial | `customers[]` (mostly bank-derived), no statements |
| Quotes/estimates → convert | Missing | none |
| Sales orders | Partial | Marketplace orders exist; no manual SO |
| Invoices (one-time/recurring/partial) | Partial | `invoices[]` basic; no recurring, no PDF/branding |
| Credit notes / refunds | Partial | Refunds flow via reconciliation; no formal credit-note doc |
| Payments received + allocation | Partial | Bank match to invoice; no rich allocation UI |
| AR aging | Partial | invoice due dates exist; dedicated aging report thin |
| **C. Purchases & payables** |||
| Vendor management | Have | `vendors[]`, inline create |
| Purchase orders | Missing | bills only, no PO |
| Bills → payments | Partial | bill created; payment lifecycle/`amountPaid` thin |
| Expense recording (+receipts) | Have | `expenses[]`; attachments limited |
| Vendor credits | Missing | none |
| Recurring bills | Missing | none |
| AP aging | Partial | `dueDate` on purchases; report thin |
| **D. Inventory** |||
| Item master (SKU/HSN) | Have | `skus[]` with HSN, GST |
| Stock tracking realtime | Have | `ledger[]` (LedgerEvent), `engine/stock.ts` |
| Valuation | Have (weighted-avg) | documented in COGS history; **FIFO not offered** |
| Warehouses / locations | Missing | single implicit location |
| Stock adjustments / reorder | Have | `stockAdjustment`, reorder levels |
| Inventory ↔ e-com orders | Have | orders draw down `ledger` |
| **E. Banking** |||
| Bank/cash accounts | Have | `bankAccounts[]` |
| Statement import (CSV/OFX/QIF/CAMT) | Have | `engine/bankParse.ts` |
| Reconciliation UI | Have | `bank` page |
| Auto-categorization rules | Have | `categorizationRules[]` + AI `/api/categorize` |
| Payout ↔ bank tie-out | Partial | `bankReconciliation`; deep unified flow to strengthen |
| **F. Tax / GST** |||
| CGST/SGST/IGST compute | Partial | `engine/gst.ts` summary |
| Rates & HSN/SAC mapping | Partial | HSN on SKU; no SAC/rate master |
| Place-of-supply logic | Missing | not modeled |
| GSTR-1 / GSTR-3B export | Missing | monthly summary only |
| TDS / TCS | Partial | posted to GL; no return/report |
| E-invoice / e-way hooks | Missing | none |
| **G. E-commerce recon** |||
| Marketplace integrations | Partial | Meesho file ingest; no live API; connector interface absent |
| Idempotent order sync | Have | file hash + event dedupe |
| Settlement/payout reconciliation | **Have (strong)** | `engine/reconcile.ts`, `derived.ts` |
| Return/refund → accounting | Have | reconciliation → GL |
| Discrepancy detection | Have | `unmatchedPayouts`, unpaid/awaiting |
| Auto-post accounting entries | Have | `buildGlEntries` |
| **H. Reports & dashboards** |||
| P&L / Balance Sheet / Cash Flow | Have | `reportDerived.ts` |
| AR/AP aging | Partial | thin |
| Tax/GST reports | Partial | summary |
| Sales/purchase summaries | Have | analytics/pnl |
| E-com profitability / per-SKU margin | Have | `productPnlRows`, `skuAggregates` |
| Main KPI dashboard | Have | `dashboardData` |
| **I. Platform** |||
| Multi-tenancy / multiple orgs | Missing (per-user only) | `book_state.user_id` |
| RBAC | Partial | `rbac.ts` UI layer; server/RLS layer for Book state thin |
| Audit log | Partial | in-state `audit[]`, not immutable/server |
| Attachments | Partial | limited |
| Notifications (email + in-app) | Partial | in-app `notifications[]`; email thin |
| CSV import/export | Have | across modules |
| Public API + webhooks | Missing (for Book) | app APIs are billing/admin only |
| Settings (numbering, branding, tax) | Partial | org profile; numbering/branding missing |

**Headline:** the **e-commerce reconciliation + a working double-entry core +
statements** are already real and are the moat. The gaps are (1) the persistence
/ tenancy foundation, (2) document-centric accounts-receivable/payable workflows
(quotes, POs, invoices, credit notes, recurring), and (3) filing-grade tax.
