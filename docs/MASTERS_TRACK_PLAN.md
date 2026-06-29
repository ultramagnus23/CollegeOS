# Masters / Graduate Track — Finalized Implementation Plan

> **Status (2026-06-24):** Phases 0–7 implemented in PR #153 (branch `feat/masters-track`).
> Migration 120 was found **already recorded on production** (migrations table executed_at
> 04:09 UTC) and **verified read-only** — it was not applied by this work, and the applying
> process is unknown. Verification: `program_track` = 220 users / 100% `undergraduate` / 0 NULL;
> all 6 tables + MV + 3 CHECK constraints present.
> Backend services verified against the live schema (all queries valid; empty until Phase 2 scrape
> populates data). Chancing engine: 19/19 unit tests. Frontend: tsc + eslint clean, flag-gated.
> Remaining to fully *operate*: run the per-program scraper to populate data, run the latency
> baseline against a live server (Appendix B), and manual click-through of the flag-on UI.
>
> Supersedes the scope of the original "Masters/Grad Track Addition" brief by incorporating CT's
> decisions (2026-06-24) and the forward-looking additions agreed in the same session.
>
> **CT decisions baked in (2026-06-24):**
> 1. Scope = **full**, including the new application-execution modules (LOR / SOP / CV / WES)
>    and discovery — these are designed into the Phase 1 schema, not bolted on later.
> 2. Country scope = **global**: US, UK, Canada, Germany, Netherlands, Australia, Singapore.
>    Schema is country-agnostic (currency, language-of-instruction, country-aware funding/cost).
> 3. **Discovery/matching engine is in scope** this round (reuses the existing vector pipeline).
> 4. Proceed by **finalizing this written plan first**; code only after sign-off, phase by phase.

---

## 0. Ground truth (re-verified against the repo, 2026-06-24)

- Nothing masters-related exists. Grep for `program_track | masters_profile | masters_programs |
  mv_masters | mastersProfileSchema | intendedProgram` returns **zero** real hits.
- `src/types/profile.ts` `canonicalProfileSchema` is 100% undergrad. No enrollment / year-of-study.
- `src/types/college.ts` `CollegeStatsSchema` is institution-level undergrad only. No GRE/GMAT,
  no program-level row.
- `src/components/onboarding/OnboardingFlow.tsx` branches only on `curriculum_type`. No root
  "what are you applying for" question.
