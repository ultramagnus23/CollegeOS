-- 150_archive_schema_and_colleges_legacy.sql
-- ----------------------------------------------------------------------------
-- Phase 6 DB consolidation, Batch A (conservative).
--
-- Creates the `archive` schema (the destination for anything retired from the
-- live schema per the audit's never-drop rule) and moves `public.colleges_legacy`
-- into it.
--
-- Why only colleges_legacy, and nothing else the audit's disposition matrix
-- marked ARCHIVE: hands-on verification during Phase 6 (see AUDIT_REPORT.md
-- "DB consolidation" note) found that the ~42 "empty scaffolding" tables are
-- NOT dead -- they are live, as-yet-unpopulated feature tables with active
-- writers (e.g. `INSERT INTO admission_outcomes` in admissionOutcomeScraper.js,
-- `INSERT INTO scraper_logs` in scraperScheduler.js, `INSERT INTO
-- college_data_contributions` in collegeService.js, plus essays/notifications/
-- student_activities routes). Moving any of them to `archive` would break a
-- runtime code path. The canonical.*_merge_archive tables are also live -- they
-- are the archive sink written by backend/scripts/dedupeInstitutions.js.
--
-- colleges_legacy (6,207 rows) is the one table verified to have ZERO code
-- references anywhere (rg over src, backend, scraper, ml, scripts) -- it is an
-- explicit leftover of the pre-canonical model, superseded by
-- canonical.institutions and public.colleges. Safe to move.
--
-- The larger win -- retiring the public.college* legacy model (~47MB) -- is
-- deliberately NOT done here: public.colleges is still queried at runtime by
-- College.js, Application.js, deadlines.js, signals.js, mlService.js and the
-- deadline schedulers. That requires a backend cutover to canonical first
-- (Batch D), which is a staged code migration, not a schema move.
--
-- ROLLBACK PLAN:
--   ALTER TABLE archive.colleges_legacy SET SCHEMA public;
--   -- (optionally) DROP SCHEMA archive;  -- only if it holds nothing else
-- Fully reversible; no data is dropped.
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS archive;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'colleges_legacy'
  ) THEN
    EXECUTE 'ALTER TABLE public.colleges_legacy SET SCHEMA archive';
    RAISE NOTICE 'moved public.colleges_legacy -> archive.colleges_legacy';
  ELSE
    RAISE NOTICE 'public.colleges_legacy not present; nothing to move';
  END IF;
END $$;
