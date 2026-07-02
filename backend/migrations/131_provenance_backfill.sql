-- 131_provenance_backfill.sql
-- ----------------------------------------------------------------------------
-- Backfills verification_status (added schema-only in migration 130) for
-- EXISTING rows, using the classification rules already worked out during this
-- session's audits (docs/data_audit_report.md, docs/acceptance_rate_recovery.md,
-- docs/data_provenance_design.md). Every rule below is grounded in a real,
-- previously-verified pattern - nothing here guesses a row's provenance from
-- scratch. Rows that don't match a confident rule are left at the 'unknown'
-- default rather than optimistically classified.
-- ----------------------------------------------------------------------------

-- Rule 1: college_scorecard-sourced rows -> real US Dept of Education data.
UPDATE canonical.institution_financials
SET verification_status = 'government_verified', last_verified_at = COALESCE(last_verified_at, updated_at)
WHERE source_attribution->>'source' = 'college_scorecard' AND verification_status = 'unknown';

-- Rule 2: nested h3_financials_enrichment provenance (IPEDS/Scorecard via
-- public.college_financial_aid) -> real, just structured one level deeper.
UPDATE canonical.institution_financials
SET verification_status = 'government_verified', last_verified_at = COALESCE(last_verified_at, updated_at)
WHERE source_attribution->'h3_financials_enrichment'->>'source' = 'IPEDS/Scorecard' AND verification_status = 'unknown';

-- Rule 3: confirmed-fabricated manual_seed rows (nulled_reason already tagged
-- in the original session's cleanup) -> deprecated, not unknown, so a future
-- query can distinguish "known bad, already nulled" from "never checked".
UPDATE canonical.institution_financials
SET verification_status = 'deprecated', last_verified_at = COALESCE(last_verified_at, updated_at)
WHERE source_attribution->>'nulled_reason' = 'unverified_manual_seed_placeholder' AND verification_status = 'unknown';

UPDATE canonical.institution_admissions
SET verification_status = 'deprecated', last_verified_at = COALESCE(last_verified_at, updated_at)
WHERE source_attribution->>'source' = 'manual_seed'
  AND source_attribution->>'restored_from' IS NULL  -- exclude the 218 rows we already confirmed real and restored
  AND verification_status = 'unknown';

-- Rule 4: manual_seed rows we CONFIRMED real and restored this session
-- (acceptance_rate_recovery.md) -> imported (developer-curated from a real
-- external source at migration-authoring time, not a live scrape).
UPDATE canonical.institution_admissions
SET verification_status = 'imported', last_verified_at = COALESCE(last_verified_at, updated_at)
WHERE source_attribution->>'restored_from' IN ('migration_129_source_reparse', 'migration_129_boundary_case_reparse')
  AND verification_status = 'unknown';

UPDATE canonical.institution_admissions
SET verification_status = 'imported', last_verified_at = COALESCE(last_verified_at, updated_at)
WHERE source_attribution->>'restored_from' = 'raw_payload.acceptance_rate'
  AND verification_status = 'unknown';

-- Rule 5: rows this session tagged with a real government/scraped source going
-- forward (nces_ipeds.py, nirf.py, india_comprehensive.py, cwur_*, qs_*,
-- usnews_rankings.py, wikidata_enrich.py) already set verification_status
-- explicitly on write - no backfill needed for those, they're not 'unknown'.

-- Everything else (empty {} source_attribution, no nulled_reason, no
-- restored_from tag) stays 'unknown' - correct, since there is no confident
-- signal to classify it from, per this session's "never optimistically guess
-- provenance" standard.
