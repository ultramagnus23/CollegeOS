# CollegeOS Data Seed — Phase 2 Summary (2026-07-17)

Follow-up to [`docs/data_audit_2026-07-16.md`](./data_audit_2026-07-16.md) (Phase 1). All work below ran
against the live production Supabase instance (read approved, then write approved per-step in chat).

## What was built

| Deliverable | Path |
|---|---|
| Target list (382 institutions) | [`data/top_colleges_target.json`](../data/top_colleges_target.json) |
| Flagship dedupe/enrich fix | [`backend/scripts/phase2_dedupe_flagships.js`](../backend/scripts/phase2_dedupe_flagships.js) |
| Same-name-same-country dedupe fix | [`backend/scripts/phase2_dedupe_same_name_same_country.js`](../backend/scripts/phase2_dedupe_same_name_same_country.js) |
| `institution_identity_map` backfill | [`backend/scripts/phase2_fix_identity_map.js`](../backend/scripts/phase2_fix_identity_map.js) |
| Scorecard seed script | [`backend/scripts/phase2_seed_target_scorecard.js`](../backend/scripts/phase2_seed_target_scorecard.js) |

All four scripts are idempotent (safe to re-run) and support `--dry-run`/`--dry`.

## 0. A bigger problem than Phase 1 caught

Building the target list surfaced something the Phase 1 audit's exact-name dedup missed: **106 US
institutions had a QS-ranked "master" row (no IPEDS id) duplicating a separate, real Scorecard-linked row
under a punctuation or naming variant** — e.g. "University of California, Berkeley" (master, empty ipeds)
vs. "University of California-Berkeley" (real row, ipeds 110635, carrying actual admissions/financial/
outcome data). This hit exactly the schools a top-300 seed cares about most: Cornell, Columbia, Georgia
Tech, all 9 UC campuses, UT Austin, Ohio State, Purdue, Penn State, Arizona State, and more.

Automated similarity matching to find the right pairing was **demonstrably unsafe on its own** — it
produced real false positives before any DB write happened: "Miami University" (Ohio) matched to
"University of Miami" (Florida) at 0.85 trigram similarity; "Purdue University" matched to "Purdue
University Global" (its online-only arm); "University of Idaho" matched to "Idaho State University" (a
different school); "Rutgers University" matched to "Rutgers University-Camden" (a branch campus, not the
flagship New Brunswick campus). Given user direction, every one of the 55 target-list schools needing this
fix was individually verified against the College Scorecard API by IPEDS UnitID and cross-checked by city
before any merge — see `phase2_dedupe_flagships.js` for the full verified pairing list and its inline
methodology notes.

**Result:** 50 merges (soft-marked `deprecated_duplicate_of`, matching the existing pattern from
migrations 132/146) + 5 direct enrichments (Northwestern, Cornell, Boston College, Idaho, UCF — no
duplicate row existed in the DB at all for these, so a verified IPEDS id was attached directly to the only
row representing them). Zero skips; all 55 resolved cleanly on the first full-verification pass.

## 1. Target list — `data/top_colleges_target.json`

**382 institutions** (323 US, 59 non-US). Methodology: a verified Ivy+/T20/state-flagship set (the T50
from Phase 1, all confirmed present) extended with widely-recognized National Universities and Liberal
Arts Colleges, plus notable non-US institutions carried in `canonical.institution_rankings` (QS/NIRF).
**Institution names only are reproduced — no proprietary ranking numbers or order from any single
publisher** (per Phase 1's finding that the DB's own `global_rank` column isn't reliable/comparable enough
to drive the list). 14 minor liberal-arts-college names failed exact match on punctuation variants and were
left out rather than risk another wrong match — logged in the generation script, not silently dropped.

## 2. Schema fixes (ran before seeding, since seeding onto the wrong row would be pointless)

- **124 total duplicate rows merged**: 50 flagship master-row/Scorecard-row pairs (§0) + 74 same-name-
  same-country pairs from the Phase 1 audit (71 groups reported there; a live re-query found 74 — the
  count grew slightly between the audit and this pass, not a discrepancy in the original finding).
  Survivor selection for the 74: whichever row in each pair had more populated core fields (city, website,
  institution_type, founded_year, non-empty external ids); ties broken deterministically on lowest id.
