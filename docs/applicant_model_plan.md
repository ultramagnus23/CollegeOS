# Masters Applicant Model — Existing State & Tiered Expansion Plan

Status date: 2026-07-01. Scope: LIST B (masters APPLICANT profile variables).
Every claim below traces to a file actually read for this plan:
`backend/migrations/120_masters_track_foundation.sql`, `124_masters_profile_budget.sql`,
`backend/src/services/masters/mastersProfileService.js`,
`backend/src/services/masters/mastersChancingService.js`, `backend/src/routes/masters.js`.
A repo-wide grep for `masters_profile` and `applicant` across `backend/migrations/`
found no separate `masters_applicant_profiles` or similar table — the applicant
table is `public.masters_profile`, a 1:1-with-user table already migrated and live.

## 1. Does an applicant-profile table already exist? Yes.

`public.masters_profile` (migration 120, extended by migration 124) is a real,
live, 1:1-with-`public.users` table. Its columns as written:

```
id, user_id,
target_degree_type (MS|MA|MBA), intended_program, intended_specialization,
gre_verbal, gre_quant, gre_awa,
gmat_total, gmat_focus_total,                    -- classic vs Focus Edition kept separate deliberately
toefl_score, ielts_score, duolingo_score, pte_score,
undergrad_gpa, undergrad_gpa_scale, undergrad_institution, undergrad_major, undergrad_country,
research_experience (free text), publication_count, work_experience_years, work_experience_desc (free text),
sop_status (not_started|drafting|reviewing|final), lors_secured, lors_required,
target_intake_term, target_intake_year, target_countries (JSONB array),
target_budget_max, target_budget_currency,        -- added in migration 124
profile_version, created_at, updated_at
```

This is CRUD-complete: `mastersProfileService.js` exposes `getProfile`/`upsertProfile`
(with an explicit `PROFILE_COLUMNS` allowlist so unknown fields can never be
persisted), and `routes/masters.js` exposes `GET/POST /api/masters/profile` with a
`sanitizeProfile()` server-side allowlist + type coercion + enum validation before
it ever reaches the service layer. `GET /api/masters/readiness` derives a
completion checklist (SOP, LORs, tests, GPA, experience) directly from this table.
Every field in LIST B's "basic profile / academic record / tests / research /
work experience" groups that has a column here is genuinely live, not aspirational.

There is no table anywhere named `masters_applicant_profiles` or similar — the
naming in LIST B ("masters APPLICANT profile") maps 1:1 onto `public.masters_profile`.

## 2. Tiered gap analysis

### TIER 1 — Required (basic profile + academic record + tests)

| LIST B field group | Status |
|---|---|
| Basic applicant profile (degree target, intended program/specialization, intake term/year, target countries, budget) | EXISTS and LIVE — `target_degree_type, intended_program, intended_specialization, target_intake_term, target_intake_year, target_countries, target_budget_max, target_budget_currency`. |
| Undergrad GPA | PARTIAL — EXISTS as a single current value (`undergrad_gpa`, `undergrad_gpa_scale`) plus `undergrad_institution/major/country`. **GPA variants, class rank, and semester-by-semester GPA are MISSING** — no columns, no child table. Only one aggregate GPA value can be stored per applicant today; there is no way to represent "3.6 major GPA vs 3.4 overall GPA" or a rising/falling trend. |
| Coursework profile (specific courses taken, grades, rigor) | MISSING entirely — no column, no child table. |
| Standardized tests (GRE/GMAT/English) | EXISTS and LIVE — `gre_verbal, gre_quant, gre_awa, gmat_total, gmat_focus_total, toefl_score, ielts_score, duolingo_score, pte_score`. This is the most complete tier-1 group in the schema. |

### TIER 2 — Strong Signal (research/work/leadership/SOP-features)

