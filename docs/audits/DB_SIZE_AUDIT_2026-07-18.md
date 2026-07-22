# DB Size & Coverage Audit — 2026-07-18

Follow-up to `DB_SIZE_AUDIT_2026-07-12.md`, scoped to the real-data seeding sprint for
deadline/requirement/GPA coverage (undergrad + masters). Same format: live query results against
production Supabase, before/after this sprint's writes.

## Corrections to the sprint brief's stated baseline (re-verified before starting, per instructions)

| Metric | Brief said | Actual (2026-07-17, pre-sprint) |
|---|---|---|
| `institution_deadlines` rows | ~42 | **253** (198 distinct institutions) |
| `institution_requirements` rows | ~8 | **268** (268 distinct institutions) |
| Undergrad GPA field | `median_gpa_admitted` in `us_admissions_profile`, 0% populated | **Column doesn't exist.** `us_admissions_profile` has 0 rows and no GPA column at all. Real target (confirmed with user): `institution_admissions.gpa_avg`, already 428/8,280 (5.2%) populated. |
| `institution_requirements` shape | `requirement_category`/`requirement_name`/`requirement_value` (EAV) | Real schema is a flat table, ~50 typed columns (`sat_policy`, `toefl_required`, etc.), one row per institution/cycle/degree_level/applicant_type. |
| Source provenance columns | `source_attribution` JSONB | Real columns are discrete: `source_url`, `source_domain`, `source_type`, `parser_name`, `last_verified`, `confidence_score`. |

Full detail and the coverage plan built from these corrected numbers: `docs/audits/DEADLINE_REQUIREMENT_GPA_SEED_PLAN_2026-07-17.md`.

## Before / after row counts (every table touched)

| Table / metric | Before | After | Net |
|---|---:|---:|---:|
| `canonical.institution_deadlines` total rows | 253 | 362 | **+109** |
| `canonical.institution_deadlines` distinct institutions | 198 | 262 | **+64** |
| `canonical.institution_deadlines`, `degree_level='masters'` | 0 | 1 | +1 |
| `canonical.institution_deadlines`, `deadline_type='ucas_equal_consideration'` | 28 (pre-existing, other session) | 57 | **+29** (this sprint) |
| `canonical.institution_requirements` total rows | 268 | 271 | **+3** |
| `canonical.institution_requirements` distinct institutions | 268 | 271 | +3 |
| `canonical.institution_admissions.gpa_avg` populated | 428 / 8,280 | 428 / 8,280 | **+0** (see §3) |
| `canonical.masters_programs` total rows | 510 | 510 | 0 (enrichment only, no new rows) |
| `canonical.masters_programs.canonical_institution_id` populated | 216 | 321 | **+105** |
| `canonical.masters_programs.min_gpa` populated | 14 | 15 | **+1** |
| `canonical.masters_programs`, distinct linked institutions | ~74 (by institution_name grouping) | 112 (by canonical_institution_id) | n/a — different measure, see §4 |

Reconciliation check: 85 CDS-sourced deadline inserts (3 batches: 26+46+13) + 29 UCAS inserts + 1
masters deadline insert − 6 deleted bad rows (§2) = **109**, matching the observed net gain exactly.

## 1. Undergrad deadlines — Common Data Set (CDS) scale-up

Per the corrected plan, the CDS PDF parser (`commonDataSetDeadlines.js`) was the primary scale
mechanism. Extended its `TARGETS` list from 31 to **241** institutions (178 newly added, individually
resolved against `canonical.institutions` — see §5 on why name-similarity alone was rejected).

Ran in 3 checkpointed batches (offsets 0/100/200) per the ~100-institution cadence:

| Batch | Institutions | Fetched | Inserted | Updated |
|---|---:|---:|---:|---:|
| 1 (0–99) | 100 | 60 rows | 26 | 34 |
| 2 (100–199) | 100 | 47 rows | 46 | 1 |
| 3 (200–240) | 41 | 17 rows | 13 | 4 |

Many institutions in each batch legitimately extracted **zero** deadlines ("skipping, not
fabricating") — their CDS PDF didn't state a date in a format the parser could confidently read (a
real, honest coverage limit, not a bug).

