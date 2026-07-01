# Tulmin Book — Proposed Target Architecture & Roadmap

> Companion to `docs/AUDIT.md`. This is a **proposal for confirmation**, not an
> implementation. No feature code has been written.

---

## 0. The One Decision That Gates Everything

The current model stores the entire domain as a **single JSON blob per user**
and computes the ledger/reports **in the browser**. That is the root blocker for
a Zoho-class, multi-tenant accounting SaaS (see AUDIT §5). Everything below
assumes we move to a **relational, server-side, per-organization model with a
stored immutable ledger**. This is a foundational change and I want your
explicit sign-off on the approach before any code.

**Recommended approach: strangler-fig migration, not a rewrite.**
Keep the pure `engine/**` calculation code (reconciliation, GST, stock, COGS) —
it is the moat and is already side-effect-free. Replace only the **storage and
posting layer** underneath it, module by module, behind stable interfaces. The
existing UI keeps working against a repository facade while the backing store
moves from "the blob" to Postgres tables.

I need your call on three forks before Phase 1 (details in §4).

---

## 1. Module Boundaries

Adopt the brief's boundaries, mapped onto the existing tree so we refactor rather
than relocate wholesale:

| Module | New home | Seeded from today's code |
|---|---|---|
| `core/` (double-entry engine) | `src/book/lib/core/**` + DB tables | `engine/accounting.ts`, `reportDerived.ts` |
| `sales/` | `src/book/lib/sales/**` | `customers`, `invoices` |
| `purchases/` | `src/book/lib/purchases/**` | `purchases`, `vendors`, `BillForm` |
| `inventory/` | `src/book/lib/inventory/**` | `engine/stock.ts/inventory.ts`, `skus`, `ledger` |
| `banking/` | `src/book/lib/banking/**` | `engine/bankParse.ts/bankCategorize.ts`, `bankTxns` |
| `tax/` | `src/book/lib/tax/**` | `engine/gst.ts` |
| `ecommerce/` **[PROTECT]** | `src/book/lib/ecommerce/**` | `engine/reconcile.ts/classify.ts` + recon derivations |
| `reports/` | `src/book/lib/reports/**` | `reportDerived.ts` |
| `platform/` | `src/book/lib/platform/**` + DB | `rbac.ts`, `audit`, Supabase auth |

Each module exposes a **repository interface** (`get/list/post`) so UI never
touches the store shape directly. This is what lets us swap the blob for tables
incrementally.

## 2. Data / Persistence Model (target)

- **Tenancy:** `organizations` + `organization_members(user_id, org_id, role)`.
  Every domain row carries `org_id`; **RLS scopes by org membership**, not
  `auth.uid()`. This enables shared books + real RBAC.
- **Immutable ledger (the heart):**
  - `accounts` (Chart of Accounts, per-org, templated defaults + custom)
  - `journal_entries` (header: date, memo, source_type, source_id, period_id, posted_at, reversed_by)
  - `journal_lines` (entry_id, account_id, debit, credit) — **DB constraint / trigger enforces Σdebit = Σcredit per entry**
  - `accounting_periods` (fiscal year, open/closed, lock date)
  - Corrections via **reversing entries**, never edits/deletes → audit-grade.
- **Documents** (`invoices`, `bills`, `purchase_orders`, `credit_notes`,
  `payments`, `expenses`) are business records that **post** journal entries;
  the entry is the money-of-record.
- **E-commerce:** `marketplace_orders`, `payment_events`, `settlements`,
  `payouts` as tables; the reconciliation engine reads/writes these and posts to
  the ledger via the same `core` posting API as every other module.
- **Migration:** additive migrations only. A one-time importer reads each
  existing `book_state` blob and writes normalized rows under a new org
  (idempotent, re-runnable). The blob remains the source of truth until each
  module is cut over.

## 3. Non-Negotiable Design Rules (how we enforce them)

- **Double-entry integrity** → enforced in the DB (balanced-entry constraint) +
  a single `postJournal()` service every module must call. No money movement
  bypasses it.
- **Multi-tenant isolation** → `org_id` on every table + RLS policies keyed to
  `organization_members`; tested with cross-tenant negative tests.
- **Immutable audit trail** → posted entries are append-only; reversals + an
  `audit_log` table (who/what/when) written server-side.
- **Idempotent integrations** → keep file-hash + `eventDedupeKey`; add a
  `sync_cursor` / natural-key upsert per connector so re-runs never duplicate.

## 4. Decisions (confirmed with product owner, 2026-07-01)

1. **Storage:** ✅ **Strangler-fig migration to Postgres.** Keep the pure
   `engine/**` calc code; move storage + the ledger to relational tables
   incrementally behind repository interfaces. (Not a rewrite; not staying on the blob.)
2. **Tenancy:** ✅ **Per-organization.** `organizations` + `organization_members(user_id, org_id, role)`;
   every table scoped by `org_id` via RLS.
3. **Inventory valuation of record:** ✅ **Weighted-average** (keep existing,
   document it); FIFO deferred as a later opt-in.

Still-standing assumptions (flag if wrong): India/GST is the tax target;
financial statements remain labelled "internal-use, not GAAP/IFRS-certified".

## 5. Phased Roadmap (one checkpoint each; stop + demo between)

- **Phase 1 — Core ledger foundation.** Postgres `accounts / journal_entries /
  journal_lines / accounting_periods`; `postJournal()` service; balanced-entry
  constraint; manual JE UI; Trial Balance from the **stored** ledger. Port
  `buildGlEntries` output to post real entries. *Exit: ledger balances to zero;
  trial balance matches today's derived numbers.*
- **Phase 2 — Re-wire e-commerce recon onto the ledger [PROTECT].** First write
  **characterization tests** capturing current reconciliation + GL numbers, then
  route auto-posting through `postJournal()`. *Exit: golden numbers unchanged.*
- **Phase 3 — Sales & receivables.** Customers, quotes→invoice, invoices
  (recurring/partial), credit notes, receipts + allocation, AR aging.
- **Phase 4 — Purchases & payables.** Vendors, POs, bills→payments, expenses,
  vendor credits, recurring bills, AP aging.
- **Phase 5 — Inventory.** Item master, valuation of record, warehouses, adjustments,
  reorder; keep e-com stock draw-down.
- **Phase 6 — Banking & unified reconciliation.** Accounts, import, rules,
  payout→orders→fees→net→bank tie-out as one flow.
- **Phase 7 — Tax / GST.** CGST/SGST/IGST, HSN/SAC + rate master, place-of-supply,
  GSTR-1 / GSTR-3B export, TDS/TCS reports, e-invoice/e-way schema hooks.
- **Phase 8 — Reports & dashboards.** P&L, Balance Sheet, Cash Flow, AR/AP aging,
  tax reports, marketplace profitability & per-SKU margin, KPI dashboard.
- **Phase 9 — Platform hardening.** Org RBAC end-to-end, immutable audit, API +
  webhooks, settings (numbering series, invoice branding), notifications.

## 6. Guardrails Throughout

- **Never break recon.** Characterization tests (Phase 2) stay green forever.
- **Migrations, not destruction.** Additive only; blob → tables via idempotent importer.
- **Tests on money math.** Ledger balancing, tax, reconciliation matching each get unit tests; "ledger nets to zero" is a CI invariant.
- **Single source for shared Book code.** Resolve the Tulmin `src/book/**` vs
  standalone `meeshoprofit` duplication (extract a shared package) before it
  compounds across nine phases.