| LIST B field group | Status |
|---|---|
| Research profile (projects, outputs, publications) | PARTIAL — `research_experience` is a single free-text field and `publication_count` is a bare integer. **No structured child table** exists for individual projects/publications (title, venue, role, year, co-authors) — everything collapses into one text blob + one count. |
| Work experience | PARTIAL — `work_experience_years` (numeric) + `work_experience_desc` (single free-text field). No structured per-job history (employer, title, dates, responsibilities) — cannot distinguish "5 years at one company" from "5 short stints." |
| Technical skills | MISSING entirely — no column. |
| Leadership | MISSING entirely — no column. |
| Awards | MISSING entirely — no column. |
| Entrepreneurship | MISSING entirely — no column. |
| Extracurriculars | MISSING entirely — no column. |
| Recommendation letters | PARTIAL — only counters exist: `lors_secured` (int), `lors_required` (int). No LOR-level detail (recommender identity/role/relationship, strength signal) — that lives elsewhere in the codebase for the undergrad track (`public.recommenders`, migration 112, per `CLAUDE.md`/prior migrations) but is **not wired to the masters track at all** — `mastersProfileService.js` and `routes/masters.js` never reference `recommenders`. |
| SOP feature extraction (career clarity score, research clarity score, etc.) | PARTIAL — only `sop_status` (workflow state: not_started/drafting/reviewing/final) exists. **No extracted-feature storage at all** — no `career_clarity_score`, no `research_clarity_score`, nothing. The brief's explicit ask (extracted features, not raw essay) has no schema home yet. |
| Faculty fit | MISSING entirely — depends on program-side `research_areas`/`research_groups`, which per `docs/masters_expansion_plan.md` are themselves empty/unpopulated columns on `masters_programs`. Cannot be built on the applicant side until the program side has real research-area data. |
| Financial profile (beyond budget) | PARTIAL — only `target_budget_max`/`target_budget_currency` exist (migration 124). No funding-need, no scholarship-eligibility signals, no existing-savings/loan-capacity fields. |
| Country preferences | EXISTS and LIVE — `target_countries` JSONB array. |
| Application strategy (reach/target/safety categorization, list-building logic) | MISSING entirely — no column, no derived field. The undergrad track may have an equivalent concept elsewhere in the codebase, but nothing in `masters_profile`/`masters_applications` encodes it; `masters_applications.priority` (migration 120, free TEXT column) is the closest analog and is user-entered, not computed. |

### TIER 3 — Moat / Future Intelligence (admissions outcomes + long-tail granular fields)

