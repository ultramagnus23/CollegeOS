# Undergraduate Data Expansion Plan

Companion to `docs/schema_gap_analysis.md`. Grounded in the verified state of
`backend/migrations/` (highest existing file: `129_seed_global_enrichment.sql`),
`scraper/` (README/pipeline-referenced tree — canonical scraper location per
`scraper/pipeline.py`), and `scrapers/` (the parallel, secondary tree — do not add new
code to `scrapers/`; use `scraper/` for any new ingestion work, per project convention).

---

## (a) Phased Migration Plan

New migrations should start at **130** and go up, following the existing
`NNN_description.sql` convention seen through `129_seed_global_enrichment.sql`. This plan
is deliberately split by concern so each migration is independently reviewable/revertable,
mirroring how 127 already grouped sections A–I internally.

### 130_consolidate_duplicate_admissions_financial_columns.sql
Purpose: resolve the 079-vs-127 duplicate-column drift identified in the gap analysis
before adding anything new, so new work doesn't compound the confusion.
- `canonical.institution_admissions`: pick one of (`early_decision_rate`/`ed_acceptance_rate`),
  (`early_action_rate`/`ea_acceptance_rate`), (`international_accept_rate`/
  `international_acceptance_rate`), (`application_volume`/`applied_count`),
  (`admit_volume`/`admitted_count`), (`enrollment_volume`/`enrolled_count`) as canonical,
  backfill the other via `UPDATE ... SET x = COALESCE(x, y)`, and add a code comment
  marking the losing column deprecated (do not drop — legacy readers may reference it).
- `canonical.institution_financials`: consolidate `tuition_in_state`/`tuition_domestic`,
  `avg_debt`/`avg_debt_at_graduation`.
- `canonical.institution_outcomes`: consolidate `employment_rate` vs
  `employment_rate_6mo`/`employment_rate_1yr` (keep both — they are different time bands,
  not true duplicates — but document the relationship), `median_start_salary` vs
  `median_salary_1yr`, `median_mid_career_salary` vs `median_salary_5yr`,
  `internship_rate` vs `internship_pct`.