- **Migration state correction:** repo is at migration **119** (`119_institution_placements.sql`),
  129 files total — NOT "070 pending / ~98 files" as CLAUDE.md still claims. Phase 1's migration
  is `120_…`. (Action: fix CLAUDE.md's "Canonical Schema Status" section.)
- Reusable rails already present: pgvector + `embeddingService.js` + 4-stage recommendation
  pipeline; `recommenders` table (mig 112) + `Recommender.js`; `documents` table (mig 110);
  essay system; scraper framework + Indian adapter/extractor/normalizer pattern;
  `materializedViewManager.js`; schema contract checker.

---

## 1. Performance-isolation contract (unchanged, governs everything)

These rules from the brief's Section 2 are hard constraints on every phase below:

1. **No polymorphic shared table.** Masters never lives as discriminator rows in `colleges`.
2. **Own materialized view** `mv_masters_program_cards`, own refresh, own indexes. Never extend
   `mv_college_cards`.
3. **Track-scoped query layer.** Every fetch takes `program_track` and dispatches to a fully
   separate code path/table. No `OR track = …` plans.
4. **Narrow projections, not JSON blobs.** Masters structured data lives in normalized columns /
   child tables. `JSONB` only for genuinely free-form, low-cardinality fields.
5. **Benchmark before/after.** Latency baseline captured in **Phase 0** (moved to the front);
   re-run after each phase. >~5% regression on an undergrad-only request stops the phase.
6. **Masters requests never touch undergrad tables** and vice versa — enforced by denormalizing
   `institution_name`/`country` onto `masters_programs` so card queries never join `colleges`.

> **Convention note for new isolated tables:** masters tables use **native `BOOLEAN`, `JSONB`,
> and real `enum`/`CHECK` constraints** rather than the legacy `INTEGER`-boolean / `TEXT`-JSON
> pattern. This is a deliberate, isolated divergence (the frontend code consuming them is all
> new, so the `=== 1` convention never reaches them) and it directly satisfies isolation rule #4.
> Flagged here for explicit sign-off.

---

## 2. Phase 0 (NEW) — Baseline + feature flag (do first)

The brief put benchmarking in Phase 7; it must precede Phase 1 or the regression gate has no
comparison point.

1. Capture baseline p50/p95 latency for the three undergrad-only endpoints: **college search**,
   **chancing predict**, **dashboard load**. Store numbers in this doc's Appendix B.
2. Add a `masters_track_enabled` **feature flag** (env + per-user/cohort) so the entire vertical
   ships dark and is exposed to a cohort, never globally on merge. Protects the 6,500-user flow.

**Checkpoint 0:** baseline table + flag scaffold shown to CT.

---

## 3. Phase 1 — Schema & data model (full scope)

Migration `120_masters_track_foundation.sql` (likely split `120a…120f` for column→backfill→index→
RLS ordering, mirroring the `056a–g` precedent). **DDL below is a shape sketch for sign-off**, not
final. Exact profile-table target to be confirmed in implementation (candidates: `user_profiles`
[mig 072] vs `student_profiles` [mig 009] — `program_track` goes on the canonical profile the
frontend loads).

### 3.1 Track discriminator + enrollment (on the canonical profile table)

```sql
ALTER TABLE user_profiles
  ADD COLUMN program_track TEXT NOT NULL DEFAULT 'undergraduate'
    CHECK (program_track IN ('undergraduate','masters','transfer')),  -- transfer = reserved slot only
  ADD COLUMN university_enrollment_status TEXT NULL
    CHECK (university_enrollment_status IN ('not_enrolled','enrolled_yr1_2','enrolled_yr3_4')),
  ADD COLUMN current_year_of_study INT NULL CHECK (current_year_of_study BETWEEN 1 AND 6);
-- Backfill is implicit via DEFAULT; verification query in Phase 7 confirms 100% = 'undergraduate'.
```

### 3.2 `masters_profile` (1:1 with user — NOT bolt-on columns)

GRE V/Q/AWA (nullable), **both** GMAT classic total **and** GMAT Focus total (separate columns —
they are not comparable, per the 2024 rescore), undergrad GPA + scale + institution + major +
country, English proficiency carried over (TOEFL/IELTS/Duolingo/PTE), research experience text +
publication count, work experience years + text, SOP status, LORs secured/required, target degree
(`MS|MA|MBA` — no PhD), target intake term + year, target countries (`TEXT[]`).

```sql
CREATE TABLE masters_profile (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_degree_type TEXT NOT NULL CHECK (target_degree_type IN ('MS','MA','MBA')),
  intended_program TEXT,             -- e.g. "Computer Science", NOT "major"
  intended_specialization TEXT,      -- e.g. "Machine Learning"
  gre_verbal INT, gre_quant INT, gre_awa NUMERIC(2,1),
  gmat_total INT,                    -- classic GMAT (/800)
  gmat_focus_total INT,              -- GMAT Focus Edition (/805) — distinct scale
  toefl_score INT, ielts_score NUMERIC(2,1), duolingo_score INT, pte_score INT,
  undergrad_gpa NUMERIC(5,2), undergrad_gpa_scale NUMERIC(5,2),  -- 4.0 / 10.0 / 100
  undergrad_institution TEXT, undergrad_major TEXT, undergrad_country TEXT,
  research_experience TEXT, publication_count INT DEFAULT 0,
  work_experience_years NUMERIC(4,1) DEFAULT 0, work_experience_desc TEXT,
  sop_status TEXT CHECK (sop_status IN ('not_started','drafting','reviewing','final')),
  lors_secured INT DEFAULT 0, lors_required INT,
  target_intake_term TEXT CHECK (target_intake_term IN ('fall','spring','summer','winter')),
  target_intake_year INT,
  target_countries TEXT[] DEFAULT '{}',
  profile_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.3 `masters_programs` (program-level, separate from `colleges`)

Country-agnostic + country-aware fields for the global scope. Denormalized institution
name/country for isolation rule #6. Carries STEM flag, funding field, ROI fields, test policy.

```sql
CREATE TABLE masters_programs (
  id BIGSERIAL PRIMARY KEY,
  canonical_institution_id BIGINT,           -- identity link only; never joined in card queries
  institution_name TEXT NOT NULL,            -- denormalized
  institution_country TEXT NOT NULL,         -- US|UK|CA|DE|NL|AU|SG|...
  city TEXT,
  department TEXT, program_name TEXT NOT NULL,
  degree_type TEXT NOT NULL CHECK (degree_type IN ('MS','MA','MBA')),
  specialization TEXT,
  cip_code TEXT,                             -- join key for Scorecard FoS ROI + STEM derivation
  is_stem_designated BOOLEAN,                -- B3: 24-month OPT (US) — top international factor
  language_of_instruction TEXT[] DEFAULT '{English}',  -- DE/NL programs vary
  intake_term TEXT, intake_year INT,         -- B2: every row cycle-scoped
  -- Test policy
  gre_requirement TEXT CHECK (gre_requirement IN ('required','optional','waived','not_accepted','unknown')),
  gmat_requirement TEXT CHECK (gmat_requirement IN ('required','optional','waived','not_accepted','unknown')),
  min_gpa NUMERIC(5,2), min_gpa_scale NUMERIC(5,2),
  min_toefl INT, min_ielts NUMERIC(2,1),
  -- Funding (B4 — data captured even though v1 does not MODEL it)
  funding_availability TEXT CHECK (funding_availability IN ('fully_funded','partial','unfunded','varies','unknown')),
  assistantship_types TEXT[] DEFAULT '{}',   -- TA|RA|GA
  tuition_waiver_available BOOLEAN,
  -- Cost + ROI (B5)
  tuition_total NUMERIC(12,2), tuition_currency TEXT, program_length_months INT,
  median_earnings NUMERIC(12,2), median_debt NUMERIC(12,2), roi_source TEXT,
  -- Provenance / freshness (C5)
  program_url TEXT, data_source TEXT, data_quality_score NUMERIC(4,2),
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (canonical_institution_id, program_name, degree_type, intake_term, intake_year)
);
```

### 3.4 `masters_program_deadlines` (B1 — one program → many)

Grad deadlines are structurally unlike undergrad ED/EA/RD: priority vs final vs **funding-
consideration** (often earliest), rolling, multi-round (common for MBA).

```sql
CREATE TABLE masters_program_deadlines (
  id BIGSERIAL PRIMARY KEY,
  masters_program_id BIGINT NOT NULL REFERENCES masters_programs(id) ON DELETE CASCADE,
  deadline_type TEXT NOT NULL CHECK (deadline_type IN
    ('priority','final','funding_consideration','round_1','round_2','round_3','rolling')),
  deadline_date DATE, is_rolling BOOLEAN DEFAULT FALSE,
  intake_term TEXT, intake_year INT,
  notes TEXT, source_url TEXT, scraped_at TIMESTAMPTZ
);
```

### 3.5 `masters_program_pathways` (the core deliverable — one program → many)

```sql
CREATE TABLE masters_program_pathways (
  id BIGSERIAL PRIMARY KEY,
  masters_program_id BIGINT NOT NULL REFERENCES masters_programs(id) ON DELETE CASCADE,
  pathway_type TEXT NOT NULL CHECK (pathway_type IN (
    'standard_test_based','test_waived_holistic','work_experience_substitution',
    'portfolio_based','bridge_certificate','conditional_admission',
    'executive_part_time','direct_entry_no_test')),
  description TEXT NOT NULL,                  -- how this pathway actually works for THIS program
  weighted_fields TEXT[] DEFAULT '{}',       -- which masters_profile fields it weighs
  min_requirements JSONB,                    -- narrow, structured per-pathway minimums
  confidence NUMERIC(3,2), source_url TEXT, scraped_at TIMESTAMPTZ
);
```

**Sample row (illustrative of SHAPE; actual policy confirmed at scrape time in Phase 2 — not an
asserted current fact):**

```jsonc
// MIT Sloan MBA — work-experience-weighted pathway
{
  "masters_program_id": 1,
  "pathway_type": "work_experience_substitution",
  "description": "Holistic review; substantial professional experience and demonstrated impact can outweigh a standard GRE/GMAT profile. Test optionality and waivers reviewed case-by-case.",
  "weighted_fields": ["work_experience_years","work_experience_desc","research_experience","undergrad_gpa"],
  "min_requirements": { "work_experience_years_typical": 5, "gmat_required": false },
  "confidence": 0.8,
  "source_url": "https://mitsloan.mit.edu/mba/admissions"
}
```

### 3.6 Application-execution module tables (A2–A5, in-scope this round)

```sql
CREATE TABLE masters_applications (             -- tracker; decision_outcome feeds Phase 5 v2
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  masters_program_id BIGINT NOT NULL REFERENCES masters_programs(id),
  status TEXT, intake_term TEXT, intake_year INT, priority TEXT, notes TEXT,
  decision_outcome TEXT CHECK (decision_outcome IN ('admitted','rejected','waitlisted','interview','withdrawn','pending')),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
-- A2 LOR: extend existing `recommenders` (mig 112) with masters_application_id FK (academic/professional referee type).
-- A3 SOP / A4 CV / A5 transcript+WES: reuse existing `documents` (mig 110) with doc_type enum
--   ('sop','cv','transcript','wes_eval','writing_sample') + nullable masters_application_id
--   (SOP per-program; CV global). No new table unless `documents` proves too narrow.
```

### 3.7 Discovery (A1) + materialized view

```sql
CREATE MATERIALIZED VIEW mv_masters_program_cards AS
  SELECT id, institution_name, institution_country, program_name, degree_type, specialization,
         is_stem_designated, gre_requirement, funding_availability, tuition_total, tuition_currency,
         median_earnings, program_length_months, data_quality_score, last_scraped_at
  FROM masters_programs;            -- narrow projection; refreshed by materializedViewManager
-- Discovery embeddings: reuse embeddingService over (program_name || specialization || description).
-- Store vector in masters_programs.embedding (pgvector) OR masters_program_embeddings child table.
```

### 3.8 Zod types (new files — do NOT overload undergrad schemas)

- `src/types/mastersProfile.ts` → `mastersProfileSchema`,
  `normalizeApiMastersProfileToCanonical`, `mastersProfileToApiPayload` (mirrors profile.ts).
- `src/types/mastersProgram.ts` → `MastersProgramSchema`, `MastersPathwaySchema`,
  `MastersDeadlineSchema`, `MastersProgramCardSchema`.
- `src/contracts/mastersProgramCardContract.ts` → enforces `mv_masters_program_cards` at startup
  via the existing schema contract checker.

**Checkpoint 1:** migration + new Zod types + the sample MIT pathway row shown to CT for taxonomy
sign-off before Phase 2 goes wide.

---

## 4. Phase 2 — Dataset via per-program scraping (global)

1. **Primary — direct per-program scraping**, reusing `scraper/indian/*` adapter→extractor→
   normalizer→pipeline, pointed at graduate-program pages across the 7 countries. Extract test
   policy, min GPA, deadlines (all types), funding/assistantship language, STEM/CIP where stated,
   language of instruction, and the **how-they-evaluate** prose that feeds `masters_program_pathways`.
2. **Country nuances to handle:** UK 1-year + rolling + frequently no GRE; Germany/Netherlands
   €0–low tuition + winter/summer intakes + English-vs-local instruction; Canada funded research
   vs course-based; Australia/Singapore GTE + multiple intakes. The schema already carries
   `language_of_instruction`, `tuition_currency`, country-aware funding/deadlines for this.
3. **Secondary — GradCafe cross-check** (label "self-reported, N=X", never "acceptance rate").
   **Operational guardrails (C3):** caching, rate-limiting, ToS-aware fetch, and a fallback signal
   source — store `match_confidence` + `sample_provenance` on every datapoint.
4. **Tertiary — IPEDS / Scorecard Field-of-Study** by CIP × credential for ROI (B5) and STEM
   derivation (B3). Institution-level only; never stands in for program chancing.
5. Programs with no pathway data and no GradCafe coverage: row exists, **no chancing stat**, UI
   renders "insufficient data."

```sql
CREATE TABLE masters_admission_datapoints (   -- GradCafe + our own outcome capture (C2)
  id BIGSERIAL PRIMARY KEY,
  masters_program_id BIGINT REFERENCES masters_programs(id),
  source TEXT CHECK (source IN ('gradcafe','self_reported','our_user')),
  gre_verbal INT, gre_quant INT, gre_awa NUMERIC(2,1), gmat_total INT,
  gpa NUMERIC(5,2), gpa_scale NUMERIC(5,2),
  decision TEXT CHECK (decision IN ('admit','reject','waitlist','interview','unknown')),
  decision_date DATE, intake_term TEXT, intake_year INT,
  raw_program_name TEXT, match_confidence NUMERIC(3,2), scraped_at TIMESTAMPTZ
);
```

**Checkpoint 2:** pipeline running end-to-end on 3–5 universities across ≥2 countries, including
≥1 program where the normalizer correctly flagged a non-standard pathway.

---

## 5. Phase 3 — Onboarding branching

1. Root pre-step in `OnboardingFlow.tsx` (or new component) per Section-1 routing:
   not-enrolled → undergrad flow unchanged; enrolled yr1–2 → choice (Masters now; Transfer shown
   disabled/"coming soon"); enrolled yr3–4 → forced into Masters (no undergrad option).
2. New `MastersOnboarding.tsx` (sibling to `IBOnboarding.tsx`), collecting `masters_profile`.
3. **Profile bridge:** if the user already has an undergrad profile, prefill `undergrad_institution`/
   `undergrad_gpa`/`undergrad_major` from it.
4. Every step / nav item / saved card renders an explicit **Undergraduate / Masters badge**.
5. **Confirm with CT before building:** exact copy for the yr3–4 forced-redirect away from undergrad.

**Checkpoint 3:** branching demoed end-to-end with mock data.

---

## 6. Phase 4 — API / backend layer

New routes, never overloaded onto undergrad ones:
`/api/masters/profile`, `/api/masters/programs`, `/api/masters/programs/:id`,
`/api/masters/discover` (A1), `/api/masters/chances/predict`, `/api/masters/applications`,
`/api/masters/recommenders`, `/api/masters/documents`.

- Validation middleware switches on `program_track`: `mastersProfileSchema` vs
  `canonicalProfileSchema`. **Unset track fails loudly** — no defaulting.
- Each masters service queries `masters_*` / `mv_masters_program_cards` exclusively. Zero code
  paths reach `colleges` / `mv_college_cards` (and vice versa).
- Wire `mv_masters_program_cards` refresh into the existing scheduler (C4).

**Checkpoint 4:** routes return real scraped data; isolation verified (no cross-track query in plans).

---

## 7. Phase 4.5 (NEW) — Program discovery / matching engine (A1)

Reuse the 4-stage pipeline (vector retrieve → rank → diversify → explain) over
`mv_masters_program_cards` + embeddings: input = intended field/specialization (semantic),
budget + currency, target countries, degree type → ranked program list with "why." This is what
makes masters a discovery product, not a lookup. Strictly isolated from undergrad retrieval.

**Checkpoint 4.5:** discovery returns sensible ranked programs for 2–3 sample profiles.

---

## 8. Phase 5 — Masters chancing (rules-based bands, not a probability)

- **v1:** competitiveness band **per matching pathway** (evaluate the applicant against the
  pathway that fits — e.g. an MBA work-experience pathway ignores GRE if 5+ yrs shown). Compare
  vs scraped published minimums first, GradCafe percentile bands second (N≥ threshold — CT to
  confirm, suggested 15). Output: **Below / Within / Above typical range** — never a percentage.
- **v2 (later, gated on coverage):** GRE/GPA + selectivity-tier model, only once Phase 2/4 coverage
  is real (never against placeholder data). The Phase 1 `decision_outcome` + datapoints tables make
  this possible.
- No usable data → scraped-requirements checklist, "Insufficient applicant data for this program."

**Checkpoint 5:** bands shown for programs with data; checklist fallback for those without.

---

## 9. Phase 6 — "What we can't do" disclosure

Persistent, dismissible-but-reappearing notice on the Masters dashboard + inline in the chancing
card: no real admit probability for most programs; can't assess research/advisor fit; can't
evaluate SOP/LOR/interview; bands are self-reported limited samples, absent where data is thin;
funding likelihood not modeled in v1. Direct, no false confidence. Plus a **methodology page (C6)**
explaining how bands are computed.

**Checkpoint 6:** disclosure copy approved by CT.

---

## 10. Phase 7 — Migration safety & regression gate

1. Verification query: 100% of existing rows have `program_track = 'undergraduate'` — paste count.
2. Guard/assertion: undergrad chancing pipeline never receives a masters row, and vice versa.
3. **Re-run the Phase 0 latency benchmark**; paste before/after for search, chancing, dashboard.
   >~5% regression on undergrad = no-go (threshold pending CT confirm).
4. Full undergrad regression pass — zero behavior change for the 6,500-user flow. This is the
   actual deliverable of the round.

**Checkpoint 7 (go/no-go):** latency table + regression pass.

---

## 11. Open decisions still needed from CT

Carried from the brief (still open):
- GradCafe minimum N to show a band vs "insufficient data" (suggested **15**).
- Exact wording/UX for the yr3–4 forced redirect away from undergrad.
- Phase 2 initial scraper target list (CT's own targets + representative spread, across countries).
- Acceptable latency regression threshold for the Phase 7 gate (suggested **~5%**).

New, raised by this plan:
- Sign-off on **native BOOLEAN/JSONB/enum** for the new isolated masters tables (§1 note).
- Confirm the `program_track` host table (`user_profiles` vs `student_profiles`).
- For Germany/Netherlands free-tuition programs: should ROI/cost card show **€0 tuition + living-
  cost estimate** rather than a blank? (Affects Phase 2 cost capture.)

---

## 8. Excel→Supabase Bulk Ingestion (Phase 8)

### 8A0 — Recon
- **Status:** Completed. Zero `.xlsx`/`.xls` files found in repo. Loader built with `--recon` and `--file` flags for when CT provides the file.
- **Command:** `python -m scraper.masters.pipelines.excel_loader --recon --file path/to/file.xlsx`

### 8A1 — Excel Loader
- **File:** `scraper/masters/pipelines/excel_loader.py`
- **Modes:** `--recon` (sheet names, row counts, headers, sample rows, degree_type/country flags), `--dry-run` (prints column mapping and what would be loaded), `--file` + `--limit` (actual DB upsert)
- **Column mapping table** for program/deadline/pathway fields
- **Data coercion helpers:** bool, int, float, JSONB lists
- **Degree_type validation:** excludes non-MS/MA/MBA (enforces CHECK constraint)
- **Institution ID resolution:** via `canonical.institutions` normalized_name join, with fuzzy fallback
- **Scrape log entry** on completion via `canonical.masters_scrape_log`
- **MV refresh** after load via `materializedViewManager`

### 8A2 — Verification (pending)
- Row counts, spot-check 5 programs, verify scrape_log entries
- **Blocked on:** Excel file from CT

---

## 9. Navigation Parity — 5 New Pages + 2 Endpoints (Phase 9)

### 9B1 — MastersLayout
- **File:** `src/layouts/MastersLayout.tsx` (180 lines)
- Sidebar navigation with 7 items: Dashboard, Programs, Timeline, Deadlines, Funding, Applications, Settings
- Mobile responsive (sidebar overlay on mobile, permanent on desktop)
- Uses `Outlet` from react-router-dom for child routes
- Same visual style as DashboardLayout

### 9B2 — Backend Endpoints
- **File:** `backend/src/routes/masters.js` (updated, 283 lines)
- **GET /api/masters/deadlines** (line 232): joins `masters_applications` → `masters_program_deadlines` → `masters_programs`, sorted by deadline_date ASC with nulls/rolling last
- **GET /api/masters/funding** (line 262): reads from `mv_masters_program_cards` including `assistantship_types` and `tuition_waiver_available`, sorted by data_quality_score

### 9B3 — MV Migration
- **File:** `backend/migrations/122_masters_mv_funding_columns.sql` (new)
- Drops and recreates `mv_masters_program_cards` with 2 new columns: `assistantship_types` (JSONB), `tuition_waiver_available` (BOOLEAN)
- Same 3 indexes preserved (UNIQUE on id, index on country, index on degree_type)

### 9B4 — Frontend Pages (5 new)
| Page | File | Lines | API Calls |
|------|------|-------|-----------|
| MastersPrograms | `src/pages/MastersPrograms.tsx` | 364 | `api.masters.listPrograms()` |
| MastersProgramDetails | `src/pages/MastersProgramDetails.tsx` | 329 | `api.masters.getProgram()`, `api.masters.getChances()` |
| MastersTimeline | `src/pages/MastersTimeline.tsx` | 198 | `api.masters.listPrograms()` |
| MastersDeadlines | `src/pages/MastersDeadlines.tsx` | 288 | `api.masters.getDeadlines()` |
| MastersFunding | `src/pages/MastersFunding.tsx` | 289 | `api.masters.getFunding()` |

All pages use the dark editorial design system (`ACCENT = '#3B9EFF'`, `S` tokens, `GLOBAL` CSS with `fadeUp`/`spin` animations), loading/error/empty states, and lucide-react icons.

### 9B5 — api.ts Updates
- Added `getDeadlines()` and `getFunding()` methods to the `masters` namespace in `src/services/api.ts`

### 9B6 — App.tsx Consolidation
- Replaced standalone `/masters` routes with nested structure under `MastersLayout`
- Removed duplicate masters routes from inside `DashboardLayout` route group
- All masters routes now gated by `isMastersTrackEnabled()`

---

## 10. Isolation Contract Compliance (Phase 10)

### 10B1 — Isolation Check Results
- **Verified:** No joins to `mv_college_cards` or undergrad tables in any masters route or service
- All references to `institution_name` / `institution_country` are within `canonical.masters_programs` table — NOT undergrad `colleges` table
- Frontend pages: zero references to undergrad data structures
- **Result: PASS**

### 10B2 — Latency Baseline (pending)
- To be measured after Excel loader populates data
- **Gate:** >5% regression on undergrad-only requests stops the phase
- **Endpoints to measure:** `GET /api/masters/deadlines`, `GET /api/masters/funding`, `GET /api/masters/programs`

### 10B3 — Feature Flag Gating
- All masters routes gated by `VITE_MASTERS_TRACK_ENABLED` in `src/config/featureFlags.ts`
- Backend routes gated by `mastersFeatureGate` middleware in `backend/src/middleware/requireMastersTrack.js` (returns 404 when off)
- **Result: PASS**

---

## 11. Onboarding Expansion + Dashboard Insights + Applications Page (Phase 11)

Closes the gap flagged in CT review: masters onboarding was a single flat form (2 fields'
worth of structure vs. undergrad's 7-step flow), the dashboard was a plain light-themed search
box with no readiness signal, and the sidebar linked to `/masters/applications` with no route
behind it (404).

### 11A — MastersOnboarding.tsx rewritten as 7-step wizard
- **File:** `src/pages/MastersOnboarding.tsx`
- Steps: Program Intent → Academic Background → Standardized Tests → Experience & Research →
  Recommendations → Target Countries → Review
- Collects the full field set `sanitizeProfile` in `backend/src/routes/masters.js` already
  accepted but the old single-form UI never surfaced: `undergrad_country`, `research_experience`,
  `work_experience_desc`, `lors_required`, `sop_status`, `duolingo_score`, `pte_score`
- Deliberately drops essay/recommender *drafting* — only readiness counters (LORs secured/required,
  SOP status as an enum), matching CT's instruction to keep masters lighter than undergrad on the
  essay-heavy steps while still collecting structured data
- Draft persisted to `localStorage` (`masters_onboarding_draft`), cleared on successful submit
- Dark editorial design tokens, consistent with the Phase 9 pages

### 11B — MastersDashboard.tsx redesigned
- **File:** `src/pages/MastersDashboard.tsx`
- Replaced light Tailwind theme with the dark editorial design system from Phase 9
- New real-data insight surfaces: readiness ring + checklist from `GET /api/masters/readiness`,
  upcoming-deadlines preview (top 3, links to `/masters/deadlines`), funding snapshot (top 3,
  links to `/masters/funding`), quick-link tiles to all 5 sub-pages
- Program discovery search and chancing-card flow preserved, restyled

### 11C — MastersApplications.tsx (new)
- **File:** `src/pages/MastersApplications.tsx`
- The sidebar (`MastersLayout.tsx`) already linked to `/masters/applications`; `App.tsx` had
  pointed that route at the **undergrad** `Applications` component, which calls undergrad
  endpoints — a real isolation-contract violation, not just a missing page. Replaced with a
  masters-native page calling `api.masters.listApplications()` / `saveApplication()`.

### 11D — Dark-theme pass on shared masters components
- **Files:** `src/components/masters/MastersDisclosure.tsx`, `MastersChancingCard.tsx`
- Both hardcoded light Tailwind colors (amber/white/gray); converted to inline styles using
  the same CSS variables (`--color-bg-surface`, `--color-text-secondary`, etc.) as the rest of
  the masters track, since they're embedded directly in the now-dark dashboard.

### 11E — api.ts additions
- `masters.getReadiness()`, `masters.recordOutcome()` added to `src/services/api.ts` (existing
  `getDeadlines`/`getFunding`/`listApplications`/`saveApplication` were already present).

### Known issue carried forward (not fixed in this phase)
- `MastersDeadlines.tsx`'s `MastersDeadline` interface expects `country`, `confidence_tier`,
  `is_estimated`, `source_count` etc. that `GET /api/masters/deadlines` never returns (it only
  selects `program_id, program_name, institution_name, degree_type, deadline_type,
  deadline_date, is_rolling, intake_term, intake_year, source_url`). Country filter and
  confidence badges on that page are silent no-ops. Needs its own fix pass against the real
  `masters_program_deadlines` schema (see `backend/migrations/120_masters_track_foundation.sql`)
  — tracked as a separate follow-up, not bundled into this phase to avoid scope creep.

---

## 12. Field Contract Fixes Across Masters Pages (Phase 12)

Closes the issue flagged at the end of Phase 11. The root cause was systemic, not a single
endpoint: every backend query against `canonical.masters_programs` /
`canonical.mv_masters_program_cards` was returning real column names
(`institution_country`, `program_length_months`, `program_url`) while five different frontend
pages had each independently guessed at different, friendlier names (`country`,
`duration_months`, `official_website`) — and in `confidence_tier`/`scholarship_amount`/
`stipend_amount`/`start_date`/`delivery_mode`/`description` cases, names for columns that
**don't exist anywhere in the schema at all**. None of these were caught because every failure
mode is silent (`undefined` renders as nothing, not an error).

**Severity ranking of what was actually broken in production right now, before this fix:**
1. **Timeline page (`MastersTimeline.tsx`) was permanently empty.** It called `listPrograms()`
   and read `program.deadlines` off each card — but card endpoints never embed deadlines (by
   design, for MV performance). This wasn't a missing field, it was calling the wrong shape of
   endpoint entirely. No amount of seeded data would have ever made this page show anything.
2. **Catalog page (`MastersPrograms.tsx`) country filter and Duration field were always
   empty/"N/A".** The backend returned `institution_country`/`program_length_months`; the page
   read `country`/`duration_months`.
3. **Chancing display on the program details page (`MastersProgramDetails.tsx`) rendered
   `undefined` everywhere.** Its `ChancingResult` interface (`tier`, `category`, `confidence`,
   `probabilityRange`) didn't match what `mastersChancingService.assessProgram()` actually
   returns (`{ overall: { band, label }, pathways, checklist, sampleSize, disclosures }`).
4. **Funding card colors/country badge were always wrong.** `MastersFunding.tsx` compared
   against `'full_funding'`/`'United States'` when the schema's real enum values are
   `fully_funded|partial|unfunded|varies|unknown` and country codes are `US|UK|CA|DE|NL|AU|SG`.
   It also rendered a `Stipend` field and `scholarship_amount`/`stipend_amount` fields that have
   no backing column anywhere in `canonical.masters_programs`.
5. Deadlines/funding/program-detail pages also lacked `country`, which is a legitimate
   denormalized column on `masters_programs` simply never joined/selected by the route.

**Fix approach taken (per-case, not blanket):**
- Where the frontend wanted a real column under a friendlier name (`country` for
  `institution_country`, `duration_months` for `program_length_months`, `official_website` for
  `program_url`), the fix was a SQL alias — `mastersProgramService.js`'s `CARD_COLUMNS` and
  `getProgramDetail()` now alias these consistently everywhere a "program card" or "program
  detail" shape is returned, so every page sees the same contract.
- Where the frontend invented a field with **no backing column** (`scholarship_amount`,
  `stipend_amount`, `start_date`, `delivery_mode`, `description` on programs;
  `confidence_tier`/`is_estimated`/`source_count`/`last_verified` on deadlines — the deadlines
  table has no confidence-scoring columns at all, that concept doesn't exist for masters
  deadlines), the UI for it was removed rather than stubbed.
- Where the frontend needed data that genuinely didn't exist as an endpoint
  (Timeline's catalog-wide deadline browse), a new read-only endpoint was added:
  `GET /api/masters/programs/deadlines/all` (`mastersProgramService.listAllDeadlines`) —
  distinct from the user-scoped `GET /api/masters/deadlines`, which stays scoped to saved
  applications per its original Phase 9 spec.
- The chancing display on program details now reuses the existing `MastersChancingCard`
  component (already correct, already dark-themed) instead of a second, wrong, hand-rolled
  renderer.

**Files touched:** `backend/src/routes/masters.js` (`/deadlines`, `/funding`, new
`/programs/deadlines/all`), `backend/src/services/masters/mastersProgramService.js`
(`CARD_COLUMNS`, `getProgramDetail`, new `listAllDeadlines`), `src/services/api.ts`
(`listAllDeadlines`), `src/pages/MastersDeadlines.tsx`, `src/pages/MastersFunding.tsx`,
`src/pages/MastersTimeline.tsx`, `src/pages/MastersProgramDetails.tsx`,
`src/pages/MastersDashboard.tsx` (ProgramCard interface follow-on fix for the same alias
change). Typecheck, lint, and production build all pass clean after the change.

---

## Appendix A — New files/tables at a glance

| Layer | New artifact |
|---|---|
| Migration | `120_masters_track_foundation.sql` (split `120a–f`) |
| Tables | `masters_profile`, `masters_programs`, `masters_program_deadlines`, `masters_program_pathways`, `masters_applications`, `masters_admission_datapoints` |
| MV | `mv_masters_program_cards` |
| Reused | `recommenders` (+masters FK), `documents` (+doc_type) |
| Types | `src/types/mastersProfile.ts`, `src/types/mastersProgram.ts`, `src/contracts/mastersProgramCardContract.ts` |
| UI | `MastersOnboarding.tsx`, root branching step, masters dashboard + disclosure + methodology |
| Scrapers | per-program adapters/extractors/normalizers; GradCafe adapter; Scorecard FoS pull |
| Routes | `/api/masters/{profile,programs,discover,chances/predict,applications,recommenders,documents}` |

## Appendix B — Latency baseline (to fill in Phase 0)

| Endpoint | p50 (ms) | p95 (ms) | Captured |
|---|---|---|---|
| College search | _TBD_ | _TBD_ | _TBD_ |
| Chancing predict | _TBD_ | _TBD_ | _TBD_ |
| Dashboard load | _TBD_ | _TBD_ | _TBD_ |