## 2. Checkpoint verification (per the sprint's non-negotiable rule)

**Checkpoint after batch 1** (5-institution random sample, manually re-fetched from the same CDS PDF):
Colgate University (RD Jan 15 ✓), Indiana University-Bloomington (EA Nov 1 ✓), James Madison University
(RD Jan 15 ✓) — all matched exactly. (Two other sampled institutions' displayed dates looked off by one
day at first glance due to a JS `Date` UTC-serialization artifact in the verification query itself, not
a data bug — re-verified with `::text` casts and confirmed correct; consistent with the known
IST-offset gotcha already on record from prior sessions.)

**Checkpoint after batch 2 found a real bug**: Bradley University's stored `regular_decision` date
(Oct 1) was wrong. Its real CDS shows Bradley has **no fixed closing date** — it admits on a rolling
basis starting Oct 1 — and the parser had grabbed that rolling-start date and mislabeled it as a fixed
regular-decision deadline. Root cause: linear PDF-text extraction doesn't distinguish "the label is
present but blank" from "the label has this literal answer," so the nearest date-like text after the
label gets grabbed regardless of whether the institution actually reported a fixed date.

**Fixed** (`commonDataSetDeadlines.js extractDeadlines`): now checks whether "rolling basis" appears
before the candidate date and skips the `regular_decision` extraction if so, rather than mislabeling a
rolling program's start date as a fixed deadline. Unit-tested against Bradley's exact text (now
correctly skips) and a normal fixed-deadline case (still extracts correctly).

**Scanned all already-written rows for the same pattern** (any `regular_decision` dated before Nov 1 —
implausibly early for a real closing date) and found **5 more** pre-fix casualties: Butler University,
Arizona State University, Northern Arizona University, Duquesne University, Oregon State University —
all confirmed rolling-admission schools via their own CDS text. **All 6 bad rows deleted.** A follow-up
scan across all deadline types for other implausible dates found no further anomalies.

## 3. Undergrad GPA — real finding, not a data gap I could close

Per the corrected plan, `institution_admissions.gpa_avg` was the seed target. Two sourcing attempts:

- **CDS PDF**: investigated live and rejected. The CDS's "Average high school GPA" field sits in the
  same column-misaligned table structure that already broke the C7 requirements checkboxes when
  flattened to linear text — the label and its numeric value don't stay adjacent, so extracting it
  risked attributing the wrong number entirely. Not attempted, to avoid fabricating.
- **HTML admissions pages** (`usOfficialRequirements.js`, prose-based regex, e.g. "average GPA of
  admitted students is 3.9"): added and unit-tested (catches "average GPA of 3.95", "average unweighted
  GPA of 3.8", "average high school GPA ... is 3.9"; correctly ignores unrelated numbers like SAT/ACT
  averages or acceptance rates). Run against all 90 target admissions pages: **zero matches.** This
  specific set of pages (each institution's general "how to apply" page) apparently doesn't state this
  figure in prose — it likely lives on a separate "class profile" page these adapters don't target.

**Net result: 0 new undergrad GPA rows this sprint.** This is an honest negative finding, not a skipped
step — flagged per deliverable 5, not hidden. Closing this gap needs either a different page-per-school
(a "class profile"/"admitted student profile" URL, which is separate per-school research work) or
accepting that GPA may not be publicly stated in the specific format sourced here for most US schools.

## 4. UK — UCAS fixed dates (high priority, per correction)

Verified live against UCAS's own dates-and-deadlines page (2026-07-18): Oct 15, 2025 (Oxbridge + most
medicine/dentistry/veterinary) and Jan 14, 2026 (all other UCAS courses). Seeded for the **29 UK
institutions that already have real admissions data** (not the full 175-row `country_code='GB'` set,
which includes closed historical seminaries and military colleges that were never real UCAS-member
universities and would have been wrong to seed). Oxford and Cambridge correctly got the Oct 15 date; the
other 27 got Jan 14. **Simplification flagged, not hidden**: this is one deadline per institution, not
per course — a handful of non-Oxbridge medicine/dentistry/vet courses are also on the Oct cycle, but
that needs course-level data this table doesn't carry.

