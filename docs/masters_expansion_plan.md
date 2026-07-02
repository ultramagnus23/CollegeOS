# Masters Program Data — Gap Analysis & Expansion Plan

Status date: 2026-07-01. Scope: LIST A (masters PROGRAM/institution-side variables).
Every claim below traces to a file actually read for this plan:
`backend/migrations/120_masters_track_foundation.sql`, `121_masters_scrape_log.sql`,
`124_masters_profile_budget.sql`, `125_masters_mv_funding_columns.sql`,
`126_masters_programs_denorm_dedup.sql`, `127_expanded_data_variables.sql`,
`backend/src/services/masters/*.js`, `backend/src/routes/masters.js`,
`scraper/masters/*`, `scraper/sources/masters_enrichment.py`.
Highest existing migration is `129_seed_global_enrichment.sql` — new migrations proposed here start at **130**.

## 0. Headline finding

Migration `127_expanded_data_variables.sql` already added the *majority* of LIST A's
raw columns directly onto `canonical.masters_programs` (section G) and a second
pathways table `canonical.masters_pathways` (section H) with a richer taxonomy
(`gre_waived, research, work_experience, publication, faculty_sponsorship,
diversity, interview, holistic, fast_track, other`) than the original
`canonical.masters_program_pathways` from migration 120 (`standard_test_based,
test_waived_holistic, work_experience_substitution, portfolio_based,
bridge_certificate, conditional_admission, executive_part_time,
direct_entry_no_test`).

**None of these 127-added columns, and neither the new `masters_pathways` table nor
its taxonomy, are read or written anywhere in `backend/src/services/masters/*.js`,
`backend/src/routes/masters.js`, or `canonical.mv_masters_program_cards`.** The MV
was last rebuilt in migration 125 (funding availability/assistantship columns only)
and does not expose any 127 column. `scraper/sources/masters_enrichment.py` is the
only code that reads/writes several of the 127 columns (`acceptance_rate,
avg_gpa, avg_gre_quant, funding_availability, ta_available, ra_available,
median_stipend_usd, full_funding_probability, median_salary_post, tuition_total,
program_length_months, is_stem_designated, opt_eligible, stem_opt_eligible,
admission_difficulty, funding_attractiveness, roi_score`), but only as an
enrichment pass over rows already populated by some other, unidentified process —
there is no scraper or importer in this repo that actually populates
`acceptance_rate`, `avg_gre_verbal/quant/awa`, `avg_gmat`, `avg_work_exp_years`,
`avg_publications`, `avg_research_years`, `cohort_size`, `yield_rate`,
`graduation_rate`, `attrition_rate`, `placement_rate`, `phd_placement_pct`,
`faculty_placement_pct`, `h1b_sponsorship_rate`, `research_areas`,
`research_groups`, `faculty_research_count`, `open_positions`,
`industry_collaborations`, or `annual_grants_usd`. These columns exist in the
schema but have no writer and no reader today — dead columns, not live data.

There are also **two parallel, non-interoperating pathway systems**:
`canonical.masters_program_pathways` (mig 120, populated by
`scraper/masters/normalizers/pathway_taxonomy.py` + Excel loader, and consumed by
`mastersProgramService.js` / `mastersChancingService.js`) and
`canonical.masters_pathways` (mig 127, unused by any code). This must be resolved
(merge or deprecate one) before building further on pathways.

## 1. Gap analysis by LIST A field group

### Admissions (cohort size, yield, avg GPA/GRE/GMAT/TOEFL/IELTS, avg work/research exp, min/recommended requirements, LOR/SOP/CV)

| Field | Status |
|---|---|
| `min_gpa`, `min_gpa_scale`, `min_toefl`, `min_ielts` | EXISTS — `canonical.masters_programs.min_gpa/min_gpa_scale/min_toefl/min_ielts` (mig 120). Scraped by `scraper/masters/extractors/program_requirements_extractor.py` (GPA only) and loaded via `scraper/masters/pipelines/excel_loader.py`. Exposed in `mastersProgramService.getProgramDetail`. |
| `gre_requirement`, `gmat_requirement` (required/optional/waived/not_accepted) | EXISTS — same table/mig. Scraped by `program_requirements_extractor.py` (`_classify_test`). Exposed via API and used by `mastersChancingService.buildChecklist`. |
| `cohort_size`, `yield_rate`, `acceptance_rate` | PARTIAL — columns exist (`masters_programs.cohort_size/yield_rate/acceptance_rate`, mig 127) but **no scraper/importer populates them** and no service/route reads them. |
| `avg_gpa`, `avg_gre_verbal`, `avg_gre_quant`, `avg_gre_awa`, `avg_gmat` | PARTIAL — columns exist (mig 127). `masters_enrichment.py` reads `avg_gpa`/`avg_gre_quant` as *inputs* to derived scores but does not populate them from a real source. No writer exists. |
| `avg_work_exp_years`, `avg_research_years`, `avg_publications` | MISSING as populated data — columns exist (mig 127) but no scraper, importer, or service touches them. |
| `lor_count`, `sop_required`, `cv_required`, `interview_required` | PARTIAL — columns exist on `masters_programs` (mig 127: `lor_count`, `sop_required`, `cv_required`, `interview_required`); separately `masters_program_pathways` predates these with per-pathway `min_requirements` JSONB (mig 120). Neither is populated by any scraper; `interview_required` also exists redundantly. |

