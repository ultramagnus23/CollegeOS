# DB Size & Shape Audit — 2026-07-12

Live query results against production Supabase. Supersedes row counts in `TASKS.md`,
`docs/audits/DATA_STATUS.md`, and `docs/audits/SCRAPER_STATUS.md` (dated 2026-06-18/21/22 —
several are now stale; discrepancies flagged below).

## Headline numbers

- Total DB size: **616 MB** (includes Supabase-managed `auth`/`storage`/`realtime`/`vault` schemas,
  which are not ours to consolidate).
- User-owned schemas: **`public` (87 tables) + `canonical` (53 tables) = 140 tables.** Not 179 —
  either the June count included since-dropped tables, or included the system schemas.
- No dead-tuple bloat found (`pg_stat_user_tables` bloat query returned 0 rows > 10k dead tuples) —
  autovacuum is keeping up; VACUUM FULL is not urgent for size reasons, though may still be worth
  it after Phase 2 drops reclaim space.

## Top space consumers (`canonical` + `public`, by total size)

| Schema | Relation | Total | Rows | Note |
|---|---|---:|---:|---|
| canonical | institutions | 129 MB | 9,848 | core table |
| canonical | institution_programs | 83 MB | 107,659 | core table, this week's scraper work added ~24k rows |
| canonical | institution_embeddings | 69 MB | 8,500 | pgvector, mostly index (34 MB) |
| public | college_majors | 35 MB | 184,800 | **legacy**, superseded by `institution_programs` |
| canonical | institution_identity_map | 33 MB | 8,331 | legacy↔canonical bridge |
| canonical | institution_financials | 31 MB | 11,908 | core table |
| public | colleges_comprehensive | 27 MB | 8,330 | **legacy**, unread by frontend contract |
| canonical | institution_search_index | 26 MB | 8,236 | core table |
| public | colleges | 9 MB | 5,336 | **legacy**, still written by `seedColleges.js` |
| public | colleges_legacy | 5 MB | 6,207 | **legacy** |

`college_majors` + `colleges_comprehensive` + `colleges` + `colleges_legacy` + their dependent
legacy tables (`college_admissions`, `college_financial_data`, `college_programs`,
`college_financial_aid`, `academic_details`, `academic_outcomes`, `campus_life`,
`student_demographics`, `cost_of_attendance`, `career_outcomes_detail`, `college_rankings`,
`college_admissions_stats`) account for roughly **100 MB** of the 616 MB total — the single
largest consolidation opportunity, matching the master prompt's Phase 2 §2 target.

## Unused indexes (candidates to drop, `idx_scan = 0`, excl. primary keys)

Top offenders by size, all in `public`/`canonical`, 30 found total (~40 MB combined):
`idx_programs_name_trgm` (13 MB, canonical.institution_programs — unused trigram index, real
candidate), `college_majors_college_id_major_id_key` (6.9 MB), `idx_search_index_tokens_gin`
(5 MB), `idx_inst_external_ids_gin` (4.9 MB), plus ~15 more on the legacy `colleges_comprehensive`/
`colleges`/`colleges_legacy` family that go away automatically once those tables are dropped.
Full list saved alongside this audit's query output — do not drop `idx_inst_external_ids_gin` or
`idx_search_index_tokens_gin` without confirming they're truly never used by a real query path
(GIN indexes on JSONB/tsvector columns often show 0 scans early in a table's life even when
correctly used for infrequent full-text/contains queries — verify against `search_colleges`/
`search_institutions` RPC definitions before dropping, not just `idx_scan`).

## Classification (140 user-owned tables)

### CANONICAL — keep (53 tables in `canonical` schema)
All of `canonical.institutions`, `institution_*` (programs, admissions, financials, outcomes,
demographics, campus_life, deadlines, requirements, rankings, embeddings, search_index,
completeness, quality_scores, aliases, identity_map, placements, source_registry),
`mv_college_cards`, `masters_*` (programs, pathways, program_pathways, admission_datapoints,
program_deadlines, scrape_log), `institution_merge_history`, `data_quality_snapshots`,
`*_merge_archive` (financials/admissions/rankings/completeness), `popularity_index`,
`major_ontology`, country-specific admissions/financial-aid profile tables
(us/uk/eu/india_admissions_profile, us/uk/india_financial_aid), recommendation tables
(recommendation_sessions, user_recommendation_events, recommendation_feedback),
`experiment_assignments`, `retrieval_eval_history`, `source_reliability`, `requirement_history`,
`deadline_history`, staging tables (`stg_institution_candidates`, `stg_institution_matches`).

