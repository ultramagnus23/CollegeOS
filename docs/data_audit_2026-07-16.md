# CollegeOS Data Quality & Completeness Audit — 2026-07-16

**Scope:** `canonical.mv_college_cards` and every table that feeds it (`canonical.institutions`,
`institution_admissions`, `institution_financials`, `institution_outcomes`, `institution_campus_life`,
`institution_rankings`, `institution_programs`, `institution_deadlines`, `institution_requirements`,
`institution_identity_map`). Queried live against the production Supabase instance
(`aws-1-ap-northeast-2.pooler.supabase.com`, read-only) on 2026-07-16.

**Ground truth used:** the live DB, not the SQL dump. A `pg_dump` was taken today at 17:41:11 (412MB,
git-ignored, sitting at repo root as `supabase_dump.sql`) — it is essentially a same-day snapshot of what
was queried below, so there is no live/dump divergence to flag this time. `migrations` table shows **163**
applied rows, ahead of the 160 migration files present in the local `main` checkout (consistent with the
"branches can be ahead of local `main`" numbering gotcha already noted in `CLAUDE.md`).

---

## 0. Correction to task premises

Two claims in the audit brief do not hold against the live DB as of today and should be treated as stale,
not current fact:

- **"Cornell confirmed missing"** — false. `canonical.institutions` has `Cornell University`
  (`id=09ebd7d5-9f6e-4858-b689-bb5f52aefaca`, US, not deprecated), plus `Cornell College` (Iowa, distinct
  institution) and `Weill Medical College of Cornell University` (distinct professional school). All 50
  names on a T50 (Ivy+/T20/state-flagship) checklist resolved to a live, non-deprecated row — see §1.2.
- **"Known `institution_identity_map` NOT NULL bug"** — not reproducible as described.
  `canonical_institution_id` on that table is currently **nullable**, not `NOT NULL`
  (`information_schema.columns` confirms `is_nullable = YES`), and the table carries a `UNIQUE
  (canonical_institution_id)` constraint plus `UNIQUE (source_table, source_pk)`, not a blocking NOT NULL.
  There *is* a real, related gap — 1,370 institutions have no identity-map row at all (§3.2) — but it is a
  coverage gap, not the NOT NULL insert-failure described in the brief. Whatever fixed this (if it was a
  real bug at some point) predates this audit; I did not find a live reproduction.

Both are good news for Phase 2 scoping — one fewer schema fix is needed — but worth surfacing since acting
on stale premises would have wasted a work item.

---

## 1. Coverage overview

### 1.1 Row counts

| Table/view | Count |
|---|---|
| `canonical.institutions` (all) | 9,848 |
| `canonical.institutions` (non-deprecated, i.e. not soft-merged) | 9,566 |
| `canonical.mv_college_cards` | 9,566 |
| Legacy `public.colleges` table | 5,336 |
| US institutions (non-deprecated) | 6,342 |

By country (top entries): US 6,342, IN 504, DE 422, KR 356, FR 317, CA 273, CN 243, GB 188, JP 116, AU 84,
CH 74, IE 67, IT 59, ES 46, SE 39, BR 38, SG 30, NZ 29, NL 29, RU 28 (+ long tail).

For reference, IPEDS lists ~3,900 Title-IV-eligible 4-year US institutions and ~6,200 total (incl.
2-year/for-profit). The live 6,342 US rows are in the right order of magnitude for "all IPEDS-tracked",
not just 4-year — `institution_type` breakdown confirms this includes 1,770 "For-Profit" + 550
"for-profit" (inconsistent casing, see §3.3) rows, i.e. trade schools, nursing programs, career colleges
are mixed in with traditional 4-year universities. **The dataset is broad-but-shallow: wide institutional
coverage, thin field coverage on the institutions a user actually cares about** (see §2).

### 1.2 T50 (Ivy+/T20/state flagships) name-coverage check

