# Undergraduate Schema Gap Analysis

Verified against: `backend/migrations/079_migration_0_0_canonical_rebuild.sql` (base canonical
schema), `backend/migrations/127_expanded_data_variables.sql` (expanded variable set),
`backend/migrations/082_canonical_rankings_cutover.sql`, `083_rebuild_mv_college_cards.sql`,
`091_schema_gaps.sql`, `108_normalize_country_codes.sql`, `109_populate_quality_scores.sql`,
`119_institution_placements.sql`, `123_normalize_outcome_rates.sql`,
`128_seed_global_institutions.sql`, `129_seed_global_enrichment.sql`,
`src/contracts/frontendCollegeCardContract.ts`, `src/types/college.ts`. Highest migration
number found in `backend/migrations/` at time of writing: **129**.

Status legend: **Exists** = column present in schema. **Partial** = column present but
either unpopulated by any seed/scrape migration, duplicated/inconsistent, or only covers
part of the concept. **Missing** = no column anywhere in `canonical.*`.

Note on population: grepping `128_seed_global_institutions.sql` and
`129_seed_global_enrichment.sql` for the 8 derived-score column names
(`prestige_score`, `risk_score`, `student_happiness_score`, `campus_fit_score`,
`admission_difficulty`, `financial_difficulty`, `academic_difficulty`,
`career_roi_score`) returns **zero matches** — the columns exist (added in migration 127)
but are not populated by any migration currently in the repo. They are marked **Partial**
below (schema exists, data pipeline missing) rather than **Exists**.

---

## 1. Rankings, Enrollment, Endowment, Diversity, Safety, Reputation, Campus Info

| Field | Status | Table.Column | Notes |
|---|---|---|---|
| Global/national ranking (generic) | Exists | `canonical.institution_rankings.global_rank`, `.national_rank` | Multi-source table, one row per `(institution_id, ranking_year, ranking_body)`. |
| Subject ranking | Exists | `canonical.institution_rankings.subject_rank` | |
| QS ranking | Partial | `canonical.institution_rankings.ranking_body='QS'` (row-based) + `src/types/college.ts CollegeStats.rankingQs` (frontend legacy type) | Row-based not a dedicated column; scraper `scraper/sources/qs_rankings.py`, `qs_the_rankings.py` exist. |
| US News ranking | Partial | `institution_rankings` row where `ranking_body='US News'` | Scraper `scraper/sources/usnews_rankings.py` exists (per commit a946b9b). |
| THE (Times Higher Ed) ranking | Partial | `institution_rankings` row, `ranking_body='THE'` | via `qs_the_rankings.py`. |
| CWUR ranking | Partial | `institution_rankings` row | Scrapers `scraper/sources/cwur_rankings.py`, `cwur_global_seed.py` exist. |
| NIRF ranking (India) | Exists | `canonical.institution_rankings.nirf_rank` (127) + `canonical.india_admissions_profile.nirf_rank` (079) | Duplicated across two tables — drift risk. Scraper `scraper/sources/nirf.py`. |
| Niche / WSJ / Forbes / Guardian / Complete UK / Shanghai (ARWU) rank | Exists | `canonical.institution_rankings.niche_rank`, `.wsj_rank`, `.forbes_rank`, `.guardian_rank`, `.complete_uk_rank`, `.shanghai_rank` | Added in 127; no scraper/seed populates them yet. |
| Employer reputation rank | Exists (schema) / Partial (data) | `canonical.institution_rankings.employer_reputation_rank`, `canonical.institutions.employer_reputation_score` | No ingestion source wired; see ingestion plan (QS Employer Reputation indicator). |
| Academic reputation rank/score | Exists (schema) / Partial (data) | `canonical.institution_rankings.academic_reputation_rank`, `canonical.institutions.academic_reputation_score` | Same — QS/THE academic reputation survey is the real source, not yet ingested. |
| Faculty/student ratio rank, citations rank, intl student rank | Exists | `canonical.institution_rankings.faculty_student_rank`, `.citations_rank`, `.intl_student_rank` | Sub-indicators of QS methodology; unpopulated. |
| Total enrollment | Exists | `canonical.institutions.total_enrollment` | Added 127. |
| Undergraduate enrollment | Exists | `canonical.institutions.undergraduate_enrollment` | Added 127. |
| International enrollment (count & %) | Exists | `canonical.institutions.international_enrollment`, `.international_pct`; also `canonical.institution_demographics.percent_international` | Two overlapping fields (`institutions.international_pct` vs `institution_demographics.percent_international`) — pick one as source of truth. |
| Faculty count / student-faculty ratio | Exists | `canonical.institutions.faculty_count`, `.student_faculty_ratio` | Added 127. |
| Endowment | Exists | `canonical.institutions.endowment_usd` | Added 127, NUMERIC(16,0). Not populated by 128/129 seeds (not grepped but no dedicated endowment scraper found). |
| Research expenditure | Exists | `canonical.institutions.research_expenditure_usd` | Added 127; IPEDS has this (Finance survey), no scraper wired yet. |
| Diversity (ethnic distribution) | Exists | `canonical.institution_demographics.ethnic_distribution` (JSONB), `.percent_first_gen`, `.socioeconomic_index`, `.geographic_diversity_index` | IPEDS race/ethnicity fields map here. |
| Diversity score (composite) | Partial | `canonical.institutions.diversity_score` | Schema only, not computed by any migration. |
| Safety (campus safety) | Exists (schema) / Partial (data) | `canonical.institution_campus_life.campus_safety_score`, `canonical.institutions.safety_score` | Duplicated across two tables; Clery Act crime data (IPEDS/OPE Campus Safety) is the real source and is not ingested. |
| Weather score | Partial | `canonical.institutions.weather_score` | Schema only; requires NOAA/climate data source, not wired. |
| Walkability / public transport score | Partial | `canonical.institutions.walkability_score`, `.public_transport_score` | Schema only; Walk Score API or similar not integrated (no free tier confirmed). |
| Campus type (urban/suburban/rural) | Exists | `canonical.institutions.campus_type` | IPEDS `LOCALE` variable maps directly. |
| Campus size (acres) | Exists | `canonical.institutions.campus_size_acres` | Added 127; no confirmed public source in current scrapers. |
| Lat/long | Exists (duplicated) | `canonical.institutions.latitude`/`.longitude` (DOUBLE PRECISION, from 079) **and** re-added as NUMERIC(9,6) in 127 (`ADD COLUMN IF NOT EXISTS` is a no-op since column exists) | 127's redeclaration is a no-op due to `IF NOT EXISTS`; actual type stays DOUBLE PRECISION from 079. Not a real duplicate column, but worth noting in migration hygiene. |

