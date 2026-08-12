-- 158_purge_test_documents_tasks_and_archive_dead_tables.sql
-- ----------------------------------------------------------------------------
-- Scope cut 2026-08-08: narrows CollegeOS to one product loop (search
-- institutions -> see a calibrated admission chance -> track real upcoming
-- deadlines). Two independent changes, both reversible.
--
-- PART 1 — purge synthetic test-account rows from documents/tasks
-- -----------------------------------------------------------------
-- The Documents and Tasks UI/routes were archived (see
-- archive/documents-tasks-admin-essays-2026-08-08) but public.documents and
-- public.tasks are NOT dropped here -- user_id 247 is a real account with 42
-- documents and 70 tasks that must survive this migration untouched.
--
-- Only rows belonging to two synthetic E2E test accounts are removed:
--   user_id 401 (e2e_ml_...@collegeos-test.com)
--   user_id 405 (uipass...@collegeos-test.com)
--
-- A full pre-deletion export of ALL THREE users' rows (including 247's, which
-- are NOT deleted) lives at
-- archive-data/documents_tasks_export_2026-08-08.json on the archive branch
-- above -- that is the restore path if 401/405 are ever needed again (e.g. to
-- re-seed an E2E suite).
--
-- ROLLBACK PLAN: replay the relevant rows for user_id 401/405 from
-- archive-data/documents_tasks_export_2026-08-08.json as INSERTs. No schema
-- was changed, so this is a pure data restore.
-- ----------------------------------------------------------------------------

DELETE FROM public.documents WHERE user_id IN (401, 405);
DELETE FROM public.tasks WHERE user_id IN (401, 405);

-- PART 2 — archive confirmed-dead-in-production operational tables
-- -----------------------------------------------------------------
-- Following the ALTER TABLE ... SET SCHEMA archive convention from
-- 150_archive_schema_and_colleges_legacy.sql (fully reversible, zero data
-- dropped) rather than DROP TABLE.
--
-- Verified before this migration (by grep + reading render.yaml's live env
-- config, not by row count alone):
--   ml_metadata        - read only by routes/ml.js's /stats route, which has
--                         ZERO frontend callers (grep for api.ml.*stats found
--                         nothing). 0 rows.
--   chance_me_posts    - read only by the now-deleted routes/admin.js. No
--                         writer anywhere in the JS or Python codebase. 0 rows.
--   scraper_logs       - written only by jobs/scraperScheduler.js, which only
--                         starts if ENABLE_LEGACY_SCRAPERS==='true' (app.js) --
--                         unset in render.yaml, so it does not run in
--                         production today. 0 rows, consistent with a
--                         non-running writer.
--   scraper_run_logs   - written only by scraper/pipeline.py and
--                         scraper/orchestrator_worker.py, neither of which is
--                         invoked by any current .github/workflows/*.yml.
--                         16 rows, last write 2026-06-08 (orphaned writer).
--
-- NOT included, deliberately: prediction_logs. routes/chancing.js -- part of
-- the core loop this cut is protecting, not archiving -- unconditionally
-- mounted (app.js) and writes a row to prediction_logs on every real chancing
-- prediction (INSERT INTO prediction_logs), then reads it back for
-- calibration. It is 0 rows only because chancing is thin-used, not because
-- the write path is dead. Moving it would make every chancing prediction
-- throw. Left untouched in public.
--
-- ROLLBACK PLAN:
--   ALTER TABLE archive.ml_metadata SET SCHEMA public;
--   ALTER TABLE archive.chance_me_posts SET SCHEMA public;
--   ALTER TABLE archive.scraper_logs SET SCHEMA public;
--   ALTER TABLE archive.scraper_run_logs SET SCHEMA public;
-- Fully reversible; no data is dropped (scraper_run_logs' 16 rows move with it).
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS archive;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ml_metadata') THEN
    EXECUTE 'ALTER TABLE public.ml_metadata SET SCHEMA archive';
    RAISE NOTICE 'moved public.ml_metadata -> archive.ml_metadata';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chance_me_posts') THEN
    EXECUTE 'ALTER TABLE public.chance_me_posts SET SCHEMA archive';
    RAISE NOTICE 'moved public.chance_me_posts -> archive.chance_me_posts';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scraper_logs') THEN
    EXECUTE 'ALTER TABLE public.scraper_logs SET SCHEMA archive';
    RAISE NOTICE 'moved public.scraper_logs -> archive.scraper_logs';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scraper_run_logs') THEN
    EXECUTE 'ALTER TABLE public.scraper_run_logs SET SCHEMA archive';
    RAISE NOTICE 'moved public.scraper_run_logs -> archive.scraper_run_logs';
  END IF;
END $$;
