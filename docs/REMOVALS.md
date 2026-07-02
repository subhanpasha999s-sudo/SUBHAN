# REMOVALS

Log of removals under spec §2 authority: what / why / commit / how to restore.

| Date | What | Why | Commit | Restore |
|---|---|---|---|---|
| 2026-07-02 | **Scope**: Projects & time (spec §5.7) dropped from the roadmap | Meesho sellers don't bill hours; zero existing code; gap analysis recommends dropping | (roadmap only — no code removed) | Re-add as a phase in GAP_ANALYSIS.md if the operator asks |

Pending candidates (not yet acted on — see GAP_ANALYSIS.md):
- `engine/index.ts:computeMonth` MVP pipeline (verify unreferenced, then delete).
- Legacy `IGNORED` bank-txn status → migrate to `EXCLUDED`.
- Dual-maintained Book copy in `../meeshoprofit` → freeze as archive (needs
  operator confirmation; currently simply not being updated).
