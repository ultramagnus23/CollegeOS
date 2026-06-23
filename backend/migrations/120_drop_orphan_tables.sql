-- 120_drop_orphan_tables.sql
-- Remove confirmed orphan tables: each is EMPTY (0 rows) AND has ZERO SQL-context
-- references anywhere in the codebase (verified 2026-06-23, see EMPTY_TABLE_AUDIT.md
-- Section A). These are legacy/abandoned-feature residue. Empty-but-REFERENCED tables
-- (prediction_logs, ml_training_data, tasks, essays, notifications, the parallel
-- deadline tables, etc.) are intentionally NOT dropped — they fill with usage or are
-- read by live code. The legacy colleges/colleges_comprehensive schema is also left
-- (widely referenced; needs a coordinated refactor, not a drop).

DROP TABLE IF EXISTS public.activity_ideas CASCADE;
DROP TABLE IF EXISTS public.athletics CASCADE;
DROP TABLE IF EXISTS public.college_contact CASCADE;
DROP TABLE IF EXISTS public.college_financial_predictions CASCADE;
DROP TABLE IF EXISTS public.college_stats CASCADE;
DROP TABLE IF EXISTS public.credit_policies CASCADE;
DROP TABLE IF EXISTS public.deadline_scrape_log CASCADE;
DROP TABLE IF EXISTS public.essay_examples CASCADE;
DROP TABLE IF EXISTS public.exchange_partners CASCADE;
DROP TABLE IF EXISTS public.financial_guides CASCADE;
DROP TABLE IF EXISTS public.lda_model_registry CASCADE;
DROP TABLE IF EXISTS public.lor_guides CASCADE;
DROP TABLE IF EXISTS public.ml_data_sources CASCADE;
DROP TABLE IF EXISTS public.pre_professional_programs CASCADE;
DROP TABLE IF EXISTS public.search_misses CASCADE;
DROP TABLE IF EXISTS public.student_life_ratings CASCADE;
DROP TABLE IF EXISTS public.timeline_events CASCADE;
DROP TABLE IF EXISTS canonical.institution_metadata CASCADE;
DROP TABLE IF EXISTS canonical.institution_statistics CASCADE;
DROP TABLE IF EXISTS canonical.institution_sources CASCADE;
DROP TABLE IF EXISTS canonical.ranking_eval_history CASCADE;
DROP TABLE IF EXISTS canonical.recommendations CASCADE;
DROP TABLE IF EXISTS canonical.timeline_events CASCADE;