| LIST B field group | Status |
|---|---|
| Admissions outcomes (the training-data loop) | EXISTS and LIVE, and already deliberately designed as the moat asset — `POST /api/masters/outcomes` (routes/masters.js) writes both a `public.masters_applications.decision_outcome` update AND, for terminal outcomes, an insert into `canonical.masters_admission_datapoints` with `source='our_user'` — a profile-feature snapshot (GRE/GMAT/GPA) + label at time of decision. This is explicitly called out in code comments as "the strategic asset" for a future v2 model. This is the single most mature piece of LIST B already built. |
| Long-tail granular fields (everything in Tier 2 that's currently a single free-text or counter field) | MISSING as structured data — see Tier 2 table. All of it currently collapses into `research_experience`, `work_experience_desc`, `lors_secured/required`, none of which are queryable/scorable at a granular level. |

## 3. Derived-feature computation plan (policy: never show synthetic numbers)

No derived applicant-side features are implemented anywhere in
`mastersProfileService.js` or `mastersChancingService.js` today — the only
"scoring" logic that exists is `mastersChancingService.js`'s pathway-band
classifier (percentile bands vs. GradCafe/self-report data, explicitly NOT a
probability — see its own `CHANCING_DISCLOSURES` array). Below is a plan for each
LIST B derived feature, each explicitly marked with what real data it needs and
whether that data exists today.

- **academic_rigor** — needs coursework difficulty/course-load data (Tier 1 gap:
  coursework profile is entirely missing). **Cannot be computed today.** Proposed
  real input once available: normalized course-level+count vs. peer major average.

- **GPA_trend** — needs semester-by-semester GPA (Tier 1 gap: only one aggregate
  `undergrad_gpa` value exists). **Cannot be computed today** without a new child
  table `masters_profile_semester_gpa(user_id, term, year, gpa, credits)`. Until
  that exists, do not report a trend — report "insufficient data."

- **major_strength** — could be approximated today from `undergrad_major` text
  matched against `intended_program`/`intended_specialization` similarity, but
  that is a weak text-similarity heuristic, not a real signal of strength within
  the major (no grades-by-course exist). Recommend NOT shipping this as a score;
  at most show the raw major/program pairing as a checklist item (already
  effectively done by `readiness` endpoint pattern), not a numeric score.

- **quantitative_strength** — could be derived today from `gre_quant` (percentile
  vs. GradCafe self-reports for the target field, same percentile-band mechanism
  `mastersChancingService.bandsFromDatapoints` already implements) — this is
  REAL and implementable now with existing code patterns, gated on `N >=
  MIN_SAMPLE` (15, per `mastersChancingService.js`) self-reports for that
  program/field. This is the one Tier-2/derived feature with a genuinely
  available, non-fabricated path today.

- **research_depth / research_maturity** — needs structured research profile
  (Tier 2 gap: only one free-text field + a bare publication count exist).
  **Cannot be computed today.** A real formula once a structured table exists:
  weighted count of (projects × role-weight) + (publications × venue-tier-weight)
  + years of `research_experience`. Until a structured schema exists, this must
  show "insufficient data," not a number derived from parsing free text with an
  LLM guess (which would violate the never-fabricate policy since a text-derived
  "maturity score" is an estimate dressed as a measurement).

- **publication_score** — `publication_count` exists (a real integer) but a
  "score" implies weighting by venue/authorship position, which isn't captured.
  A defensible interim real metric: expose `publication_count` itself, unweighted,
  rather than inventing a weighted score from an unweighted count.

- **work_quality** — needs structured work-history detail (Tier 2 gap: single
  free-text `work_experience_desc`). **Cannot be computed today.**

- **leadership_score** — Tier 2 gap: leadership has no column at all. **Cannot be
  computed; not even partially.**

- **industry_prestige** — needs an employer-name field structured enough to match
  against a prestige list (e.g. FAANG-tier, which the *program* side already
  models via `institution_outcomes.faang_placement_pct`, migration 127). The
  applicant side has no employer name field at all (only `work_experience_desc`
  free text). **Cannot be computed today** without adding a structured employer
  field.

- **funding_competitiveness** — needs the profile's TA/RA/fellowship candidacy
  signals (research output, GPA, GRE) matched against a program's funding
  criteria — computable in principle from existing GPA/GRE/publication_count
  fields IF combined with real program-side funding-probability data, which per
  `docs/masters_expansion_plan.md` has no populating source today. **Blocked on
  the program side, not the applicant side.**

- **admissions_academic_fit, admissions_research_fit, admissions_faculty_fit,
  admissions_professional_fit, program_fit** — `admissions_academic_fit` is the
  closest to already-implemented: it's effectively what
  `mastersChancingService.assessPathway`'s `gpa_vs_published_min` +
  `bandsFromDatapoints` percentile comparisons compute today (GPA/GRE/GMAT vs.
  published minimums and self-reported bands). The others
  (`research_fit`/`faculty_fit`) are **blocked on program-side research_areas data
  being empty** (see `masters_expansion_plan.md` Section 1 "Research"). Do not
  compute a faculty/research fit score by inventing a text-similarity match
  between `research_experience` free text and a program's (empty) research
  fields — that would fabricate a number with no real basis.

- **career_ROI, research_ROI, salary_ROI, immigration_ROI** — all need
  program-side outcome data (`median_salary_post`, `placement_rate`,
  `stem_opt_eligible`/`h1b_sponsorship_rate`) which, per
  `masters_expansion_plan.md`, is largely unpopulated except `stem_opt_eligible`
  (real, rule-based) and `median_earnings` (real but field-level BLS, not
  program-specific). **immigration_ROI could be computed today** in a narrow,
  honest form: applicant's `target_countries` intersected with a program's real
  `opt_eligible`/`stem_opt_eligible` flags — a real yes/no fit check, not a
  fabricated numeric ROI. The salary/career/research ROI variants should report
  "insufficient data" until program-side salary/placement data has a real source.

- **overall_utility** — same conclusion as the program-side plan: this is a
  composite of several other derived features, most of which are currently
  blocked on missing structured data (Tier 2/3 gaps above). **Do not implement
  until at least a majority of its inputs are real.** Track as explicitly
  deferred rather than backed by a partial/guessed formula.

## 4. Recommended schema additions (deferred to migration numbering in
`masters_expansion_plan.md`, since applicant-side additions are `public.*` schema
and program-side are `canonical.*` — kept in this doc for field-level clarity only,
not renumbered here to avoid clashing with that plan's 130+ sequence):

- `public.masters_profile_semester_gpa` (child table: term-by-term GPA) — unlocks
  `GPA_trend`.
- `public.masters_profile_research_items` (child table: project/publication rows
  with title, venue, role, year) — unlocks `research_depth`/`publication_score`
  weighting and eventually `faculty_fit` once program-side research data exists.
- `public.masters_profile_work_items` (child table: employer, title, start/end,
  description) — unlocks `industry_prestige`, `work_quality`.
- `public.masters_profile_sop_features` (extracted-feature row per SOP version:
  `career_clarity_score`, `research_clarity_score`, etc., each nullable and
  explicitly sourced from a real NLP extraction pass over the applicant's own
  SOP text — never a fabricated/guessed number; if the extraction pipeline isn't
  built yet, these columns should stay entirely NULL rather than backfilled with
  placeholder values).
- Link `public.recommenders` (migration 112, undergrad track) into the masters
  flow, or create a masters-scoped equivalent, so `lors_secured`/`lors_required`
  counters can be backed by real recommender-level rows instead of bare integers.

These are intentionally left as a recommendation, not a numbered migration file,
because (a) this task is planning/documentation-only per instructions, and (b) the
applicant-side additions should be sequenced against `masters_expansion_plan.md`'s
130+ program-side migrations by CT, since several derived features above are
explicitly blocked on program-side data landing first.