---

## 2. Admissions

| Field | Status | Table.Column | Notes |
|---|---|---|---|
| Acceptance rate (overall) | Exists | `canonical.institution_admissions.acceptance_rate` | |
| ED / EA acceptance rate | Exists (duplicated) | `.early_decision_rate`/`.early_action_rate` (079) **and** `.ed_acceptance_rate`/`.ea_acceptance_rate` (127) | Two parallel columns for the same concept added in different migrations — needs consolidation, flagged as drift. |
| Regular decision rate | Exists | `.regular_decision_rate` | 079 only. |
| Waitlist rate | Exists | `.waitlist_rate` | |
| Transfer acceptance rate | Exists (duplicated) | `.transfer_acceptance_rate` defined in both 079 and 127 (127's `ADD COLUMN IF NOT EXISTS` is a no-op) | Not a true duplicate — same column, redundant declaration. |
| International acceptance rate | Exists (duplicated) | `.international_accept_rate` (079) vs `.international_acceptance_rate` (127) | Two distinct columns with near-identical names — pick one. |
| Yield rate | Exists (duplicated) | `.yield_rate` defined in both 079 and 127 (no-op redeclare) | |
| Applicant/admit/enrolled volume | Exists (duplicated) | `.application_volume`/`.admit_volume`/`.enrollment_volume` (079) vs `.applied_count`/`.admitted_count`/`.enrolled_count` (127) | Two parallel naming schemes — consolidate. |
| SAT 25/50/75 (composite) | Exists | `.sat_25`, `.sat_50`, `.sat_75` (079) | `mv_college_cards` exposes `sat_50` (per migration 083 required-columns check). |
| SAT total 25/75, EBRW 25/75, Math 25/75 | Exists | `.sat_total_25`, `.sat_total_75`, `.sat_ebrw_25`, `.sat_ebrw_75`, `.sat_math_25`, `.sat_math_75` (127) | `sat_total_*` duplicates `sat_25`/`sat_75` from 079 conceptually. |
| ACT 25/50/75 | Exists | `.act_25`, `.act_50`, `.act_75` (079) + `.act_25`/`.act_75` redeclared no-op in 127 | `act_50` exposed in `mv_college_cards` contract (083). |
| GPA avg / 25th / 75th / scale | Exists | `.gpa_avg`, `.gpa_25`, `.gpa_75`, `.gpa_scale` | Added 127. IPEDS does not report HS GPA; College Scorecard doesn't either — realistic source is Common Data Set (CDS) section C11, manually/semi-automatically parsed. |
| Test-optional flag | Exists | `.test_optional` (079) | Exposed in `mv_college_cards`/frontend contract. |
| Test-blind flag | Exists | `.test_blind` (127) | |
| IB requirement | Partial | `canonical.uk_admissions_profile.ib_requirements` (TEXT, UK-only) + `canonical.institution_admissions.ib_accepted` (BOOLEAN, global, 127) | No structured "min IB score" numeric field exists globally; UK-only free-text field is not comparable across countries. |
| A-level requirement | Partial | `canonical.uk_admissions_profile.a_levels_required` (BOOLEAN only) | No structured grade-requirement field (e.g., "AAA"); only a yes/no flag. |
| AP accepted | Exists | `canonical.institution_admissions.ap_accepted` | 127. |
| Essay requirement | Exists | `.essays_required`, `.essay_count` | 127. |
| Letters of recommendation | Exists | `.lor_count` | 127. |
| Interview requirement | Exists | `.interview_required` | 127. |
| Portfolio requirement | Exists | `.portfolio_required` | 127. |
| Demonstrated interest tracked | Exists | `.demonstrated_interest` | 127. |
| English proficiency (TOEFL/IELTS/Duolingo) | Exists | `.min_toefl`, `.min_ielts`, `.min_duolingo` | 127. |
| Common App supported | Exists | `canonical.us_admissions_profile.common_app_supported` | 079, US-only regional table. |
| UCAS code / required | Exists | `canonical.uk_admissions_profile.ucas_required`, `.ucas_code` | 079. |
| JEE/CUET required (India) | Exists | `canonical.india_admissions_profile.jee_required`, `.cuet_required` | 079. |
| FAFSA / CSS Profile required | Exists | `canonical.us_admissions_profile.fafsa_required`, `.css_profile_required` | 079. |
| Admission difficulty (derived) | Partial | `canonical.institution_admissions.admission_difficulty` | Column exists (127), not populated by any migration — see Derived Features Plan. |

---

## 3. Financial

| Field | Status | Table.Column | Notes |
|---|---|---|---|
| Tuition (in-state/domestic) | Exists (duplicated) | `.tuition_in_state` (079) vs `.tuition_domestic` (127) | Same concept, two column names — consolidate. |
| Tuition (out-of-state) | Exists | `.tuition_out_state` | 079. |
| Tuition (international) | Exists | `.tuition_international` | 079; exposed in `mv_college_cards`. |
| Fees | Exists | `canonical.institution_financials.fees` | 127. |
| Housing cost | Exists | `.housing_cost` | 127. |
| Meal/dining cost | Exists | `.meal_cost` | 127. |
| Books/supplies cost | Exists | `.books_cost` | 127. |
| Personal/living expenses | Exists | `.personal_expenses` | 127. |
| Health insurance cost | Exists | `.insurance_cost` | 127. |
| Cost of attendance (total) | Exists | `.cost_of_attendance` | 079; exposed in `mv_college_cards`. |
| Net price (overall) | Exists (duplicated) | `.net_price` (127) vs `.net_price_low_income`/`.net_price_mid_income`/`.net_price_high_income` (079, income-banded) | Both exist; 127's flat `net_price` and 079's income-banded fields serve different granularity — not a conflict but should be documented as complementary. |
| Average financial aid | Exists | `.avg_financial_aid` | 079; exposed in `mv_college_cards`. |
| % receiving aid | Exists | `.percent_receiving_aid` | 079. |
| Need-based aid avg | Exists | `.need_based_aid_avg` | 127. |
| Merit aid avg | Exists | `.merit_aid_avg` | 127. |
| Average scholarship | Exists | `.avg_scholarship` | 127. |
| % need met | Exists | `.pct_need_met` | 127. IPEDS does not publish this; realistic source is CDS section H2A. |
| Average debt at graduation | Exists (duplicated) | `.avg_debt` (079) vs `.avg_debt_at_graduation` (127) | Same concept, duplicate columns. College Scorecard field `GRAD_DEBT_MDN` maps here. |
| Monthly loan payment | Exists | `.monthly_loan_payment` | 127; can be derived from `avg_debt` via standard amortization, not a separately reported field. |
| Merit scholarship flag | Exists | `.merit_scholarship_flag` | 079; exposed in `mv_college_cards`/frontend contract. |
| Need-blind flag (domestic) | Exists | `.need_blind_flag` | 079; exposed in `mv_college_cards`/frontend contract. |
| Need-blind flag (international) | Exists | `.need_blind_intl` | 127. |
| No-loan policy flag | Exists | `.no_loan_policy` | 079. |
| Financial difficulty (derived) | Partial | `canonical.institution_financials.financial_difficulty` | Column exists (127), not populated. |

---

## 4. Student Life

| Field | Status | Table.Column | Notes |
|---|---|---|---|
| Housing guarantee | Partial (type conflict) | `canonical.institution_campus_life.housing_guarantee` declared as `TEXT` in 079, then `ADD COLUMN IF NOT EXISTS housing_guarantee BOOLEAN` in 127 — the second statement is a no-op since the column already exists, so the live column stays `TEXT` despite 127 intending `BOOLEAN`. | Needs a corrective migration (`ALTER COLUMN ... TYPE` or rename) to resolve the type mismatch. |
| % living on campus | Exists | `.pct_living_on_campus` | 127. |
| Dorm quality score | Exists | `.dorm_quality_score` | 127; needs a real source (e.g., Niche/student survey) — flagged in ingestion plan as no confirmed free source. |
| Dining quality score | Exists | `.dining_quality_score` | 127; same caveat as dorm quality. |
| Clubs count | Exists (duplicated) | `.club_count` (079) vs `.clubs_count` (127) | Same concept, two column names. |
| Varsity sports count / athletics division | Exists | `.varsity_sports_count` (127), `.athletics_division` (079) | |
| Greek life (flag & %) | Exists | `.greek_life`, `.greek_life_pct` | 127. |
| Mental health rating/services | Exists (duplicated) | `.mental_health_rating` (079, NUMERIC score) vs `.mental_health_services` (127, BOOLEAN flag) | Different granularity, not a true duplicate — one is a score, one is availability flag. |
| Diversity (student life angle) | Exists | `canonical.institution_demographics.ethnic_distribution`, `.percent_international` | See Section 1; no separate "diversity" field in campus_life. |
| Weather / climate | Exists | `canonical.institution_campus_life.climate_zone` (079, qualitative) + `canonical.institutions.weather_score` (127, numeric, unpopulated) | |
| Transportation (walkability/public transit) | Partial | `canonical.institutions.walkability_score`, `.public_transport_score` | Schema only, unpopulated — see Section 1. |
| Student satisfaction | Exists (schema) / Missing (real data) | `canonical.institution_campus_life.student_satisfaction_score` | No real student-survey ingestion source identified; flagged as cannot-populate-with-real-data in derived features plan. |
| Cost of living index | Exists | `canonical.institution_campus_life.cost_of_living_index` | 079; realistic source: BEA regional price parity or C2ER Cost of Living Index (paid) — no free source confirmed. |
| Workload / party score | Exists (schema) / Missing (real data) | `.workload_score`, `.party_score` | 127; no legitimate public data source — student-perception metrics with no free survey feed. |
| International-student-friendly flag | Exists | `.international_friendly` | 127; no defined methodology for what qualifies — needs product definition before it can be populated. |
| Average class size | Exists | `.avg_class_size` | 127; IPEDS "Class Size" survey component maps here. |
| Honors program | Exists | `.honors_program` | 127. |
| Study abroad | Exists | `.study_abroad` | 127 (flag only, not participation rate). |
| Co-op programs | Exists | `.co_op_programs` | 127 (flag only). |
| Research opportunities (undergrad) | Exists | `.research_opportunities` | 127 (flag only). |
| Internship support | Exists | `.internship_support` | 127 (flag only). |

---

## 5. Academics

| Field | Status | Table.Column | Notes |
|---|---|---|---|
| Majors / programs list | Exists | `canonical.institution_programs` (table: `program_name`, `degree_type`, `field_category`, `enrollment`, `acceptance_rate`) | 079. Also `scraper/ipeds/build_majors.py`, `build_college_majors.py`, `cip2020.py` map IPEDS CIP codes into this. |
| Research (undergrad) flag | Exists | `canonical.institution_campus_life.research_opportunities` | 127 (flag only, no depth/funding data). |
| Honors program | Exists | `canonical.institution_campus_life.honors_program` | 127 (flag only). |
| Internships | Exists | `canonical.institution_campus_life.internship_support` (availability) + `canonical.institution_outcomes.internship_pct`/`.internship_rate` (participation) | Both availability and participation-rate concepts covered across two tables. |
| Co-op programs | Exists | `canonical.institution_campus_life.co_op_programs` | 127 (flag only, no participation %). |
| Study abroad | Exists | `canonical.institution_campus_life.study_abroad` | 127 (flag only, no participation %). |

---

## 6. Outcomes

| Field | Status | Table.Column | Notes |
|---|---|---|---|
| Graduation rate (4yr/6yr) | Exists | `canonical.institution_outcomes.graduation_rate_4yr`, `.graduation_rate_6yr` | 079; College Scorecard field `C150_4`/`C150_L4` (or `_L4YR`). |
| Retention rate | Exists | `.retention_rate` | 079; Scorecard `RET_FT4`. |
| Employment rate (overall / 6mo / 1yr) | Exists (overlap) | `.employment_rate` (079, exposed in `mv_college_cards`), `.employment_rate_6mo`, `.employment_rate_1yr` (127) | 127 adds time-banded granularity on top of the flat 079 field. |
| Median starting salary | Exists (duplicated) | `.median_start_salary` (079, exposed in `mv_college_cards`) vs `.median_salary_1yr` (127) | Same concept, different naming across migrations. |
| Median mid-career / 5yr salary | Exists (duplicated) | `.median_mid_career_salary` (079) vs `.median_salary_5yr` (127) | Same concept, duplicate naming. |
| Salary 25th/75th percentile | Exists | `.salary_25th_1yr`, `.salary_75th_1yr` | 127. Scorecard has `MD_EARN_WNE_P10` etc. but not percentile bands by default. |
| Grad school placement rate | Exists (duplicated) | `.grad_school_rate` defined in both 079 and 127 (127 is a no-op redeclare) | |
| Internship rate | Exists (duplicated) | `.internship_rate` (079) vs `.internship_pct` (127) | Same concept, duplicate naming. |
| FAANG / top-employer placement % | Exists (schema) / Missing (real data) | `.faang_placement_pct`, `.startup_placement_pct`, `.top_employers` (JSONB) | 127; no public per-institution data source for employer-level placement — realistic only via LinkedIn alumni data scraping (not currently integrated) or self-reported career-services reports. |
| Career services ranking | Exists (schema) / Missing (real data) | `.career_services_rank` | 127; no public ranking source identified. |
| Employer reputation (survey-based) | Exists (schema) / Partial | `canonical.institutions.employer_reputation_score`, `canonical.institution_rankings.employer_reputation_rank` | Real source exists: QS Employer Reputation indicator / THE-owned Global Employability University Ranking (partially paywalled); not yet ingested by any scraper in `scraper/sources/`. |

---

## 7. Derived Features (8 required composites)

| Feature | Status | Table.Column | Notes |
|---|---|---|---|
| Admission difficulty | Partial | `canonical.institution_admissions.admission_difficulty` | Column exists (127); no populating migration/service found. |
| Financial difficulty | Partial | `canonical.institution_financials.financial_difficulty` | Column exists (127); unpopulated. |
| Academic difficulty | Partial | `canonical.institution_outcomes.academic_difficulty` | Column exists (127); unpopulated. |
| Career ROI | Partial | `canonical.institution_outcomes.career_roi_score` | Column exists (127); unpopulated. |
| Prestige score | Partial | `canonical.institutions.prestige_score` | Column exists (127); unpopulated. |
| Campus fit score | Partial | `canonical.institutions.campus_fit_score` | Column exists (127); this is inherently user-specific (depends on student preferences), so a single stored value is at best a generic proxy — see plan. |
| Happiness score | Partial (schema) / Missing (real input data) | `canonical.institutions.student_happiness_score` | Column exists (127); depends on `institution_campus_life.student_satisfaction_score`, which itself has no real survey-data source — see Derived Features Plan for explicit "cannot compute" flag. |
| Risk score | Partial | `canonical.institutions.risk_score` | Column exists (127); unpopulated. |

---

## Summary Estimate

Of the ~80 requested undergraduate variables, roughly **80–85% already have a corresponding
schema column** somewhere in `canonical.*` (many added by migration 127). However, a large
share of those are **schema-only placeholders never populated by any ingestion migration**
(all 8 derived scores, `weather_score`, `walkability_score`, `public_transport_score`,
`faang_placement_pct`, `career_services_rank`, `student_satisfaction_score`,
`workload_score`, `party_score`, `dorm_quality_score`, `dining_quality_score`,
`endowment_usd`, `research_expenditure_usd`, `campus_size_acres`). A meaningful number of
fields also exist as **duplicate/parallel columns** from the 079-vs-127 migrations
(e.g., `tuition_in_state` vs `tuition_domestic`, `avg_debt` vs `avg_debt_at_graduation`,
`median_start_salary` vs `median_salary_1yr`, `club_count` vs `clubs_count`,
`yield_rate`/`transfer_acceptance_rate` declared twice) that should be consolidated rather
than treated as fully "done." See `docs/undergrad_expansion_plan.md` for the concrete
migration and ingestion plan.