Checked 50 names (all 8 Ivies, Stanford/MIT/Caltech/Duke/Northwestern/Chicago/JHU/Vanderbilt/Rice/ND/CMU,
UC Berkeley/LA/SD/Davis/Irvine/Santa Barbara, Michigan, UNC, UVA, USC, NYU, UT Austin, UW-Madison, Emory,
Georgia Tech, UIUC, BC, Tufts, Rochester, BU, Ohio State, UW, Purdue, Maryland, Wake Forest, Rutgers,
Lehigh, UGA, Pepperdine, Case Western): **0 missing.** Every one resolves to a live, non-deprecated row.

This directly overturns the brief's stated starting point ("Cornell confirmed missing... don't stop at
Cornell"). At the level of *does the row exist*, the T50 problem does not exist today. The real T50 problem
is field-level (§2) and rank-tier field coverage is actually *worse*, not better, for prestigious
institutions — see §2.2.

---

## 2. Field-level completeness

### 2.1 `mv_college_cards`, all 9,566 rows

| Field | % populated | Rows missing |
|---|---|---|
| `website` | 83.7% | ~1,559 |
| `city` | 80.1% | ~1,902 |
| `state_region` | 82.9% | ~1,635 |
| `cost_of_attendance` | 32.9% | ~6,419 |
| `graduation_rate_4yr` | 64.8% | ~3,367 |
| `employment_rate` | 64.7% | ~3,378 |
| `median_start_salary` | 55.0% | ~4,305 |
| `global_rank` | 12.6% | ~8,356 |
| `acceptance_rate` | 22.4% | ~7,423 |
| `sat_50` | 10.7% | ~8,543 |
| `act_50` | 10.0% | ~8,609 |
| `test_optional` | 6.1% | ~8,984 |
| `tuition_international` | 1.8% | ~9,392 |
| `avg_financial_aid` | 0.0% | 9,566 |
| `popularity_score` (non-zero) | 0.0% | 9,566 |

`avg_financial_aid` and non-zero `popularity_score` are effectively **dead columns live** — every single
row is null/zero. `tuition_international` is close to dead (1.8%).

### 2.2 Same fields, restricted to the 400 highest-ranked institutions (`global_rank` ascending)

This is the cohort Phase 2 is meant to target, so it's the number that matters most:

| Field | % populated (top 400) | vs. all rows |
|---|---|---|
| `acceptance_rate` | 16.5% | worse than the 22.4% baseline |
| `sat_50` | 0.8% | far worse than 10.7% baseline |
| `tuition_international` | 0.3% | far worse than 1.8% baseline |
| `cost_of_attendance` | 2.0% | far worse than 32.9% baseline |
| `graduation_rate_4yr` | 17.8% | far worse than 64.8% baseline |

**This is the headline finding.** The institutions ranked highest (mostly non-US, QS/global-ranking driven —
only 1,210 of 9,566 rows have a `global_rank` at all, and the ranking source skews non-US) have *worse*
field coverage than the dataset average, because the only real bulk data feed that exists
(`refreshScorecard.js` → US College Scorecard API, per [[scraper_and_search_status.md]]) only writes
US institutions. Restricting to **US-only** institutions instead:

| Field | % populated (US only, n=6,342) |
|---|---|
| `acceptance_rate` | 31.0% |
| `sat_50` | 16.2% |
| `graduation_rate_4yr` | 95.6% |
| `tuition_international` | 2.6% (expected — this column is specifically the *international* tuition rate) |

US institutions are meaningfully more complete on outcomes (95.6% grad-rate) but still thin on
admissions stats (acceptance rate only 31%, SAT only 16%) — Scorecard doesn't carry every field CollegeOS
wants, and the highest-profile schools (which draw the most Scorecard *and* admissions-detail traffic in
the product) are not disproportionately better-covered than a random US institution.

### 2.3 Detail tables (feed `mv_college_cards` and the extended detail view)