### APP — keep (public schema, real user data)
`users` (407), `student_profiles` (377), `refresh_tokens` (637), `applications` (14),
`application_tasks` (42), `deadlines` (42), `documents` (36), `essays` (0 — feature live, no
usage yet, not orphan), `timeline_actions` (80), `tasks` (60 — **see discrepancy below, do NOT
drop**), `chancing_audit_log` (9,598), `scholarships` (108), `grants` (64), `financing_options`
(16), `government_loans` (31), `private_loans` (28), `currency_rates` (16), `migrations` (160),
`user_signals` (6), `user_suggestions` (2), `recommenders` (1), masters app tables
(`masters_profile` 3, `masters_applications` 1, `masters_application_documents` 1,
`masters_application_recommenders` 1), `ml_training_data` (1), `scraper_run_logs` (16 — **already
exists and has real data**, contradicts the master prompt's Phase 3 §3 assumption that this needs
to be created from scratch — it needs *wiring into the rest of the framework*, not building).

### LEGACY-DUPLICATE — drop after repointing (public schema)
`colleges` (5,336), `colleges_comprehensive` (8,330), `colleges_legacy` (6,207),
`college_majors` (184,800 — by far the largest table in the DB), `college_programs` (19,049),
`college_admissions` (6,327), `college_admissions_stats` (5,359), `college_financial_data`
(6,327), `college_financial_aid` (6,149), `academic_details` (6,327), `academic_outcomes`
(6,149), `campus_life` (8,552), `student_demographics` (6,323), `cost_of_attendance` (6,387),
`career_outcomes_detail` (8,330), `college_rankings` (748), `majors` (37 — superseded by
`canonical.major_ontology`), `scholarships_new` (36 — superseded by `scholarships`, per WS2).
Also **new finding, not in the master prompt's list**: `canonical.applications` (0 rows) and
`canonical.application_tasks` (0 rows) are a dead third-generation duplicate of
`public.applications`/`public.application_tasks` — grepped, **zero code references anywhere in
the repo** (not `backend/src/`, not scripts, not frontend). Same pattern for
`canonical.scraper_runs` (0 rows) vs. the real, active `public.scraper_run_logs` (16 rows) —
`scraper_runs` is dead, zero references.