- **institution_identity_map**: 57 rows backfilled for target-list institutions that had none (the 5
  newly-enriched flagships + 52 non-US institutions, mostly ones never routed through the
  migration-079 staging-match pipeline). Marked honestly as `source_tier='inferred_generated'` /
  `match_method='canonical_self_backfill'` — not claimed as a real external source match. Scoped to the
  target list only; the dataset-wide gap (1,370 institutions per Phase 1) is unaddressed outside this list.
- `canonical.mv_college_cards` refreshed after each schema-fix pass.

## 3. Data seed — College Scorecard

Reused the existing, already-verified `refreshScorecard.js` field mapping and upsert logic (kept the
production script untouched; `phase2_seed_target_scorecard.js` scopes the *same* logic to exactly the
target list instead of the rolling "oldest N of ~6,300" cycle). Ran in 7 batches of ≤50 through the live
API: **321 of 323 US institutions upserted successfully, 0 errors, 2 returned no Scorecard data** (likely
closed/renamed/non-Title-IV institutions under those IPEDS ids — not investigated further, logged not
guessed).

## 4. Before / after (target-list completeness)

| Cohort | Baseline (Phase 1, top-400-by-rank) | After Phase 2 |
|---|---|---|
| Acceptance rate | 16.5% | **96.1%** (target list), 99.7% (US-only) |
| SAT 50th percentile | 0.8% | **73.8%** (target list), 87.0% (US-only) |
| Cost of attendance | 2.0% | **84.3%** (target list), 99.4% (US-only) |
| Graduation rate (4yr) | 17.8% | **94.0%** (target list), 99.4% (US-only) |
| Median starting salary | n/a (not tracked in Phase 1 table) | 94.0% (target list), 99.4% (US-only) |

Row counts: `canonical.institutions` non-deprecated count went from 9,566 (Phase 1) to **9,442** after the
124-row merge pass (net institutions unchanged — 9,566 total rows, 124 now soft-marked as duplicates,
consistent with the dedup being additive-safe: no rows deleted, all reversible by clearing
`deprecated_duplicate_of`).

## 5. Honest list of what's still missing

- **Non-US institutions (59 in the target list) got zero uplift from this pass** — 0.0% cost-of-attendance,
  63.8% graduation rate (unchanged from whatever existing coverage they had), 75.9% acceptance rate. College
  Scorecard is US-only by design; this was flagged as expected in Phase 1 §2.2 and confirmed here, not a
  surprise. Getting these 59 to parity needs a separate non-US sourcing pass (CDS-equivalent per country,
  or institution-site scraping) — not attempted, not fabricated.
- **`avg_financial_aid` and non-zero `popularity_score`** are still 100% empty (Phase 1 flagged these as
  possibly-dead columns needing a product decision, not a data-fill task — unchanged, out of scope here).
- **Deadlines and requirements** (253/268 rows dataset-wide per Phase 1) were not touched — College
  Scorecard doesn't carry this data; a dedicated per-institution scraper is a separate effort.
- **1,370 - 57 = ~1,313 institutions dataset-wide** still have no `institution_identity_map` row (only the
  target list's 57 were fixed, by design/scope decision).
- **The other ~46 of the original 106 flagship-duplicate-row candidates** (outside the 382-institution
  target list) were left unmerged, per the scoped decision — logged as a follow-up, not silently dropped.
- 14 target-list names (minor LACs) didn't resolve and aren't in the list at all (§1).
- The 2 US institutions where Scorecard returned no data were left as-is, not guessed.

## Commits

Work is currently uncommitted in the working tree (`backend/scripts/phase2_*.js`, `data/top_colleges_target.json`,
`docs/data_audit_2026-07-16.md`, `docs/data_seed_phase2_2026-07-17.md`). Per the brief's request for
reviewable chunks, suggested commit split:
1. Phase 1 audit report (docs only, no code)
2. Schema-fix scripts + target list (`phase2_dedupe_flagships.js`, `phase2_dedupe_same_name_same_country.js`,
   `phase2_fix_identity_map.js`, `data/top_colleges_target.json`)
3. Seed script + this summary (`phase2_seed_target_scorecard.js`, this file)

Awaiting direction on whether to create these commits now.