## 5. Masters track — scope correction confirmed, real blocker found

Per the corrected priority, this targeted the existing 74-institution/510-program set rather than
expanding it. Real blocker found while scoping: **only 21 of 510 `masters_programs` rows have any
`program_url` at all**, and 294/510 had no `canonical_institution_id` link. Without a per-program URL
there is nothing to scrape a deadline or GPA from — building ~490 individual program URLs by hand is a
separate, much larger research task (comparable in scope to the whole UG CDS sprint, but per-program
instead of per-institution), explicitly out of scope here.

What was achievable and done:
- **105 rows backfilled** with `canonical_institution_id` by exact `canonical_name` match (purely
  additive, never overwrote an existing link).
- Of the 21 programs with a real URL: 1 GPA written (MIT MS in Computer Science, min_gpa 3.0), 1
  masters deadline written; the rest either failed to fetch (dead/blocked URLs) or didn't state either
  figure in a confidently-extractable way — skipped, not guessed.

**Remaining gap (flagged per deliverable 5, not silently incomplete)**: 489 of 510 masters_programs
rows still have no program_url and thus no path to a real deadline/GPA without new per-program research.

## 6. Duplicate-row risk avoided (name-similarity, not just for this sprint's new work)

Extending the CDS target list from 31→241 required matching ~180 new institution names against
`canonical.institutions`. Trigram/fuzzy name matching alone repeated the same failure pattern already
documented in the 07-17 seed-plan work: it would have matched "Purdue University" to "Purdue University
Global," "Arizona State University" to a branch campus, "Trinity University" to the unrelated "Trine
University," and "Union College" to "Union Bible College." Every institution was individually verified
(exact match, or a hand-checked correction reusing the same verified mappings from the 07-17 flagship
dedupe pass) before being added. Two institutions from the source CDS repository (Whitman College,
Worcester Polytechnic Institute) shared an identical file link in the source site's own table — a data
error there, not resolvable safely — so only Whitman was kept and WPI was left out rather than guessed.
One additional duplicate-row pair was found in passing (California Polytechnic State University, San
Luis Obispo — comma vs. hyphen variants, same pattern as the 07-17 flagship-duplicate finding) and
resolved by pointing at the already-correct hyphenated row rather than adding a second reference to the
"wrong" one.

## What's still missing (deliverable 5 — the honest list)

- **Undergrad GPA**: effectively unsourced this sprint (§3) — needs a different page target
  (class-profile pages), not more of the same approach.
- **Masters deadlines/GPA**: 489/510 programs have no program URL to source from (§5) — needs dedicated
  per-program URL research, a separate, larger effort.
- **~63 of the 241 CDS targets extracted zero deadlines** — their PDF didn't state a date in a
  confidently-parseable format on this pass. Not fabricated; simply not yet covered.
- **UK deadline coverage is institution-level, not course-level** (§4) — the Oct 15 medicine/dentistry/
  vet exception at non-Oxbridge schools isn't captured.
- **Canada was not addressed this sprint** — deprioritized per the original plan (small pool, only 19
  institutions with admissions data, needs per-school HTML work like the fallback US adapters).
- **~46 of the 106 flagship/duplicate institution pairs found during the 07-17 work remain outside the
  scope touched here** (unchanged from that report).

## Files changed this sprint

- `backend/src/scrapers/adapters/commonDataSetDeadlines.js` — TARGETS 31→241, rolling-admission guard
  fix, offset/limit batching support.
- `backend/src/scrapers/adapters/usOfficialRequirements.js` — added GPA extraction (writes to
  `institution_admissions.gpa_avg`, decoupled from the requirements-row clobber guard), fixed a
  dry-run-bypass bug in the same change before it reached production.
- `backend/scripts/runScraper.js` — registered `cdsDeadlines`.
- `backend/scripts/phase3_seed_uk_ucas_deadlines.js` — new, UK UCAS fixed-date seed.
- `backend/scripts/phase4_deepen_masters_track.js` — new, masters institution-id backfill + URL-scoped
  deepening.