### EMPTY-ORPHAN — drop (0 rows, zero code references — verify each before dropping, not by count alone)
`admission_outcomes`, `application_deadlines`, `calibration_runs`, `chance_me_posts`,
`chancing_predictions`, `college_data_contributions`, `college_deadlines`, `college_insights`,
`college_requirements`, `course_requirements`, `deadline_alerts`, `deadline_history` (public —
distinct from `canonical.deadline_history`), `field_metadata`, `login_attempts`, `ml_metadata`,
`model_training_history`, `net_price_data`, `notifications` (0 rows — verify: route exists and
migration 092 fixed it, may just have zero real usage yet, not dead code), `onboarding_drafts`,
`prediction_audit_log`, `prediction_logs`, `recommendation_cache`, `recommendation_requests`,
`requested_colleges`, `scrape_audit_log`, `scrape_queue`, `scrape_runs`, `scrape_statistics`,
`scraped_applicants`, `scraped_results`, `scraper_logs`, `special_programs`,
`student_activities`, `student_awards`, `student_coursework`, `user_deadlines`,
`user_financial_profiles`, `user_ml_stats`, `user_outcome_contributions`, `user_profiles`,
`user_scholarships`, `varsity_sports_detail`. Plus canonical-side 0-row tables not already listed
as LEGACY-DUPLICATE above: `eu_admissions_profile`, `india_financial_aid`,
`institution_source_registry`, `masters_admission_datapoints`, `masters_pathways`,
`masters_program_deadlines`, `recommendation_feedback`, `requirement_history`,
`retrieval_eval_history`, `scraper_failures`, `source_reliability`, `stg_institution_candidates`,
`stg_institution_matches`, `uk_admissions_profile`, `uk_financial_support`,
`us_admissions_profile`, `us_financial_aid` — **many of these are genuinely-empty-so-far
infrastructure for features this session already advanced** (masters_admission_datapoints needs
GradCafe ingestion, masters_program_deadlines needs Tier 4 of the Phase 4 deadline engine,
country admissions-profile tables are this week's scraper targets) — **do NOT classify these as
drop candidates**, they're CANONICAL infrastructure waiting on data, not orphans. True empty-
orphan-with-zero-purpose status needs a per-table code-reference grep, not just a row count of 0.

### QUARANTINE/LOG — keep, add retention policy
`chancing_audit_log` (9,598 rows, growing), `data_quality_snapshots` (40), `migrations` (160,
never prune), `scraper_run_logs` (16).

## Critical discrepancy vs. the master prompt's assumptions

**`tasks` has 60 rows, not 0, and it is the OPPOSITE of dead — traced live.** The master prompt's
Phase 2 §4 ("`tasks` → gone. `application_tasks` is live, `tasks` has 0 rows") is not just
stale, it has the relationship backwards. `tasks` is a **richer, actively-used task-dependency
system** (blocking_reason, depends_on_task_id chains, priority/estimated_hours) read/written by
9 files: `routes/tasks.js`, `applicationController.js`, `routes/risk.js`, `routes/timeline.js`,
`applicationBootstrapService.js`, `dashboardService.js`, `deadlineDependencyService.js`,
`deadlineRiskService.js`, `requirementService.js`, `warningSystemService.js`. `application_tasks`
is the **older, simpler** table — and the code says so explicitly in its own comments:
`applicationController.js:478` — "Try application_tasks table first, fall back to tasks table";
`routes/timeline.js:16` — "Pull tasks from BOTH task tables"; `requirementService.js:218` —
"application_tasks is a second, older table still used by [timeline]." **This is a deliberate
dual-read merge, not a stray duplicate** — dropping either table breaks a real, designed code
path. Reconciling these two into one table is real consolidation work (needs a migration that
merges both into one schema and repoints ~10 call sites), not a one-line drop. Recommend scoping
this as its own dedicated PR, not folding it into the Phase 2 kill-list sweep.

## Phase 2 §2 finding (2026-07-13): `colleges`/`colleges_full` consolidation is NOT a simple drop

Investigated before executing. `public.colleges` (5,336 rows) and the `colleges_full` view over
it (migration 090) are read by **~18 files directly** and the `college_id` INTEGER FK that
anchors them is referenced across **~40 files** total: every application-tracking model/service/
route (`Application.js`, `CollegeDeadline.js`, `Deadline.js`, `Essay.js`, `Document.js`,
`Recommender.js`, deadline dependency/risk/auto-population services, essay auto-loading,
timeline, tasks, notifications, dashboard, chancing, requirements, warnings, financial scoring,
recommendation engine, ML services). `applications.college_id` is an **INTEGER** FK into
`public.colleges.id`, structurally incompatible with `canonical.institutions.id` (UUID) without
a real migration of every one of those FKs — not a repoint, a type change cascading through the
entire application-lifecycle subsystem. This is also the exact FK class that caused **real data
corruption** last week per commit `0f037c5` ("college_id FK pointed at the wrong table"),
already fixed once under pressure.

**Decision: do not attempt this drop in a rushed pass.** The master prompt's own escape hatch
applies verbatim: "Keep a single compatibility view ONLY if a live route still needs
`colleges_full`, and mark it deprecated" — that condition is true here, by a wide margin.
Recommend this become its own dedicated workstream (integer→UUID FK migration across ~40 files,
with a full application/deadline/essay/timeline/chancing regression pass against real user data
before any drop), not a Phase 2 sub-item executed alongside index diet and dead-table cleanup.
`colleges_comprehensive` and `college_majors` still need their own separate usage audit before
any decision (not yet done — `college_majors` is referenced by `collegeController.js`,
`colleges_comprehensive` by `College.js`; neither confirmed safe to drop yet).

## Phase 2 §5 finding (2026-07-13): deadline/requirement table dedupe is NOT a simple drop either

Same pattern as §2 above, found while investigating the "6 empty deadline tables + 3 requirement
tables" kill-list item. `public.application_deadlines`, `college_deadlines`, `college_requirements`,
`deadline_alerts`, `user_deadlines`, and `deadline_history` are all **live and reachable** — read/
written by `collegeDeadlineIntelligenceService.js`, which is mounted at `/api/deadlines`
(`backend/src/app.js:194`) — not dead code. Several call sites (`CollegeDeadline.js:7`,
`deadlineRiskService.js:140`) query these tables with **no try/catch**; a couple of others
(`applicationController.js:389-444`) do have defensive fallback-on-error logic. This is a
dormant, parallel deadline-intelligence subsystem running alongside the real
`canonical.institution_deadlines`/`canonical.institution_requirements`/`public.deadlines` system
— architecturally the same class of problem as the `colleges`/`colleges_full` finding above, not
a quick table drop. Dropping any of the unprotected-read tables would convert a currently-silent
"no data yet" path into a live runtime error for real users hitting `/api/deadlines`.

**Decision: defer, same as §2.** `course_requirements` (genuinely zero references) was already
dropped in the confirmed-dead-tables migration (147). The rest of this cluster needs a proper
audit of every call site's error handling before any table can safely go, not a bulk drop —
recommend folding it into the same dedicated workstream as the `colleges`/`colleges_full`
migration, since both are really "which of the two parallel systems wins" questions requiring
live regression testing, not database housekeeping.

## Phase 2 §8 finding (2026-07-13): index diet — none of the canonical-schema candidates are safe

Checked all 4 non-legacy unused indexes against real query paths rather than trusting `idx_scan`
alone (small user base — 148-407 users — means "0 scans" often just means "not exercised yet,"
not "unused"; this instinct proved right every time it was checked this session):
- `idx_search_index_tokens_gin` — used by `canonical.search_colleges`'s keyword-search branch
  (`si.search_document @@ websearch_to_tsquery(...)`), just never hit because no live search has
  passed the `p_keywords` param yet. **Keep.**
- `idx_programs_name_trgm` — used by `backend/src/models/College.js`'s major/program ILIKE
  filter (`cp.program_name ILIKE $n`), a real reachable code path. **Keep.**
- `idx_inst_slug_btree` — used by `rankingResolver.ts`'s slug lookup. **Keep.**
- `idx_inst_external_ids_gin` — only reference found is a plain SELECT column in
  `collegeService.js`, not a JSONB containment query the GIN index would accelerate; genuinely
  looks unused, but given the other 3 all turned out to be false positives, not dropping this on
  a single check alone without a second look.

The remaining ~26 unused indexes are all on legacy tables covered by the deferred `colleges`/
`colleges_full` consolidation (§2 above) — they go away automatically if/when those tables are
eventually dropped, not an independent action to take now.

**No index drops executed this pass.**

## Phase 2 §9 finding (2026-07-13): VACUUM FULL skipped, no benefit available

Re-checked dead-tuple bloat after this session's drops (16 confirmed-dead tables + `scholarships_new`,
migrations 147-148): still zero tables over the 10k dead-tuple threshold, max is 1,527
(`institution_financials`) — autovacuum is genuinely keeping up, matching the original Phase 1
finding. Postgres reclaims space immediately on `DROP TABLE` (unlike `DELETE`, which just marks
dead tuples), so the drops already executed didn't need a VACUUM FULL to take effect. Running one
now would only cost an `ACCESS EXCLUSIVE` lock per table for zero measurable benefit — skipped.

**DB size: 616 MB → 615 MB.** Modest, because the one drop with real size (the `colleges`/
`college_majors` family, ~100MB) is deferred pending its own dedicated migration (§2 above) — the
tables actually dropped this session (16 dead tables + `scholarships_new`) were mostly at or near
0 rows by design, so their disk footprint was already negligible.

## Recommendation before Phase 2

The kill list in the master prompt is directionally right (the `colleges`/`college_majors`
family is the correct main target, ~100 MB), but three items need correction before execution:
1. `tasks` is NOT empty — investigate live writers before any drop decision.
2. `canonical.applications`/`canonical.application_tasks`/`canonical.scraper_runs` are additional
   dead duplicates the prompt didn't know about — safe to add to the kill list (verified zero
   references).
3. Several 0-row canonical tables are in-progress feature infrastructure, not orphans — excluded
   from the drop list above.