### Pathways (GRE-waived, research, work-experience, publication, faculty-sponsorship, diversity, interview, holistic, fast-track — each with confidence, evidence count, source, date)

| Field | Status |
|---|---|
| Pathway taxonomy v1 (`masters_program_pathways`, mig 120): `standard_test_based, test_waived_holistic, work_experience_substitution, portfolio_based, bridge_certificate, conditional_admission, executive_part_time, direct_entry_no_test` with `confidence NUMERIC, weighted_fields JSONB, min_requirements JSONB, source_url, scraped_at` | EXISTS and LIVE — populated by `scraper/masters/normalizers/pathway_taxonomy.py` (`classify_pathways`, regex/phrase signal matching over scraped admissions text) and `excel_loader.py` (`normalize_pathway_row`). Read by `mastersProgramService.getProgramDetail`/`getChancingInputs` and used by `mastersChancingService.assessPathway`. No `evidence_count` column — confidence is a single float, not count-of-signals-plus-count. |
| Pathway taxonomy v2 (`masters_pathways`, mig 127): exact LIST A vocabulary — `gre_waived, research, work_experience, publication, faculty_sponsorship, diversity, interview, holistic, fast_track, other`, with `confidence TEXT (confirmed/likely/speculative)`, `evidence_count INTEGER`, `source TEXT`, `source_date DATE` | EXISTS in schema, matches LIST A's own vocabulary and has `evidence_count`/`source`/`source_date` fields LIST A asks for — but **completely unused**: no scraper writes to it, no service reads it, no route exposes it. This is the better-shaped table for LIST A's pathway requirement but is dead. |

Recommendation: LIST A's pathway ask (confidence + evidence_count + source + date) maps cleanly onto `masters_pathways` (127), not `masters_program_pathways` (120). Migrating the taxonomy engine to write into 127's table (or adding `evidence_count`/`source_date` to 120's table and dropping 127's duplicate) is the single highest-leverage schema fix available before any new migration.

### Research (labs, faculty count, publications/year, grants, industry collaboration, open positions, research areas)

| Field | Status |
|---|---|
| `faculty_research_count`, `research_areas`, `research_groups`, `open_positions`, `industry_collaborations`, `annual_grants_usd` | PARTIAL — all columns exist on `canonical.masters_programs` (mig 127) but have zero writers anywhere in `scraper/`, `scraper/masters/`, or `scrapers/`. No "labs" concept exists at all (no `labs` column, no child table). |

### Funding (TA/RA/GA %, fellowships, scholarships, tuition waivers, avg/median stipend, funding probability, full-funding probability)

| Field | Status |
|---|---|
| `funding_availability`, `assistantship_types` (JSONB e.g. `["TA","RA"]`), `tuition_waiver_available` | EXISTS and LIVE — mig 120/125, in the MV, exposed via `GET /api/masters/funding` and `GET /api/masters/programs/:id`. |
| `ta_available`, `ra_available`, `ga_available`, `fellowship_available` (booleans, separate from the JSONB list) | PARTIAL — added redundantly in mig 127 alongside `assistantship_types`; not populated by any scraper except read (not written) by `masters_enrichment.py`. Two overlapping representations of the same fact (JSONB list vs. 4 booleans) — needs reconciliation, not more columns. |
| `avg_stipend_usd`, `median_stipend_usd`, `funding_probability`, `full_funding_probability` | PARTIAL — columns exist (mig 127); `masters_enrichment.py` reads `median_stipend_usd`/`full_funding_probability` as inputs to `funding_attractiveness` but nothing populates them from a real source. |

### Outcomes (graduation rate, attrition, time-to-degree, placement rate, median salary, salary distribution, top employers, PhD placement, faculty placement, startup outcomes)