| Table | Rows | Distinct institutions covered |
|---|---|---|
| `institution_admissions` | 8,275 | — |
| `institution_financials` | 11,908 | — |
| `institution_outcomes` | 12,246 | — |
| `institution_programs` | 107,659 | 6,328 |
| `institution_rankings` | 4,721 | 2,491 |
| `institution_deadlines` | **253** | — |
| `institution_requirements` | **268** | — |

Deadlines and requirements are the worst gaps by a wide margin — 253 and 268 rows respectively against
9,566 institutions (~2.6%/2.8% coverage). This matches [[project_collegeos.md]]'s standing note that
`institution_deadlines`/`institution_requirements` need dedicated scrapers and Scorecard doesn't touch them.
Restricted to the top-400-by-rank cohort specifically: only **58 of 400** have any deadline row, and only
**83 of 400** have any program row (avg 41.1 programs among those 83) — i.e. even the "important" colleges
are mostly missing the fields a student filling out an application actually needs (deadlines, majors
offered).

---

## 3. Data integrity issues

### 3.1 True duplicates (same `canonical_name` **and** same `country_code`, both non-deprecated)

**71 duplicate groups, 74 extra rows** (i.e. 74 rows that should be merged away). Spot-checked to rule out
false positives from same-name-different-institution (e.g. "Holy Cross College" exists legitimately in
IE/NZ/US — that's 3 distinct real institutions, correctly *not* flagged since country differs). The 71
confirmed same-country groups include: `York University` (CA, 2 rows — one has `city=Toronto`, the other
`city=NULL`, same institution), plus a long tail of German (28 groups: Leipzig, Münster, Kiel, Göttingen,
Tübingen, Heidelberg, Bonn, Hamburg, Freiburg, Würzburg, Mainz, Konstanz, Jena, Rostock, Greifswald, Bochum,
Düsseldorf, Mannheim, Lübeck, Marburg, Potsdam, Chemnitz…), Korean (23 groups: Sungkyunkwan, Ewha, Hanyang,
Sogang, Chung-Ang, Pusan National, Kyungpook National…), UK (12: Aberdeen, Surrey, Bournemouth, Cranfield,
Heriot-Watt, Birkbeck, Nottingham Trent, Oxford Brookes, Middlesex, Manchester Metropolitan, Liverpool John
Moores, Plymouth, Greenwich), and Canadian (13: Carleton, Guelph, Sherbrooke, Simon Fraser, Laval, Brock,
Windsor, Regina, New Brunswick, Memorial, Lakehead, Wilfrid Laurier, ÉTS) institutions. This looks like the
non-US enrichment pass (mentioned in `CLAUDE.md`'s merge-report note, migration 132) ran a partial dedup
that missed a second wave — 282 institutions are already correctly soft-marked
`deprecated_duplicate_of` (and excluded from `mv_college_cards` since migration 146), so the merge
machinery exists and works; these 71 groups are what it didn't catch.

`acceptance_rate = 0`: only 6 rows (not a systematic placeholder pattern). `acceptance_rate = 1` (100%):
264 rows, spot-checked — these are legitimately open-admission institutions (community colleges, nursing
programs, career/technical centers, e.g. "Chamberlain University-Louisiana", "Texas County Technical
College") consistent with real Scorecard data, **not** a null-as-zero/hundred placeholder bug.
`tuition_international = 0`: **0 rows** — no null-as-zero conflation found there either. Overall: no
evidence of the "placeholder/garbage value" failure mode the brief anticipated; the real integrity problem
is the duplicate-institution one above, not fabricated-looking sentinel values.

### 3.2 `institution_identity_map` gaps

Superseding the brief's "known NOT NULL bug" premise (see §0): the map table has 8,332 rows against 9,566
non-deprecated institutions. **1,370 institutions (14.3%) have no identity-map row at all.** This is a real
gap that will affect any code path keying off `institution_identity_map` (e.g. legacy-ID bridging noted in
[[project_collegeos.md]] — "always use `source_pk`/`institution_id`, never `legacy_id`, since `legacy_id`
is 0% populated DB-wide"). Whether this blocks the add-college flow specifically needs a runtime check
against `Application.resolveCollegeId()`, not just a schema check — flagging as unverified rather than
guessing.

### 3.3 Minor: `institution_type` inconsistent casing

`institution_type` has both `Public`/`public` (1,139 + 890 rows), `Private`/`private` (1,132 + 769),
`For-Profit`/`for-profit` (1,770 + 550), plus a separate unrelated `university`/`institute` categorization
(3,145 + 39) and 132 NULLs. Two different taxonomies are stored in the same column depending on source —
low severity (cosmetic/filter-correctness, not blocking), but worth a normalization pass if `institution_type`
is ever used as a user-facing filter.

### 3.4 Dump vs. live

No divergence — the dump was generated today, same session. Not a live concern this cycle, but the
existing guidance in [[project_collegeos.md]] ("always re-check live, never trust a stale dump for canonical
detail-table counts") stands for next time.

---

## 4. Severity ranking

**Critical (blocks Phase 2 seeding or user-facing correctness directly):**
1. **Top-ranked/prestige institutions have the worst field coverage in the dataset** (§2.2) — exactly
   inverted from what a "top 300–400" seed effort needs. Any Phase 2 target list drawn from `global_rank`
   will start from ~1–2% coverage on tuition/SAT/COA, not a high base. Scope Phase 2 sourcing accordingly
   (Common Data Set / institution sites, since Scorecard won't help here — it's US-only and these are
   mostly non-US-ranked entries).
2. **Deadlines (253 rows) and requirements (268 rows) coverage is near-zero even for top-400 institutions**
   (58/400 and effectively the same order for requirements) — this is the field a student most needs at
   decision time and it's the thinnest in the whole schema.
3. **`avg_financial_aid` and non-zero `popularity_score` are 100% null/zero dataset-wide** — these are
   either dead columns that should be dropped from the card contract, or a completely unfed pipeline;
   worth a product decision before Phase 2 tries to backfill them for 300–400 rows only to leave the other
   9,000+ inconsistent.

**High (real but scoped/contained):**
4. 71 duplicate-institution groups (74 extra rows), concentrated in DE/KR/GB/CA non-US enrichment —
   affects search/dedup UX (a user searching "Heidelberg University" sees 2 cards) but is a bounded,
   listable fix (ids captured above), not a systemic corruption.
5. 1,370 institutions with no `institution_identity_map` row (§3.2) — needs a runtime check (not just
   schema) to confirm actual add-college-flow impact before treating as a hard blocker.

**Low (cosmetic, no user-facing correctness impact found):**
6. `institution_type` casing/taxonomy inconsistency (§3.3).
7. No placeholder/garbage-value pattern found in acceptance_rate or tuition — the brief's anticipated
   failure mode didn't materialize on inspection; not an issue to spend Phase 2 time on.

**Not an issue (brief premises that didn't hold, see §0):** Cornell/T50 "missing" institutions, and the
`institution_identity_map` NOT NULL bug as originally described.

---

## What Phase 2 needs to decide before starting

- **Target-list ranking source**: `global_rank` in the live data is not reliably US-News/CDS-comparable
  (only 1,210 of 9,566 rows have any rank, sourced from a mixed QS/NIRF/other set per
  [[scraper_and_search_status.md]]) — Phase 2 will need to define its own defensible 300–400 list rather
  than trusting the existing `global_rank` column, exactly as the brief already anticipated.
- **Sourcing plan for tuition/SAT/COA on non-US "top" institutions**: Scorecard (the only working bulk
  feed) is US-only, so getting the highest-value cohort (§2.2) to 100% will be manual/CDS/institution-site
  sourcing per-row, not a rerun of an existing script.
- **Financial-aid/popularity fields**: decide whether these are in scope for the "material fields" list at
  all, given they're structurally empty across the whole table, not just the target cohort.

Awaiting review of this report before starting Phase 2 (target list, seed script, identity-map coverage
fix, or any writes to the live DB).
