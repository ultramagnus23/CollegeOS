-- 147_drop_confirmed_dead_tables.sql
-- ----------------------------------------------------------------------------
-- Phase 2 consolidation kill-list item: confirmed-dead tables only. Every
-- table below has ZERO rows AND zero code references anywhere in the repo
-- (backend/src, src, scraper/, scraper*/) as of 2026-07-12 -- verified by
-- grep, not by row count alone (many superficially-empty tables turned out
-- to have real live code reading/writing them for a feature that just
-- hasn't accumulated data yet -- those are explicitly NOT in this list; see
-- docs/audits/DB_SIZE_AUDIT_2026-07-12.md for the full classification).
--
-- Two internal FK pairs are dropped together (child then parent), both
-- fully dead on both sides: canonical.application_tasks -> canonical.applications
-- (a third-generation duplicate of the real public.applications/application_tasks
-- tables, never adopted), and canonical.scraper_failures -> canonical.scraper_runs
-- (superseded by the real, populated public.scraper_run_logs).
--
-- ROLLBACK PLAN: all 16 tables are empty (0 rows) as of this migration, so
-- there is no data to lose. If any of these turns out to still be needed,
-- restore its DDL from this file's DROP statements (schema only, trivial to
-- recreate) -- no data restore is required since nothing was in them. No
-- pre-migration dump snapshot is needed for this migration specifically
-- given zero data at risk.
-- ----------------------------------------------------------------------------

-- canonical schema: dead FK pairs, children first
DROP TABLE IF EXISTS canonical.application_tasks;
DROP TABLE IF EXISTS canonical.applications;
DROP TABLE IF EXISTS canonical.scraper_failures;
DROP TABLE IF EXISTS canonical.scraper_runs;

-- public schema: standalone dead tables, no dependents
DROP TABLE IF EXISTS public.calibration_runs;
DROP TABLE IF EXISTS public.course_requirements;
DROP TABLE IF EXISTS public.field_metadata;
DROP TABLE IF EXISTS public.net_price_data;
DROP TABLE IF EXISTS public.onboarding_drafts;
DROP TABLE IF EXISTS public.recommendation_cache;
DROP TABLE IF EXISTS public.scrape_audit_log;
DROP TABLE IF EXISTS public.scrape_queue;
DROP TABLE IF EXISTS public.scrape_runs;
DROP TABLE IF EXISTS public.scrape_statistics;
DROP TABLE IF EXISTS public.special_programs;
DROP TABLE IF EXISTS public.varsity_sports_detail;
