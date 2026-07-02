# STACK — Tulmin (Book module focus)

> Phase 0 deliverable of `CLAUDE_UPGRADE_SPEC.md`. Companion docs:
> `MEESHO_RULES.md` (crown jewels), `GAP_ANALYSIS.md`, `AUDIT.md` (earlier
> full audit), `ARCHITECTURE.md` (target architecture, strangler-fig plan).

## Languages & frameworks
- **TypeScript (strict)** everywhere; **Next.js 16 App Router** (webpack dev), React 18.
- UI: Tailwind CSS + small shadcn-style primitives (`src/book/components/ui.tsx`),
  framer-motion, lucide-react, recharts, sonner (toasts).
- The repo hosts TWO products: the Tulmin label tool (marketing + dispatch) and
  **Tulmin Book** (`src/app/book/**` + `src/book/**`) — this spec targets Book.
  A sibling standalone copy lives at `../meeshoprofit` (mirror of Book; changes
  are manually synced; it has its own vitest suite + sample-file scripts).

## Data & tenancy
- **Supabase Postgres + RLS + Auth** (`@supabase/ssr`, browser client in
  `src/lib/supabase/browser-client.ts`; service-role admin in `server-admin.ts`).
- Book domain state: **one `V2State` JSON blob per user** — localStorage cache
  (`meeshoprofit:v2state`; SKU map in its own `meeshoprofit:skumap` key) with a
  **debounced (~1.2 s) whole-blob upsert** to `public.book_state`
  (migration 017; RLS by `auth.uid()`). No login wall — value-first; sign-in is
  prompted at save time. Tenancy is therefore **per-user**, not per-org (gap).
- **New accounting core (already live, migrations 018–019):** per-org tenancy
  (`organizations`, `organization_members` + role enum) and an **immutable
  double-entry ledger** (`accounts`, `accounting_periods`, `journal_entries`,
  `journal_lines`) with DB-enforced balancing (deferrable trigger),
  one-side-per-line CHECK, posted-row immutability triggers, org-scoped RLS,
  seeded COA, and transactional RPCs `ensure_org` / `post_journal_entry`
  (idempotent on `external_id`).

## Money representation
- Engine + UI: **JS `number` rounded to 2 dp** (`round2`, `MONEY_EPSILON=0.005`).
  ⚠ Deviation from spec §3.4 ("money is never a float") — flagged in
  GAP_ANALYSIS; DB ledger already uses `numeric(14,2)`. INR-only assumptions.

## Background jobs / queue
- **None.** All computation is synchronous in the browser (pure engine funcs).
  `/api/categorize` (Claude Haiku) is the only server compute for Book.

## Auth / billing / analytics
- Supabase Auth; Razorpay subscriptions + usage credits (`src/app/api/billing/**`);
  PostHog. Admin panel under `/admin` (separate host routing via `src/proxy.ts`).

## Testing
- **vitest** (`vitest.config.ts`, alias `@ → ./src`), tests in
  `src/book/lib/**/*.test.ts`. `npm test` = `vitest run`. 42+ tests: double-entry
  core, posting rules, aging, trial-balance parity, and the reconciliation
  characterization suite. **Always run from the SUBHAN repo root** (running from
  the parent INVENTORY dir picks up the sibling repo's failing suites).
- Typecheck: `npx tsc --noEmit -p tsconfig.json`. Lint: `npx eslint <files>`.

## Build / run / deploy
- Dev: `npm run dev:localhost` (or preview launch config `tulmin-dev`, port 3000).
- Build: `npm run build`; Android via Capacitor (`android:sync`, static export).
- Deploy: hosting watches **`main`** on GitHub (`subhanpasha999s-sudo/SUBHAN`);
  no CI files in repo. Working branch: `merge/tulmin-book` (promote by
  fast-forwarding `main`). DB migrations are applied with a direct pg client
  using `SUPABASE_DB_PASSWORD` from `.env.local` (no Supabase CLI installed).

## Conventions & gotchas
- Pure calculation engine in `src/book/lib/engine/**` (no React/IO imports);
  state + derivations in `src/book/lib/v2/**` (store.tsx = context provider with
  action guards + audit); accounting core primitives in `src/book/lib/core/**`.
- RBAC 3 layers: RLS → action `guard()` in store → `rbac.ts` section/nav gating.
- File parsing is fully client-side (PapaParse/SheetJS/pdfjs/tesseract).
- Meesho headers drift between exports — extend `headerMatcher.ts` variant
  tables, never match raw strings (see MEESHO_RULES.md §2).
- localStorage quota exhaustion is surfaced via a `persistError` banner; cloud
  row is the durable copy when signed in.
