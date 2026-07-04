# EMPTY_TABLE_AUDIT.md

_Verified 2026-06-23. **93 of 149 tables are empty.** Method: a table is a drop
candidate only if it's empty AND has **zero SQL-context references** (`FROM/INTO/
JOIN/UPDATE`) in the codebase. **Nothing has been dropped — this is the approval list.**_

## A. SAFE DROP candidates — empty + 0 code references (legacy/orphan)

These are not read or written anywhere in the app. Safe to drop on your approval.

`public`: `activity_ideas`, `athletics`, `college_contact`, `college_financial_predictions`,
`college_stats`, `credit_policies`, `deadline_scrape_log`, `essay_examples`,
`exchange_partners`, `financial_guides`, `lda_model_registry`, `lor_guides`,
`ml_data_sources`, `pre_professional_programs`, `search_misses`, `student_life_ratings`,
`timeline_events`
`canonical`: `institution_metadata`, `institution_statistics`, `institution_sources`,
`ranking_eval_history`, `recommendations`, `timeline_events`

(~23 tables — clear legacy duplicates/abandoned features.)

## B. DO NOT DROP despite 0 references (new / staging / planned)

- **`canonical.institution_placements`** — NEW (migration 119, this work); the placement scraper writes here. Empty only because the migration isn't deployed yet.
- **`canonical.stg_institution_candidates`, `stg_institution_matches`** — staging tables for the institution-matching pipeline (used transiently during ingestion).
- **`onboarding_drafts`, `recommendation_cache`** — wired-but-unused or planned; verify before dropping.
- **Region-profile tables** (`canonical.{eu,uk,us}_admissions_profile`, `{india,us}_financial_aid`, `uk_financial_support`) — empty + unreferenced, BUT these are the intended homes for the **non-US / India / EU data you want**. Don't drop — **wire them up** instead.

## C. KEEP — empty but referenced in code (dropping would break the app)

These fill with usage or are read by live code (ref count in parens). Examples:
`tasks`(40), `application_deadlines`(21), `canonical.applications`(20), `student_activities`(19),
`essays`(17), `ml_training_data`(17), `deadlines`(16), `scrape_queue`(13), `field_metadata`(10),
`documents`(9), `user_deadlines`(9), `recommendation_requests`(8), `prediction_logs`(7),
`recommenders`(7), `notifications`(6), `college_deadlines`(6), `login_attempts`(5),
`canonical.institution_embeddings`(5), `deadline_history`(5)… (~52 total).

> **ML-capture + usage tables in this list (`prediction_logs`, `ml_training_data`, `admission_outcomes`, `notifications`, `documents`, `essays`, `onboarding`…) are empty-but-needed** — they fill as users use the app / submit outcomes. Do NOT drop.

## D. Notable duplicates worth consolidating (not just dropping)

- `tasks`(0) vs `application_tasks`(60) — pick one task table.
- `canonical.applications`(0) vs `public.applications`(12) — app uses public; canonical dup is empty.
- Many parallel deadline tables (`deadlines`, `college_deadlines`, `application_deadlines`, `user_deadlines`, `deadline_history`…) vs the real `canonical.institution_deadlines`. These are referenced (legacy code paths) — consolidation needs code changes, not just a drop.

## Recommendation

Drop **Section A** (~23 orphans) after your sign-off — zero risk. Leave B (needed/planned), C (referenced), and D (needs code consolidation first). When you approve, the drop is a single `DROP TABLE IF EXISTS …` migration; I will not run it unilaterally.
