# GAP_ANALYSIS — spec §5–§7 vs the codebase (2026-07-02)

> HAVE = working today · PARTIAL = exists but short of spec · MISSING = absent.
> "core/*" = the new accounting core already landed (migrations 018–019 live on
> Supabase + `src/book/lib/core/**`, 56 tests green). Reuse column names the
> code to build on. See AUDIT.md for the deeper module inventory.

## §5.1 Core accounting
| Feature | Status | Reuse / notes |
|---|---|---|
| Seeded COA per org | HAVE (fixed) | DB `seed_default_accounts` (19 accts) + `engine/accounting.ts`; custom accounts/archive MISSING |
| Immutable double-entry ledger | HAVE | `journal_entries/_lines`, balanced-entry trigger, reversal-only; `core/journal.ts` |
| Manual journals | HAVE (basic) | `/book/ledger` form + `post_journal_entry` RPC; drafts/recurring/attachments MISSING |
| Fiscal year, period lock | PARTIAL | `accounting_periods` table exists; no UI/enforcement |
| Opening balances wizard | MISSING | `openingStock` + bank opening balance exist as inputs |
| Multi-currency | MISSING | INR-only; `organizations.base_currency` column exists |
| Org profile (GSTIN, numbering, branding) | PARTIAL | org name/gstin/state in blob; numbering/branding MISSING |
| Users/roles/permissions/invites | PARTIAL | 3-layer RBAC (`rbac.ts`) but demo-grade team; per-user activity = in-blob `audit[]` |
| **Money not-float rule** | **DEVIATION** | engine uses JS numbers @2dp; DB is `numeric(14,2)`. Plan: enforce decimal at DB/RPC boundary now; migrate engine to integer paise in Hardening phase |

## §5.2 Contacts
| Feature | Status | Notes |
|---|---|---|
| Customers | PARTIAL | `customers[]` + /book/customers (balances, statements, inline add) |
| Vendors | PARTIAL | `vendors[]` + /book/vendors + inline create in BillForm |
| One contact both roles / persons / addresses / GSTIN per contact | MISSING | |
| Credit limits, merge, portal toggle, CSV | MISSING | |
| Marketplace buyers as lightweight B2C | HAVE (by design) | buyers never pollute contacts — orders carry state only |

## §5.3 Items & inventory
| Feature | Status | Notes |
|---|---|---|
| Item master w/ HSN, images, GST rate | HAVE | `skus[]`, ProductForm |
| Marketplace-SKU ↔ item mapping | **HAVE (strong)** | `skuMap` incl. bundles, auto-map, own storage key |
| Weighted-avg valuation + COGS history | HAVE | `engine/stock.ts`, `cogsHistory` |
| Reorder alerts, adjustments→journals | HAVE / PARTIAL | adjustments post via `core/postings.ts` builders; reason codes minimal |
| Committed vs available, warehouses, transfers, price lists, packaging auto-consume | MISSING | |

## §5.4 Sales cycle
| Feature | Status | Notes |
|---|---|---|
| Invoices + partial payments | PARTIAL | /book/invoices + receipts; posts AR via `documentPostings` |
| Estimates/SO/packing slips, recurring, reminders, credit notes UI, PDF templates, portal | MISSING | `creditNotePosting` builder exists |
| Marketplace sales → same ledger classes | HAVE | derived GL → `glEntryToJournal` port, parity-proven |

## §5.5 Purchases & expenses
| Feature | Status | Notes |
|---|---|---|
| Bills + payments + AP | HAVE (basic) | BillForm, `recordBillPayment`, AP aging; browser-verified |
| PO, receive-items, landed cost, vendor credits/advances, recurring | MISSING | `vendorCreditPosting` builder exists |
| Expenses | HAVE | categories, ADS_AUTO; mileage/billable MISSING |

## §5.6 Banking
| Feature | Status | Notes |
|---|---|---|
| Accounts, CSV/OFX/QIF import, saved mappings | HAVE | `bankParse.ts`, wizard |
| Rules engine + AI categorization | HAVE | `bankCategorize.ts`, `/api/categorize` |
| Matching to invoices/bills | PARTIAL | `matchedBillId/matchedInvoiceId` fields; suggest-UI thin |
| **Payout ↔ bank deposit matching** | PARTIAL | `bankReconciliation` derivation; no batch matcher UI (→ Meesho 2.0) |
| Reconciliation w/ closing-balance check, transfers | PARTIAL | transfer_pending status exists; workflow thin |

