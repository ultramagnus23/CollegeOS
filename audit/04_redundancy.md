# audit/04_redundancy.md — Redundancy Quantification (numbers)

## Duplicated code
Command: `npx jscpd src backend/src scraper --min-lines 8`.
- **Overall: 2.78%** — 3,034 duplicated lines, 205 clones, across 495 files. Low.
- Scraper-specific: the `scraper/sources/*.py` fetch→parse→upsert skeleton recurs (cricos↔sise, ipeds↔scorecard, ipeds_aux↔usnews) — the base-class-collapse candidate, but individually 27–36-line blocks.
- Frontend cluster: masters-vs-undergrad parallel (`mastersProfile.ts`↔`profile.ts` 48L, `MastersLayout`↔`DashboardLayout` 42L+27L, `ALevelOnboarding`↔`IBOnboarding` 54L).

## Dead code
- **Unused TS exports:** 226 (`ts-prune -p tsconfig.app.json | grep -v '(used in module)' | wc -l`); ≈180 genuine after discounting barrel re-exports in `src/contracts/index.ts`.
- **Unused frontend deps:** 0 (`depcheck`; the 5 devDep hits are config-loaded false positives).
- **Python dead code:** 6 items at 90% confidence (`vulture scraper ml --min-confidence 90`); **36 unused imports** (`ruff … --select F401`, all auto-fixable).
- **Dead endpoints:** not fully enumerated (bare-name grep over-counts); 36 route files, ~37 mounts, none unmounted at app level. Flagged for per-route confirmation in Phase 6.
- **Estimated total dead lines:** ~180 export-guarded symbols + 36 import lines + 6 py defs + the dead-tuple `college_majors`/`college_programs` (data, not code). Order of magnitude: **low hundreds of lines of code** — code is not the redundancy problem.

## Redundant data
- **Tables with zero code references:** **21 / 123** (`rg -c` per table). Caveat: ~4 are populated + RPC/view-consumed (`institution_search_index`, `institution_aliases`, `career_outcomes_detail`, `india_admissions_profile`) → INVESTIGATE, not drop.
- **Completely empty tables (0 rows):** **49 / 123** (`select count(*)`) — 18 canonical scaffolding + 31 public.
- **Overlap-group tables beyond canonical:** ~16 legacy `public.college*` duplicating `canonical.institution*` (3 variants of the root entity alone: `colleges`, `colleges_comprehensive`, `colleges_legacy`).
- **Duplicate rows in core table:** ~397 duplicate groups / 397 extra rows in `canonical.institutions` by normalized `canonical_name`+`country_code` (caveat: some legitimate shared-name campuses).
- **Bytes in ARCHIVE-marked tables:** total DB (public+canonical) = **581 MB** (`sum(pg_total_relation_size)`). Largest archive candidates: `college_majors` **35 MB** (0 live rows, all dead tuples), `colleges_legacy` 5 MB, `college_programs` 4.7 MB, `career_outcomes_detail` 1.7 MB, `academic_outcomes` 0.8 MB ≈ **47 MB / 581 MB = 8.1%** in the five biggest legacy-dead tables; the ~42 empty scaffolding tables add only ~1–2 MB combined. A `VACUUM FULL`/archive of `college_majors` alone reclaims ~35 MB.

## Summary
The redundancy is **structural, not volumetric**: code duplication (2.78%) and dead code (low hundreds of lines) are minor. The real redundancy is the **dual data model** — ~16 legacy `public.college*` tables + ~42 empty scaffolding tables inflating the count from a ~50-table core to 123, plus ~47 MB of dead legacy data. Consolidation is a schema+backend-migration effort, not a code-deletion effort.
