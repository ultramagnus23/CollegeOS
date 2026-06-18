-- 111_record_superseded_migrations.sql
-- BOOT HYGIENE: the startup migration runner re-executes every file not present in
-- the `migrations` ledger. 29 legacy/pre-canonical files (the old colleges schema,
-- SQLite-era FTS, majors, plus the canonical rebuild itself) were applied out-of-band
-- and never recorded, so on every boot they re-run and FAIL on non-idempotent
-- statements ("pragma_table_info does not exist", "column ... does not exist",
-- "cannot change return type") — ~30 errors and ~50s added to startup. The live
-- schema already reflects them (the app runs, canonical.* + legacy public.* exist),
-- so this records them as applied to stop the retry/failure loop.
--
-- Fresh-DB safe: on a clean database these files run normally first (creating the
-- tables), then this INSERT is a redundant no-op (ON CONFLICT DO NOTHING).

INSERT INTO public.migrations (filename) VALUES
  ('001_create_colleges.sql'),
  ('005_unified_colleges_schema.sql'),
  ('011_comprehensive_college_schema.sql'),
  ('012_normalized_majors.sql'),
  ('016_expand_demographics.sql'),
  ('018_academic_details.sql'),
  ('023_college_os_core_schema.sql'),
  ('025_populate_majors.sql'),
  ('026_populate_major_categories.sql'),
  ('027_fix_fts_and_major_categories.sql'),
  ('030_master_majors_system.sql'),
  ('033_auto_deadline_essay_system.sql'),
  ('034_deadline_scraping.sql'),
  ('035_auth_refresh_tokens.sql'),
  ('039_postgres_fts.sql'),
  ('040_currency_rates.sql'),
  ('042_fts_weighted_search.sql'),
  ('045_funding_sources.sql'),
  ('047_search_rpc.sql'),
  ('058_grade_gender_essay_scholarships.sql'),
  ('059_financial_aid_intelligence.sql'),
  ('067_deduplicate_and_integrity.sql'),
  ('071_ml_pipeline_columns.sql'),
  ('076_canonical_college_perf_indexes.sql'),
  ('077_additional_canonical_perf_indexes.sql'),
  ('079_migration_0_0_canonical_rebuild.sql'),
  ('080_intelligence_platform_foundation.sql'),
  ('084_indian_intelligence_ingestion.sql'),
  ('087_college_id_compatibility.sql')
ON CONFLICT (filename) DO NOTHING;