## §5.7 Projects & time — MISSING
**Recommendation: DROP for this market** (Meesho sellers don't bill hours).
Logged as a removal-of-scope in REMOVALS.md; revisit only on operator request.

## §5.8 Taxes
| Feature | Status | Notes |
|---|---|---|
| GST summary (CGST/SGST/IGST), TCS/TDS captured per order | PARTIAL | `engine/gst.ts`, GL posts TDS/TCS receivable |
| Rate/tax-group engine, place-of-supply, GSTR-1/3B exports, TCS credit ledger recon, e-invoicing, composition | MISSING | build as the GST pack phase |

## §5.9 Reporting
| Feature | Status | Notes |
|---|---|---|
| P&L, Balance Sheet, Cash Flow, Trial Balance | HAVE | `reportDerived.ts` + XLSX/print export |
| GL/journal/account-transactions from stored ledger | PARTIAL | trial balance from stored ledger on /book/ledger; drill-down thin |
| AR/AP aging | HAVE (basic) | `core/aging.ts` on ledger + invoices pages |
| Framework (comparisons, drill-down, scheduling, saved views) | MISSING | |
| Seller KPIs dashboard | HAVE (strong) | dashboard, analytics, insights |

## §5.10 Automation & platform — MISSING
(workflow rules, email/PDF templates, custom fields, docs inbox, public API,
webhooks, backup export). CSV/XLSX export HAVE per-report; import HAVE for
orders/payments/bank.

## §7 Meesho enhance
| Feature | Status | Notes |
|---|---|---|
| 7.1 Order-to-books automation | PARTIAL | derived GL covers sale/COGS/fees/TDS/TCS; GST split + lifecycle correcting entries MISSING |
| 7.2 Settlement 2.0 (per-deduction accounts, exceptions queue) | PARTIAL | deduction taxonomy exists in events; single fee account today; no exceptions workflow |
| 7.3 Returns/RTO & claims | **HAVE (strong)** | QC queue, dual-return rule, claims tracker w/ statuses |
| 7.4 Per-order/SKU profitability | HAVE | `orderPnlRows`, `productPnlRows` (packaging/ad allocation per-order MISSING) |
| 7.5 Seller dashboard | HAVE | plus TCS/TDS balances via ledger |
| 7.6 Marketplace pack framework, multi-account | MISSING | refactor target — Meesho becomes pack #1 |
| 7.7 Format resilience | PARTIAL | header scan + variant tables + content detection; parser versioning + mapping-UI fallback MISSING |

## Removal candidates (spec §2 authority; log in REMOVALS.md when acted on)
1. **Projects & time (§5.7)** — drop from roadmap for this market.
2. **`src/book/lib/engine/index.ts:computeMonth` MVP path** — superseded by the
   V2 reconcile pipeline; delete once confirmed unreferenced.
3. **Duplicate Book codebase in `../meeshoprofit`** — freeze it as the archive
   copy; stop dual-maintaining (biggest ongoing waste). Operator-visible change,
   so flagged rather than done.
4. Legacy `IGNORED` bank-txn status (kept only for old data) — migrate → EXCLUDED.

## Adjusted phase order (replaces spec §8 defaults)
Credit for work already done: spec-P1 core ≈ landed; P4/P5 basics ≈ landed.

- **P0 (this)** — audit, MEESHO_RULES + pinned tests ✅ → operator review
- **P1** — Org & COA management UI (custom accounts, periods+locking UI,
  opening-balances wizard, org profile/numbering) on the live core
- **P2** — Contacts unification (customer+vendor model, addresses, GSTIN,
  merge, CSV) + items polish (committed/available, reason codes)
- **P3** — Sales cycle completion (credit notes UI, estimates→invoice,
  recurring, reminders, PDF templates) + **back-fill: one-click full ledger
  sync for existing users** (port is already idempotent)
- **P4** — Purchases completion (PO→bill→receive, vendor credits, landed cost)
- **P5** — Banking: matcher UI (suggested matches, splits, transfers,
  closing-balance reconciliation) incl. **payout-batch ↔ deposit matching**
- **P6** — Reporting framework (drill-down, comparisons, saved views,
  scheduling) reading the stored ledger
- **P7** — India GST pack (place-of-supply, GSTR-1/3B, TCS credit ledger,
  e-invoice interface, composition flag; configurable rates w/ effective dates)
- **P8** — Meesho enhancement suite: settlement 2.0 per-deduction accounts +
  exceptions queue; order-to-books GST split; lifecycle correcting entries
- **P9** — Marketplace pack framework + multi-account + format resilience UI
- **P10** — Automation, custom fields, public API/webhooks, docs inbox
- **P11** — Hardening: integer-paise money migration, per-entity Postgres
  tables (strangler-fig off the blob), tenant-isolation tests, perf, backup

Projects & time: dropped (see above). Main stays deployable at each phase end.