| Field | Status |
|---|---|
| `median_earnings`, `median_debt`, `roi_source` | EXISTS and PARTIALLY LIVE — mig 120, in MV, populated for programs joined to an institution by `scraper/masters/sources/outcomes_normalizer.py` via BLS OEWS median wage by CIP→SOC crosswalk (a real public source, explicitly designed to return `None` rather than fabricate when no CIP/SOC mapping exists). This is the one outcome field with a real, working, non-fabricating pipeline — but it is institution/field-level (BLS), not program-level, and the normalizer's DB-write step is left as an unwired integration point (`# left as integration points` in `masters_ingestion_pipeline.py`-style comment) — confirm whether it has actually been run in production. |
| `graduation_rate`, `attrition_rate`, `time_to_degree_months`, `placement_rate`, `salary_25th`, `salary_75th`, `phd_placement_pct`, `faculty_placement_pct`, `startup_outcomes_pct`, `top_employers_masters` | MISSING as populated data — columns exist (mig 127) with no scraper/importer anywhere in the repo. |

### Immigration (OPT, STEM OPT, visa support, PR pathways, sponsorship rate)

| Field | Status |
|---|---|
| `is_stem_designated` | EXISTS and LIVE — mig 120; `program_requirements_extractor.py` detects it from page text (keyword match), `masters_enrichment.py` also infers it from CIP prefix / program-name keywords (`STEM_CIP_PREFIXES`, `STEM_KEYWORDS`) as a fallback (`COALESCE` — never overwrites a scraped value). |
| `opt_eligible`, `stem_opt_eligible` | EXISTS and LIVE (derived) — mig 127; `masters_enrichment.compute` sets both deterministically: US programs get `opt_eligible=True`, `stem_opt_eligible = is_stem_designated`. Non-US programs get `(None, None)` — explicitly not fabricated. This is a real rule, not a guess, since US OPT eligibility is a matter of law tied to degree + country, not an estimate. |
| `visa_support_provided`, `h1b_sponsorship_rate`, `pr_pathway_info` | MISSING as populated data — columns exist (mig 127); no scraper/importer populates them. `h1b_sponsorship_rate` in particular would need a real public source (e.g. USCIS H-1B disclosure data by employer, not by program) to avoid fabrication — see Section 3. |

### Derived scores (admission difficulty, funding difficulty, academic difficulty, career outcome score, research fit, funding attractiveness, ROI, overall utility)

Covered in Section 3 below (all derived scores discussed together per the brief).

## 2. Phased migration plan (130+)

Given how much schema migration 127 already added, the plan below is deliberately
**not** "add more columns" first — it prioritizes wiring what exists, fixing the
pathway duplication, and only then adding genuinely missing structure.

**130_masters_pathways_consolidation.sql** — Resolve the two pathway tables. Either
(a) add `evidence_count INTEGER`, `source_date DATE` to `masters_program_pathways`
and re-point `masters_pathways`'s FK-dependents (none exist today) to it, then drop
`canonical.masters_pathways`; or (b) migrate `pathway_taxonomy.py`'s output schema
to target `masters_pathways`'s LIST-A-aligned vocabulary and drop
`masters_program_pathways`. Recommend (b) since `masters_pathways`'s vocabulary and
column set already matches LIST A exactly — the migration is a `INSERT INTO
masters_pathways SELECT ...` backfill from the 120 table's rows, mapped through a
static pathway-type lookup table (`standard_test_based`→drop/no-op,
`test_waived_holistic`→`gre_waived`+`holistic`, `work_experience_substitution`→
`work_experience`, `portfolio_based`→`other`, `bridge_certificate`→`other`,
`conditional_admission`→`other`, `executive_part_time`→`other`,
`direct_entry_no_test`→`gre_waived`), then drop `masters_program_pathways` and its
FK from `masters_admission_datapoints`-adjacent code paths once the service layer
is repointed. This is a data-model decision for CT, not a mechanical one — flagged
here rather than silently picked.

