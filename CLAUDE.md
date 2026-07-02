# CLAUDE.md — Tulmin repo orientation

Two products share this repo: the **Tulmin label tool** (marketing site +
dispatch app) and **Tulmin Book** (accounting for Meesho sellers) under
`src/app/book/**` + `src/book/**`. The accounting-platform upgrade is governed
by `CLAUDE_UPGRADE_SPEC.md` — read it plus `docs/PROGRESS.md` at session start.

## Commands
- **Dev**: `npm run dev:localhost` (port 3000; preview launch config `tulmin-dev`).
  First compile of a route takes 10–20 s — wait before judging a blank page.
- **Tests**: `npm test` (vitest). ⚠ Run from THIS repo root, not the parent
  INVENTORY dir (the parent picks up the sibling repo's failing suites).
- **Typecheck**: `npx tsc --noEmit -p tsconfig.json` · **Lint**: `npx eslint <files>`
- **Build**: `npm run build` · Android: `npm run android:sync`
- **DB migrations**: files in `supabase/migrations/`; apply with a direct `pg`
  client using `SUPABASE_DB_PASSWORD` from `.env.local` (no Supabase CLI). Wrap
  in BEGIN/COMMIT; verify with rolled-back probes.
- **Deploy**: hosting watches `main`. Work on `merge/tulmin-book`; promote via
  fast-forward (`git checkout main && git merge --ff-only merge/tulmin-book &&
  git push`). Commits end with the Claude co-author trailer.

## Architecture (Book)
- `src/book/lib/engine/**` — pure calculation engine (parsers, reconcile,
  classify, stock, gst, accounting COA). No React/IO imports. Meesho parsing
  rules are LAW: see `docs/MEESHO_RULES.md`; pinned by
  `engine/meesho.rules.test.ts` + `core/reconciliation.characterization.test.ts`.
- `src/book/lib/v2/**` — `V2State` (one JSON blob per user: localStorage cache
  + debounced Supabase `book_state` upsert), store.tsx context provider with
  `guard()` RBAC + audit, derived.ts projections, reportDerived.ts GL builder.
- `src/book/lib/core/**` — double-entry core: `journal.ts` (balanced-entry
  validation, reversal, `glEntryToJournal` port), `postings.ts` (domain posting
  rules), `aging.ts`, `ledgerRemote.ts` (RPC client), trialBalance parity.
- **Stored ledger (live)**: migrations 018–019 = per-org tenancy + immutable
  `journal_entries/_lines` with DB-enforced balancing/immutability/RLS + RPCs
  `ensure_org` / `post_journal_entry` (idempotent on `external_id`).
- Screens: `src/app/book/<section>/page.tsx`; register new sections in
  `v2/rbac.ts` (type + SECTION_ACCESS) AND `components/v2/Shell.tsx` nav.

## Gotchas
- Money is JS numbers @2dp in the engine (round2/MONEY_EPSILON); DB is
  numeric(14,2). Integer-paise migration is scheduled for Hardening.
- Meesho headers drift: extend variant tables in `engine/headerMatcher.ts`;
  never string-match raw headers. Header row is scanned, not positional.
- Sub Order No is a string end-to-end (`_1` suffix preserved; 18-digit ids).
- `/book/*` is NOT login-walled; the stored-ledger UI (`/book/ledger`) needs a
  Supabase session. Browser-verify via the preview tools; localStorage state
  persists across reloads.
- The sibling `../meeshoprofit` repo is a mirror of Book — currently frozen as
  archive; do not dual-maintain without operator instruction.
- Never edit posted journal rows; correct via reversal (`reverseEntry`).
- Blank `liveOrderStatus` is MEANINGFUL (null ⇒ fee/claim partition).

## Session ritual (per spec §11)
Start: read this file, `docs/PROGRESS.md`, current phase in
`CLAUDE_UPGRADE_SPEC.md`. End: small logical commits; update `docs/PROGRESS.md`
and `docs/REMOVALS.md`.