- `canonical.institution_campus_life`: fix the `housing_guarantee` TEXT-vs-BOOLEAN
  conflict (079 declared TEXT, 127's `ADD COLUMN IF NOT EXISTS ... BOOLEAN` silently
  no-op'd) — add `housing_guarantee_flag BOOLEAN` derived from the TEXT values
  (`'yes'/'guaranteed'` → true) rather than risking data loss from an in-place type change;
  consolidate `club_count`/`clubs_count`.

### 131_admissions_structured_requirements.sql
Adds structured (not just boolean) admission-requirement detail that's currently
missing per the gap analysis:
- `canonical.institution_admissions`: `ib_min_score INTEGER` (0–45 scale), `ib_diploma_required BOOLEAN`.
- `canonical.uk_admissions_profile`: replace/extend the free-text `ib_requirements`
  with `a_level_grade_requirement TEXT` (e.g. `'AAA'`) and keep `a_levels_required` as
  the existence flag — the current schema only has the flag, not the actual grade bar.
- `canonical.institution_requirements` (existing generic key/value table from 079) is
  the fallback for country-specific requirement text that doesn't warrant its own column
  — document this pattern rather than adding N more one-off boolean columns per country.

### 132_reputation_and_ranking_ingestion_columns.sql
- `canonical.institution_rankings`: add `source_url TEXT`, `methodology_year INTEGER`
  (rankings already have `ranking_year`; this distinguishes the survey/methodology
  vintage from the publication year for QS/THE reputation surveys specifically).
- No brand-new columns needed for employer/academic reputation — `employer_reputation_score`,
  `employer_reputation_rank`, `academic_reputation_score`, `academic_reputation_rank`
  already exist from 127; this migration is about wiring ingestion (see section b), not schema.

### 133_endowment_research_expenditure_backfill.sql
- No new columns (`endowment_usd`, `research_expenditure_usd` already exist on
  `canonical.institutions` from 127) — this migration is a data-only backfill migration
  (`UPDATE canonical.institutions SET endowment_usd = ...`) sourced from IPEDS Finance
  survey (`F1C01` derived fields) for US institutions, executed once the IPEDS Finance
  component is added to `scraper/sources/ipeds.py` (see ingestion plan). Include a
  `source_attribution` style JSONB stamp if the team wants provenance — currently
  `institutions` has no `source_attribution` column (only `institution_admissions`,
  `institution_financials`, etc. do); add `canonical.institutions.source_attribution JSONB
  DEFAULT '{}'::jsonb` in this migration if provenance tracking at the institution level
  is wanted.

### 134_student_life_survey_flags.sql
Adds explicit "no real data" markers rather than fabricated values for the student-life
fields the gap analysis flagged as having no public source (`dorm_quality_score`,
`dining_quality_score`, `workload_score`, `party_score`, `student_satisfaction_score`):
- Add `canonical.institution_campus_life.survey_data_available BOOLEAN NOT NULL DEFAULT FALSE`
  and `survey_source TEXT` so the frontend can explicitly render "not available" instead of
  a stale/null-looking zero once a real survey vendor (e.g., a licensed Niche/CDS data feed)
  is contracted. This migration adds the *flag*, not the data.

### 135_derived_scores_provenance.sql
- Add `computed_at TIMESTAMPTZ`, `computation_version TEXT`, `computation_inputs JSONB`
  to `canonical.institutions` (for `prestige_score`, `campus_fit_score`,
  `student_happiness_score`, `risk_score`) and to `canonical.institution_admissions`
  (`admission_difficulty`), `canonical.institution_financials` (`financial_difficulty`),
  `canonical.institution_outcomes` (`academic_difficulty`, `career_roi_score`) — so that
  once a scoring service populates these NUMERIC(5,1) columns (already present since 127),
  every score is traceable to which formula version and which raw inputs produced it.
  This is schema-only; the actual scoring job is a backend service change, out of scope
  for a SQL migration and out of scope for this planning task.

### 136_rebuild_mv_college_cards_v2.sql
- Extends the required-column check in `083_rebuild_mv_college_cards.sql` and the
  `canonical.v_college_cards_extended` view from 127 into the actual materialized view
  definition, once fields from 130–135 stabilize, so `canonical.mv_college_cards` (the
  sole frontend read contract per project policy) exposes the consolidated field set
  directly instead of requiring frontend code to fall back to
  `canonical.v_college_cards_extended`. Must also update
  `src/contracts/frontendCollegeCardContract.ts` FRONTEND_COLLEGE_CARD_FIELDS array and
  `backend/src/utils/schemaContractChecker.js` in a follow-up (non-SQL) change — flagged
  here, not implemented, since this document is planning-only.

---

## (b) Ingestion Plan

| Field group | Realistic source | Integration point |
|---|---|---|
| SAT/ACT/GPA percentiles, acceptance/yield rates, test-optional flag | College Scorecard fields `SAT_AVG`, `SATVR25`/`SATVR75`, `SATMT25`/`SATMT75`, `ACTCM25`/`ACTCM75`, `ADM_RATE`, `admissions.admission_rate.overall` | `scraper/sources/scorecard.py`, `scorecard_expanded.py` (already integrated per repo). |
| IPEDS enrollment, faculty counts, student-faculty ratio, retention/graduation rates | IPEDS variables `EFTOTLT` (total enrollment), `EFUG` (undergrad enrollment), `FACSTU` (student/faculty ratio), `RET_PCF`/`RET_PCP` (retention), `GR150` (graduation rate) | `scraper/sources/ipeds.py`, `nces_ipeds.py`, `ipeds_aux.py` (already present). |
| Endowment, research expenditure | IPEDS Finance component (`F1C01` series, "endowment assets"), NSF HERD survey for research expenditure | Not currently in `scraper/sources/`; needs a new `ipeds_finance.py` source module. |
| Tuition, fees, housing, meals, books, cost of attendance, net price | College Scorecard `TUITIONFEE_IN`/`TUITIONFEE_OUT`, `COSTT4_A` (cost of attendance), `NPT4_PUB`/`NPT4_PRIV` (net price); Common Data Set section H for the income-banded net price and % need met | `scraper/sources/scorecard.py`/`scorecard_expanded.py` for the Scorecard fields; CDS parsing has no existing module — needs a new `cds_parser.py`. |
| Average debt at graduation | College Scorecard `GRAD_DEBT_MDN`, `GRAD_DEBT_MDN10YR` | `scraper/sources/scorecard.py`. |
| QS / THE / US News / CWUR / NIRF / Shanghai rankings | Existing scrapers: `scraper/sources/qs_rankings.py`, `qs_the_rankings.py`, `usnews_rankings.py`, `cwur_rankings.py`, `cwur_global_seed.py`, `nirf.py` | Already integrated; Niche/WSJ/Forbes/Guardian/Complete UK rank columns (added 127) have **no scraper yet** — need new source modules `niche_rankings.py`, `wsj_rankings.py`, `forbes_rankings.py`, `guardian_rankings.py`, `complete_uk_rankings.py` if the product wants them populated. |
| Employer reputation score/rank, academic reputation score/rank | QS World University Rankings publishes both an "Academic Reputation" and an "Employer Reputation" indicator per institution (component of overall QS score); THE also publishes a separate Global Employability University Ranking (partially subscription-gated) | Extend `scraper/sources/qs_rankings.py` (or `qs_the_rankings.py`) to also capture the sub-indicator scores, not just the composite rank — currently only the composite appears to be scraped. |
| Campus type (urban/suburban/rural), campus size | IPEDS `LOCALE` variable maps directly to campus_type; campus size in acres has **no confirmed free public per-institution source** — flag as no realistic free/public source identified unless the team wants to hand-curate from Wikidata (`scraper/sources/wikidata.py`/`wikidata_enrich.py` already pulls general facts and may have acreage for some schools). | `scraper/sources/ipeds.py` for locale; `wikidata.py`/`wikidata_enrich.py` as a best-effort supplement for acreage. |
| Diversity (ethnic distribution, first-gen %, socioeconomic index) | IPEDS Fall Enrollment survey (race/ethnicity breakdown, `EFTOTLT` and related), College Scorecard `FIRST_GEN`, `PCTPELL`/`PCTFLOAN` as socioeconomic proxies | `scraper/sources/ipeds.py`, `scorecard.py`. |
| Campus safety score | IPEDS Campus Safety and Security survey (Clery Act data, published separately by the Dept. of Education's Campus Safety and Security dataset) | No existing scraper module — needs a new `campus_safety.py` source. |
| Weather/climate score | NOAA Climate Data Online (free, public) keyed by city/lat-long already stored on `canonical.institutions` | No existing scraper module — needs new `climate_score.py`; feasible since lat/long already populated. |
| Walkability / public transport score | No realistic free/public per-institution source identified. Walk Score's public API has rate limits/paid tiers and no bulk education-sector dataset; flag as **no realistic free/public source identified** until a paid data agreement is in place. | N/A |
| Student satisfaction, dorm/dining quality, workload, party score | No realistic free/public source identified — these require a licensed student-survey dataset (e.g., Niche, Cappex, or a first-party CollegeOS survey). Per project policy, do not fabricate; migration `134_student_life_survey_flags.sql` above adds an explicit "not available" flag instead. | N/A until a survey data license or first-party survey product is built. |
| Majors/programs, honors, study abroad, co-op, research opportunities flags | IPEDS CIP-code program data via `scraper/ipeds/build_majors.py`, `build_college_majors.py`, `cip2020.py` for majors; honors/study-abroad/co-op/research-opportunity flags have no single federal source and are typically confirmed from official institution websites — realistic source is targeted official-site scraping per institution (labor-intensive), not a bulk feed. | `scraper/ipeds/*` for majors; no existing bulk source for the flag fields. |
| Employment rate, median salary bands, grad-school rate, internship rate | College Scorecard `md_earn_wne_p6`/`p10` (median earnings 6/10 yrs after entry), `grad_school`/`gt_25k_p6` style outcome fields where available | `scraper/sources/scorecard.py`, `scorecard_expanded.py`. |
| FAANG/startup placement %, top employers, career services rank | No realistic free/public per-institution source identified. LinkedIn alumni-outcome data could theoretically supply this but is not currently integrated and its bulk scraping likely violates LinkedIn's terms of service — flag as no realistic free/public source; would require either a paid LinkedIn Talent Insights agreement or institution self-reported career-services annual reports (inconsistent format, manual curation only). | N/A |
| India-specific (JEE/CUET/NIRF/reservation categories) | `scraper/indian/` tree (adapters, extractors, normalizers, parsers, pipelines, sources) already exists; `scraper/sources/india_comprehensive.py`, `nirf.py` | Already integrated. |
| Wikidata general facts (founding year, city, etc. fallback) | `scraper/sources/wikidata.py`, `wikidata_enrich.py` | Already integrated, used as fallback/enrichment per recent commit "seed 166 global institutions + full enrichment." |

Both scraper trees were inventoried per project memory: `scraper/` (canonical, referenced
by the project README and `scraper/pipeline.py`) contains all the source modules listed
above under `scraper/sources/`, plus country-specific subtrees `scraper/indian/`,
`scraper/masters/`, and IPEDS helpers under `scraper/ipeds/`. The parallel `scrapers/`
tree only contains generic adapter/scheduler/validator scaffolding
(`scrapers/adapters/base_adapter.py`, `http_adapter.py`, `scrapers/schedulers/`,
`scrapers/validators/`, `scrapers/conflict_resolution/`) and a single
`scrapers/run_deadline_refresh.py` entry point — it is not where the ranking/financial
source modules above live. New ingestion work should go into `scraper/sources/`, matching
existing convention; do not split new source modules across both trees.

---

## (c) Derived-Feature Computation Plan

All 8 columns already exist in schema (added in migration 127) but are populated by
**no migration or service currently in the repo** — this section describes the intended
formula so a future scoring service (not part of this planning task) can populate them.

1. **Admission difficulty** — `canonical.institution_admissions.admission_difficulty`
   (0–100, higher = harder). Inputs: `acceptance_rate`, `sat_total_75`/`act_75` relative
   to population percentile, `yield_rate`, `test_optional` (if optional, adjust weighting
   away from test scores). Formula sketch: weighted inverse of acceptance rate (dominant
   term) blended with normalized test-score percentile rank across all institutions.
   Computable today once `acceptance_rate` and SAT/ACT columns are populated from
   Scorecard — no missing raw data.

2. **Financial difficulty** — `canonical.institution_financials.financial_difficulty`
   (0–100, higher = harder to afford). Inputs: `net_price` (or income-banded
   `net_price_low_income`/`net_price_mid_income`), `cost_of_attendance`,
   `avg_debt_at_graduation`/`avg_debt`, `pct_need_met`, `need_blind_flag`. Formula
   sketch: normalized net-price percentile, penalized further if `need_blind_flag` is
   false or `pct_need_met` is low. Computable once net-price/cost fields are populated.

3. **Academic difficulty** — `canonical.institution_outcomes.academic_difficulty`
   (0–100). Inputs: `graduation_rate_4yr`/`retention_rate` (inverse relationship — lower
   retention can indicate either weak fit or high rigor, so this alone is a weak proxy),
   plus `institution_admissions.gpa_avg`/`sat_total_75` as a rigor proxy. **Caveat**:
   there is no direct "academic rigor" survey field in the schema; this composite is
   necessarily a proxy built from selectivity + retention, not a measured workload
   metric. Should be labeled in the UI as an estimate, not a verified rigor score.

4. **Career ROI** — `canonical.institution_outcomes.career_roi_score` (0–100). Inputs:
   `median_salary_1yr`/`median_salary_5yr` relative to `canonical.institution_financials.cost_of_attendance`
   (net cost over expected years to degree). Formula sketch: (median salary / total cost
   of attendance) normalized against the institution population, i.e. a payback-period
   style ratio. Computable once Scorecard earnings + Scorecard cost fields are populated
   for the same institution/year.

5. **Prestige score** — `canonical.institutions.prestige_score` (0–100). Inputs: blended
   `institution_rankings` rows across `ranking_body` values (QS, THE, US News, Shanghai,
   CWUR — weighted average or best-rank-wins depending on product decision), plus
   `academic_reputation_score`/`employer_reputation_score` once ingested. Computable once
   ranking ingestion (section b) is filled in; currently most ranking-body rows exist
   only for a subset of institutions (166 seeded globally per recent commit), so
   coverage — not schema — is the current limiter.

6. **Campus fit score** — `canonical.institutions.campus_fit_score` (0–100). **Flag**:
   by definition this is a *per-user* match score (student preferences × campus
   attributes), not a single institution-level constant. Storing a single
   `campus_fit_score` per institution on `canonical.institutions` can only ever be a
   generic "average fit" proxy (e.g., normalized composite of `campus_type`, climate,
   class size, extracurricular breadth) — it cannot represent true personalized fit
   without a per-user computation in the recommendation pipeline
   (`backend/src/services/recommendation/`), which already computes user-specific fit
   scores at query time per the architecture summary. Recommend NOT treating this stored
   column as the source of truth for personalized fit; keep it only as a generic,
   non-personalized proxy if the product wants a static "campus fit" badge.

7. **Happiness score** — `canonical.institutions.student_happiness_score` (0–100).
   **Cannot compute without real student survey data.** Its only legitimate input,
   `canonical.institution_campus_life.student_satisfaction_score`, has no ingestion
   source anywhere in `scraper/` or `scrapers/` — there is no free/public bulk student-satisfaction
   dataset identified (Niche/Cappex satisfaction scores are proprietary and not
   currently licensed). Per project policy against fabricated/synthetic numbers, this
   score must remain NULL and hidden from the UI until either (a) a licensed satisfaction
   survey vendor is integrated, or (b) CollegeOS builds a first-party in-app student
   survey with enough response volume per institution to be statistically meaningful.
   Migration `134_student_life_survey_flags.sql` above adds the `survey_data_available`
   flag specifically so the frontend can suppress this field honestly rather than
   showing a stale zero/null as if it were a real "low happiness" signal.

8. **Risk score** — `canonical.institutions.risk_score` (0–100, lower = lower risk).
   Inputs: financial stability proxies (`endowment_usd` relative to `total_enrollment`,
   i.e. endowment-per-student), `retention_rate` (low retention can signal institutional
   or financial distress), and — for for-profit or financially fragile institutions —
   accreditation status (`canonical.institution_metadata.accreditation` JSONB, already
   in schema from 079). Computable in a limited form once `endowment_usd` is populated
   (section b, migration 133); full risk modeling (e.g., incorporating Dept. of
   Education Financial Responsibility Composite Scores for US institutions) would need
   a new source module not currently in `scraper/sources/`.

### Summary
Of the 8 derived features, **6 are computable today or after routine ingestion work**
(admission difficulty, financial difficulty, career ROI, prestige score, and a
limited-scope risk score, plus a caveated academic-difficulty proxy). **2 have a real
data-availability blocker**: happiness score (no real satisfaction-survey source — must
not be fabricated) and campus fit score (inherently per-user; a stored institution-level
constant can only be a non-personalized proxy, not the "real" campus fit value the
product likely wants).