**131_masters_mv_expanded_columns.sql** — Rebuild `canonical.mv_masters_program_cards`
(`DROP MATERIALIZED VIEW ... CASCADE; CREATE MATERIALIZED VIEW ...`, same pattern as
mig 125) to add the already-existing-but-unexposed mig 127 columns needed for card
display: `acceptance_rate, cohort_size, avg_gpa, avg_gre_verbal, avg_gre_quant,
avg_gmat, ta_available, ra_available, ga_available, fellowship_available,
avg_stipend_usd, median_stipend_usd, funding_probability, full_funding_probability,
graduation_rate, placement_rate, phd_placement_pct, opt_eligible,
stem_opt_eligible, admission_difficulty, funding_attractiveness,
career_outcome_score, research_fit_score, roi_score`. Purely additive to the view
definition — no new tables, no new base columns. This unblocks the service layer
(`mastersProgramService.js`'s `CARD_COLUMNS`) from ever using these fields.

**132_masters_program_evidence_log.sql** — Add a lightweight per-field provenance
table `canonical.masters_program_field_evidence (id UUID PK, masters_program_id
UUID FK, field_name TEXT, value TEXT, source TEXT, source_url TEXT,
confidence NUMERIC(3,2), observed_at TIMESTAMPTZ)`. Needed because right now
`data_source`/`data_quality_score`/`last_scraped_at` are single program-level
columns — there is no way to say "acceptance_rate came from GradCafe N=40,
median_earnings came from BLS OEWS 2024" simultaneously for the same row. This
generalizes the pattern `outcomes_normalizer.py` already half-implements
(`confidence_tier` per source) into a queryable table instead of an ad hoc dataclass.

**133_masters_research_profile.sql** — Given research fields are 100% unpopulated
today, defer new columns until a scraper exists (see Section 3's scraping-feasibility
notes below); this migration is a placeholder to add `research_areas`/`research_groups`
child-table normalization (`canonical.masters_research_areas(id, masters_program_id,
area_name, source)`) *if and only if* a lab/faculty scraper is greenlit — do not run
this migration speculatively.

## 3. What can be scraped today vs. needs new work

| Can be scraped/populated today | File | Cannot be populated without new work |
|---|---|---|
| `gre_requirement`, `gmat_requirement` (required/optional/waived) | `scraper/masters/extractors/program_requirements_extractor.py` (`_classify_test`) | `cohort_size`, `yield_rate`, `acceptance_rate` — need a source; IPEDS grad-level completions exist federally but per-program (not per-institution) acceptance data generally is not public for masters programs. |
| `min_gpa` (bounded 0–4.3 sanity check) | same file (`_GPA_RE`) | `avg_gre_verbal/quant/awa`, `avg_gmat`, `avg_work_exp_years`, `avg_publications`, `avg_research_years` — GradCafe self-reports could feed these (the `masters_admission_datapoints` table from mig 120 already exists for exactly this), but no GradCafe scraper exists in this repo today. |
| `is_stem_designated` (keyword + DHS CIP-prefix heuristic) | `program_requirements_extractor.py` + `scraper/sources/masters_enrichment.py` (`STEM_CIP_PREFIXES`, `STEM_KEYWORDS`) | `visa_support_provided`, `pr_pathway_info` — genuinely need per-institution international-office page scraping; not started. |
| `opt_eligible`, `stem_opt_eligible` (deterministic legal rule, not a guess) | `scraper/sources/masters_enrichment.py` (`infer_opt_eligible`) | `h1b_sponsorship_rate` — would require USCIS H-1B LCA disclosure data joined by employer name to "hires new grads from program X", which is not a solved join anywhere in this codebase; flag as needing a new data source decision, not a quick scraper. |
| Pathway classification from admissions-page free text | `scraper/masters/normalizers/pathway_taxonomy.py` (`classify_pathways`) | `research_areas`, `research_groups`, `faculty_research_count`, `open_positions`, `industry_collaborations`, `annual_grants_usd` — would need per-department/lab page scraping; zero scaffolding exists (no adapter, no extractor) for this content type today. |
| `funding_availability`, `assistantship_types`, `tuition_waiver_available` | Excel bulk import (`scraper/masters/pipelines/excel_loader.py`) — dataset-dependent, not live-scraped from program pages | `graduation_rate`, `attrition_rate`, `time_to_degree_months`, `placement_rate`, `phd_placement_pct`, `faculty_placement_pct`, `startup_outcomes_pct`, `top_employers_masters` — IPEDS has *institution-level* undergrad-heavy completion/outcomes data; masters-program-level completion/placement is not systematically public. No scraper exists. |
| `median_earnings` via BLS OEWS CIP→SOC crosswalk (institution/field level, real source, returns `None` rather than guessing) | `scraper/masters/sources/outcomes_normalizer.py` | Program-specific (not field-average) salary, salary distribution (`salary_25th/75th`) — BLS OEWS gives one median per occupation, not a distribution per program; would need Scorecard-style program-level earnings data, which does not exist for masters the way it does for undergrad (Scorecard `institution_outcomes` is undergrad-focused per this repo's mig 011/045). |

## 4. Derived-score computation plan (policy: never show synthetic numbers)

All formulas below are the ones actually implemented in
`scraper/sources/masters_enrichment.py` unless marked "not implemented."

- **admission_difficulty** (0–100, higher = harder) — IMPLEMENTED
  (`compute_admission_difficulty`). Baseline 50; if `acceptance_rate` present,
  replaces baseline with `100 * (1 - acceptance_rate**0.4)` clamped 5–95; adds
  `(avg_gpa - 3.0) * 15` if GPA present; adds `(avg_gre_quant - 155) * 1.5` if GRE
  present. **Caveat**: because `acceptance_rate`/`avg_gpa`/`avg_gre_quant` have no
  populating source today (Section 1), this formula runs but produces a value
  derived purely from the 50-point baseline plus whatever partial inputs exist —
  effectively a near-constant placeholder for the vast majority of rows right now.
  Do not surface this score to users until at least `acceptance_rate` or
  `avg_gre_quant` has a real writer (GradCafe scrape, per Section 3); until then it
  should read "insufficient data" rather than a number close to 50.

- **funding_attractiveness** (0–100) — IMPLEMENTED (`compute_funding_attractiveness`).
  `funding_availability` categorical (+60/+30/-20), `+10` if `ta_available`, `+15`
  if `ra_available`, `+min(20, stipend/1500)`, `+full_funding_probability*0.3`.
  Same caveat: `ta_available`/`ra_available`/`median_stipend_usd`/
  `full_funding_probability` have no populating source; only `funding_availability`
  (from Excel import) is real today, so this score currently reduces to
  `{60, 30, -20, 0}` bucketed on one categorical field, not a true composite.

- **roi_score** (0–100, scaled) — IMPLEMENTED (`compute_roi`). Real formula:
  `(median_salary - annualized_tuition) / annualized_tuition * 100`, scaled `/5`
  and clamped 0–100; returns `None` (no fabrication) when any input is missing.
  `median_salary_post` has no populating source (Section 1), so this returns `None`
  for essentially all rows until either BLS OEWS program-level normalization is
  actually wired into `median_salary_post` or a real program-level salary source
  is found. `tuition_total` and `program_length_months` are real (Excel import).

- **career_outcome_score**, **research_fit_score** — NOT IMPLEMENTED anywhere.
  Columns exist (mig 127) but no formula exists in any file read for this plan.
  Proposed plain-terms formulas, both explicitly gated on real inputs:
  - `career_outcome_score` = weighted average of `placement_rate`,
    `median_salary_post` (normalized against field/CIP peer median), and
    `phd_placement_pct`/`faculty_placement_pct` where relevant to the applicant's
    stated goal. **Cannot be computed today** — none of `placement_rate`,
    `phd_placement_pct`, `faculty_placement_pct` have data. Show
    "insufficient data" state, not a number, until a real outcomes source is wired.
  - `research_fit_score` = requires knowing the program's `research_areas` and
    matching against an applicant's stated interests — but `research_areas` is an
    empty JSONB column with no writer. **Cannot be computed at all** without a
    lab/faculty scraper. Do not implement a placeholder score.

- **funding_difficulty**, **academic_difficulty** (mentioned in LIST A but note:
  `academic_difficulty` as a column name exists only on `canonical.institution_outcomes`,
  the *undergrad* table, per mig 127 section D — there is no `academic_difficulty`
  column on `masters_programs`). If a masters-level academic_difficulty is wanted,
  it needs a new column; propose folding it into `admission_difficulty` rather than
  duplicating, since no additional real signal (e.g. course rigor) exists to
  differentiate them today.

- **overall_utility** — NOT IMPLEMENTED, no column exists on `masters_programs` at
  all (checked mig 120/124/125/126/127). Any such composite would necessarily
  average the above scores, most of which are themselves unavailable — do not
  build this until at least 3 of the 5 constituent scores have real, populated
  inputs. Recommend explicitly deferring this metric and tracking it as blocked
  in the phased migration plan rather than adding a column now.

**Policy compliance note**: every one of the three implemented scores above
already follows the "never fabricate" rule correctly at the code level (uses
`COALESCE`/`None`-propagation, never invents a missing input) — the actual risk is
not the formulas themselves but presenting a nearly-constant-baseline score (e.g.
`admission_difficulty ≈ 50 ± small terms`) to a user as if it reflects rich data,
when in reality 3 of its 3 usual inputs are unpopulated. The fix is a
`data_quality_score`-gated display rule ("show `admission_difficulty` only if
`acceptance_rate IS NOT NULL OR avg_gre_quant IS NOT NULL`"), not a schema change.
