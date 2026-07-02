# MASTER PROMPT — Upgrade This SaaS to a Full Cloud Accounting Platform with Native Meesho Reconciliation

(Full spec as provided by the operator on 2026-07-02. This file is the single
source of truth for the multi-phase upgrade. Work strictly phase by phase.)

## 1. Mission
Evolve this books/accounting app for online sellers into a complete cloud
accounting platform (Zoho Books–class scope) while preserving the existing
Meesho order-import + payment-reconciliation behavior exactly, then enhance the
Meesho side into a full marketplace-seller accounting layer. End state: a
Meesho seller runs their entire business's books from this one app. All
original work — competitors are functional inspiration only.

## 2. Authority
Broad autonomy to ADD / DELETE / REFACTOR / DECIDE without asking, with:
1. every removal logged in docs/REMOVALS.md (what/why/commit/restore),
2. deprecate before destroying (feature flag / soft delete first; never
   hard-delete stored business data),
3. hard lines needing explicit operator approval:
   - changing/removing behavior in docs/MEESHO_RULES.md (incl. accepted file formats)
   - dropping/altering tables or columns holding live tenant/financial data
   - anything irreversible for production data.

## 3. Non-negotiable engineering rules
1. Discovery before code (Phase 0 first).  2. Double-entry core; corrections by
reversal only.  3. Reports read from the ledger.  4. Money is never a float.
5. Strict multi-tenant isolation with tests.  6. Audit trail on financial
mutations.  7. Reversible migrations.  8. Invariant tests (TB balances; per-entry
debit=credit; AR/AP control reconciles to documents; settled+pending+deducted
per marketplace order reconciles to order total).  9. Idempotent imports.
10. Feature-flag new modules; main stays green.

## 4. PHASE 0 — deliverables then STOP
docs/STACK.md · docs/MEESHO_RULES.md (crown jewels, with sample-file fixtures +
regression tests pinning behavior) · docs/GAP_ANALYSIS.md (HAVE/PARTIAL/MISSING
vs §5–§7, reuse, removal candidates, adjusted phase order) · CLAUDE.md at root.
Confirm with operator: (a) India GST first + composition-scheme support?
(b) where Meesho data comes from + active file formats, (c) next marketplaces
and gateways/banks.

## 5. Accounting parity checklist (summary)
5.1 Core accounting: COA seeded per org (incl. AR/AP/tax/TCS-TDS receivable/
inventory/COGS/marketplace fees/rounding/unearned), manual+recurring journals,
fiscal year + opening balances + period lock, multi-currency (INR-first),
org profile (GSTINs, numbering, branding), users/roles/permissions/activity.
5.2 Contacts: customers+vendors, persons, addresses, GSTIN + tax treatment,
defaults, credit limits, marketplace buyers as lightweight B2C records,
statements, merge, CSV.
5.3 Items & inventory: goods/services/bundles, SKU first-class with
marketplace-SKU↔item mapping, HSN/SAC, opening stock, reorder alerts, weighted
average (FIFO optional), on-hand/committed/available, warehouses+transfers,
adjustments→journals, price lists, packaging auto-consumption.
5.4 Sales cycle: estimates→SO→invoice, packing slips, invoice features (line
tax/discount, doc discount, shipping, rounding, PDF templates, partial payments,
write-off, void via reversal), recurring+retainers, reminders, credit notes,
payments received (full/partial/bulk/advance/gateway), B2B customer portal.
Marketplace sales post through §7 but produce the same class of ledger entries.
5.5 Purchases: PO→bill, receive items, line taxes incl. reverse charge,
recurring, landed cost, vendor credits/payments/advances, expenses (quick,
recurring, mileage, billable).
5.6 Banking: bank/card/cash accounts, CSV/OFX/QIF import with remembered
mappings, rules engine, matching (incl. Meesho payout deposits ↔ settlement
batches), reconciliation with closing-balance check, transfers.
5.7 Projects & time (lower priority; schedule late or drop via GAP_ANALYSIS).
5.8 Taxes: pluggable engine; India GST pack built fully (GSTIN validation,
place of supply CGST/SGST vs IGST, HSN/SAC, GSTR-1 incl. e-commerce sections,
GSTR-3B, GST-TCS credit ledger per marketplace, income-tax TDS ledger,
e-invoicing via provider interface, composition flag). Never hardcode rates.
5.9 Reporting: framework first (ranges, comparisons, filters, drill-down,
accrual/cash, PDF/XLSX/CSV, scheduling, saved customizations); financial + AR/AP
+ sales/purchases by customer/item/channel + inventory + GST + audit reports;
dashboard with seller KPIs.
5.10 Automation & platform: workflow rules, email/PDF templates, custom fields,
documents inbox, public REST API + webhooks, per-module import/export + full
backup.

## 6. Meesho — PRESERVE
MEESHO_RULES.md is law; its regression tests (with sample files as fixtures)
stay green forever; file formats keep working byte-for-byte; accounting adapts
to Meesho rules, not vice versa; when the double-entry core lands, existing
reconciled data back-fills into the ledger without changing user-visible numbers.

## 7. Meesho — ENHANCE
1. Order-to-books automation (sale entry, COGS, inventory, buyer-state GST
   split; idempotent; lifecycle-driven correcting entries).
2. Settlement reconciliation 2.0 (every deduction type to its own configurable
   account; expected-vs-settled per order; exceptions queue; payout↔bank match).
3. Returns/RTO & claims engine (restock vs quarantine, credit notes with GST,
   claims tracker with compensation posting).
4. True per-order/SKU profitability (after deductions, COGS, packaging, ads).
5. Seller dashboard (orders, settlement aging, deduction breakdown, return %,
   margin trend, TCS/TDS credits, velocity-driven low-stock).
6. Marketplace pack framework (Meesho = first pack behind a clean interface;
   multi-account support).
7. Format resilience (versioned parsers, graceful unknown-format handling,
   column-mapping UI fallback).

## 8. Default phase plan (adjust in GAP_ANALYSIS.md)
P0 audit → P1 accounting core → P2 contacts+items+SKU map → P3 sales cycle +
back-fill → P4 purchases → P5 banking → P6 reporting → P7 GST pack →
P8 Meesho enhancement suite → P9 profitability + pack framework →
P10 automation/API → P11 projects & time (or drop) → P12 hardening.

## 9. Definition of done (per feature)
Migrations + models/services + API + UI + validations + verified journal
postings + tests (unit, invariants, Meesho regressions green) + feature flag +
seed data + a paragraph in docs/PROGRESS.md.

## 10. Never do
Copy competitor code/text/assets · floats for money · edit/delete posted rows ·
cross-tenant queries · duplicates on re-import · break MEESHO_RULES.md without
written approval · hardcode statutory rates · big-bang rewrites · leave main broken.

## 11. Session ritual
Start: read CLAUDE.md, docs/PROGRESS.md, current phase here. End: small logical
commits; update PROGRESS.md and REMOVALS.md.
