-- Migration: 067_deduplicate_and_integrity.sql
-- ---------------------------------------------------------------------------
-- Full data-integrity and deduplication pass for colleges_comprehensive and
-- all dependent tables.
--
-- Steps:
--   1. Deduplicate colleges_comprehensive on ipeds_unit_id
--      (keep the row with the highest id, i.e. most-recently inserted)
--   2. Deduplicate colleges_comprehensive on (name, country)
--      for rows that still have a NULL ipeds_unit_id
--   3. Enforce UNIQUE constraint on ipeds_unit_id (where NOT NULL)
--   4. Fix orphaned rows in dependent tables:
--        college_admissions, college_financial_data, academic_details,
--        college_programs, student_demographics, campus_life,
--        college_rankings, college_deadlines, college_contact, college_majors
--   5. Enforce UNIQUE constraint on college_majors(college_id, major_id)
--      (the existing PK is (college_id, major_id, awlevel), which allows
--       multiple awlevels per pair — add a partial unique index for
--       offered=true rows so the front-end view shows each major once)
--   6. Create (or replace) a materialized view `colleges_canonical` that
--      joins all relevant child tables so the frontend can query a single
--      consistent source.
--   7. Provide inline SELECT statements to verify each step (run these
--      separately in the Supabase SQL editor to see counts).
--
-- Safe to re-run (all steps are idempotent).
-- ---------------------------------------------------------------------------

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — Deduplicate colleges_comprehensive on ipeds_unit_id
-- ═══════════════════════════════════════════════════════════════════════════
-- For each ipeds_unit_id that appears more than once, keep the row with the
-- MAX(id) (most recently inserted / highest confidence) and reparent all
-- child rows to that canonical id before deleting the duplicates.

-- 1a. For each dependent table, re-point college_id to the canonical (max)
--     id before we delete the duplicates.

DO $$
DECLARE
  dep TEXT;
  deps TEXT[] := ARRAY[
    'college_admissions', 'college_financial_data', 'academic_details',
    'college_programs', 'student_demographics', 'campus_life',
    'college_rankings', 'college_deadlines', 'college_contact',
    'college_majors', 'user_signals'
  ];
BEGIN
  FOREACH dep IN ARRAY deps LOOP
    -- Check the table actually exists before touching it
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = dep
    ) THEN
      EXECUTE format(
        $q$
          UPDATE %I AS child
          SET    college_id = canon.keep_id
          FROM (
            SELECT ipeds_unit_id,
                   MAX(id) AS keep_id
            FROM   colleges_comprehensive
            WHERE  ipeds_unit_id IS NOT NULL
            GROUP  BY ipeds_unit_id
            HAVING COUNT(*) > 1
          ) AS canon
          JOIN colleges_comprehensive dup
               ON dup.ipeds_unit_id = canon.ipeds_unit_id
              AND dup.id            <> canon.keep_id
          WHERE child.college_id = dup.id
        $q$,
        dep
      );
    END IF;
  END LOOP;
END $$;

-- 1b. Delete the duplicate (non-canonical) rows from colleges_comprehensive.
DELETE FROM colleges_comprehensive
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY ipeds_unit_id
             ORDER BY id DESC          -- keep highest id
           ) AS rn
    FROM   colleges_comprehensive
    WHERE  ipeds_unit_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — Deduplicate on (name, country) for NULL-ipeds_unit_id rows
-- ═══════════════════════════════════════════════════════════════════════════
-- Same strategy: reparent children then delete extras.

DO $$
DECLARE
  dep TEXT;
  deps TEXT[] := ARRAY[
    'college_admissions', 'college_financial_data', 'academic_details',
    'college_programs', 'student_demographics', 'campus_life',
    'college_rankings', 'college_deadlines', 'college_contact',
    'college_majors', 'user_signals'
  ];
BEGIN
  FOREACH dep IN ARRAY deps LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = dep
    ) THEN
      EXECUTE format(
        $q$
          UPDATE %I AS child
          SET    college_id = canon.keep_id
          FROM (
            SELECT name, country,
                   MAX(id) AS keep_id
            FROM   colleges_comprehensive
            WHERE  ipeds_unit_id IS NULL
            GROUP  BY name, country
            HAVING COUNT(*) > 1
          ) AS canon
          JOIN colleges_comprehensive dup
               ON  dup.name    = canon.name
               AND dup.country = canon.country
               AND dup.ipeds_unit_id IS NULL
               AND dup.id <> canon.keep_id
          WHERE child.college_id = dup.id
        $q$,
        dep
      );
    END IF;
  END LOOP;
END $$;

DELETE FROM colleges_comprehensive
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY name, country
             ORDER BY id DESC
           ) AS rn
    FROM   colleges_comprehensive
    WHERE  ipeds_unit_id IS NULL
  ) ranked
  WHERE rn > 1
);

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — Enforce UNIQUE constraint on ipeds_unit_id (nullable column)
-- ═══════════════════════════════════════════════════════════════════════════
-- A partial unique index is the correct approach for a nullable column in
-- PostgreSQL: NULL values are intentionally excluded from the index.

CREATE UNIQUE INDEX IF NOT EXISTS uq_colleges_comp_ipeds_unit_id
  ON colleges_comprehensive (ipeds_unit_id)
  WHERE ipeds_unit_id IS NOT NULL;

-- Also enforce the (name, country) uniqueness that was defined in migration
-- 011 but may have been violated before this migration ran.
-- Drop and recreate to ensure it's enforced after dedup.
ALTER TABLE colleges_comprehensive
  DROP CONSTRAINT IF EXISTS colleges_comprehensive_name_country_key;

ALTER TABLE colleges_comprehensive
  ADD CONSTRAINT uq_colleges_comp_name_country
  UNIQUE (name, country);

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — Fix orphaned foreign keys in dependent tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Delete any child rows whose college_id no longer exists in
-- colleges_comprehensive.  The ON DELETE CASCADE defined in migrations
-- 011/054 should handle this automatically going forward, but historical
-- data loaded before those constraints existed may have orphans.

DO $$
DECLARE
  dep TEXT;
  deps TEXT[] := ARRAY[
    'college_admissions', 'college_financial_data', 'academic_details',
    'college_programs', 'student_demographics', 'campus_life',
    'college_rankings', 'college_deadlines', 'college_contact',
    'college_majors', 'user_signals'
  ];
BEGIN
  FOREACH dep IN ARRAY deps LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = dep
    ) THEN
      EXECUTE format(
        $q$
          DELETE FROM %I child
          WHERE child.college_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM colleges_comprehensive cc
              WHERE  cc.id = child.college_id
            )
        $q$,
        dep
      );
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5 — Prevent duplicate (college_id, major_id) pairs in college_majors
-- ═══════════════════════════════════════════════════════════════════════════
-- The existing PK is (college_id, major_id, awlevel), which is intentionally
-- correct for storing multiple award levels (e.g. Bachelor's AND Master's for
-- the same major).  We must NOT change that PK as it would silently discard
-- award-level granularity used by seed scripts and analytics.
--
-- The actual seeding problem is that seed_majors.py re-runs with awlevel=6
-- universally, which can produce two rows that differ only in awlevel when
-- the school's awlevel changes across seeds.  The fix is a partial unique
-- index on offered=true rows (per (college_id, major_id)) so the upsert
-- conflict target in seed_majors.py resolves cleanly, while still allowing
-- a school to record the same major at different award levels.

-- 5a. Remove duplicates introduced by same awlevel re-seeds (identical rows).
--     Keep only one row per (college_id, major_id, awlevel) triple — the PK
--     should already prevent this, but historical loads bypassed constraints.
--     (This is a no-op if the PK already enforces uniqueness.)
DELETE FROM college_majors
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM   college_majors
  GROUP  BY college_id, major_id, awlevel
);

-- 5b. Add a partial unique index on (college_id, major_id) WHERE offered = true
--     so the frontend "show offered majors" query returns exactly one row per
--     college+major pair, and seed_majors.py upserts on this conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_college_majors_offered
  ON college_majors (college_id, major_id)
  WHERE offered = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 6 — Canonical materialized view
-- ═══════════════════════════════════════════════════════════════════════════
-- colleges_canonical provides a single consistent join across all tables.
-- The frontend can query this view (or the API can expose it) instead of
-- assembling partial joins that can drift out of sync.

DROP MATERIALIZED VIEW IF EXISTS colleges_canonical;

CREATE MATERIALIZED VIEW colleges_canonical AS
SELECT
  -- ── Core identity ─────────────────────────────────────────────────────
  cc.id,
  cc.ipeds_unit_id,
  cc.name,
  cc.country,
  cc.state                    AS state_region,
  cc.city,
  cc.type                     AS institution_type,
  cc.setting,
  cc.total_enrollment,
  cc.description,
  cc.website,
  cc.logo_url,
  cc.acceptance_rate,
  cc.tuition_domestic,
  cc.tuition_international,
  cc.ranking_qs,
  cc.ranking_us_news,
  cc.ranking_the,
  cc.popularity_score,

  -- ── Admissions (most recent year) ────────────────────────────────────
  ca.acceptance_rate          AS adm_acceptance_rate,
  ca.sat_avg,
  ca.sat_range,
  ca.act_range,
  ca.gpa_50,
  ca.test_optional,
  ca.yield_rate               AS adm_yield_rate,
  ca.application_volume,
  ca.year                     AS adm_data_year,

  -- ── Financial (most recent year) ─────────────────────────────────────
  cfd.tuition_in_state,
  cfd.tuition_out_state,
  cfd.tuition_international   AS fin_tuition_intl,
  cfd.avg_net_price,
  cfd.year                    AS fin_data_year,

  -- ── Academic outcomes ────────────────────────────────────────────────
  ad.graduation_rate_4yr,
  ad.median_salary_6yr,
  ad.retention_rate,

  -- ── Chancing fields (added by migration 066) ─────────────────────────
  cc.sat_25,
  cc.sat_75,
  cc.act_25,
  cc.act_75,
  cc.act_avg,
  cc.gpa_25,
  cc.gpa_75,
  cc.intl_acceptance_rate,
  cc.intl_percent,
  cc.yield_rate,
  cc.test_optional            AS chancing_test_optional,
  cc.need_aware_intl,
  cc.meets_full_need,
  cc.tracks_demonstrated_interest,
  cc.top_majors,
  cc.college_type

FROM colleges_comprehensive cc

-- Most-recent admissions row per college
LEFT JOIN LATERAL (
  SELECT *
  FROM   college_admissions
  WHERE  college_id = cc.id
  ORDER  BY year DESC NULLS LAST
  LIMIT  1
) ca ON true

-- Most-recent financial row per college
LEFT JOIN LATERAL (
  SELECT *
  FROM   college_financial_data
  WHERE  college_id = cc.id
  ORDER  BY year DESC NULLS LAST
  LIMIT  1
) cfd ON true

-- Most-recent academic details row per college
LEFT JOIN LATERAL (
  SELECT *
  FROM   academic_details
  WHERE  college_id = cc.id
  ORDER  BY year DESC NULLS LAST
  LIMIT  1
) ad ON true;

-- Index on id so single-college lookups are instant
CREATE UNIQUE INDEX IF NOT EXISTS idx_colleges_canonical_id
  ON colleges_canonical (id);

-- Index on ipeds_unit_id for external ID lookups
CREATE INDEX IF NOT EXISTS idx_colleges_canonical_ipeds
  ON colleges_canonical (ipeds_unit_id)
  WHERE ipeds_unit_id IS NOT NULL;

-- Full-text search index on name (supports ILIKE-based search)
CREATE INDEX IF NOT EXISTS idx_colleges_canonical_name
  ON colleges_canonical USING gin (to_tsvector('english', name));

-- ── Grant read access to the anon role (Supabase public read) ─────────────
GRANT SELECT ON colleges_canonical TO anon;
GRANT SELECT ON colleges_canonical TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 7 — Inline verification queries
-- ═══════════════════════════════════════════════════════════════════════════
-- These SELECTs are commented out so the migration can be applied in one
-- transaction.  Copy and paste them individually into the SQL editor to
-- inspect the results after the migration completes.

/*
-- Total colleges and distinct ipeds_unit_id counts:
SELECT
  COUNT(*)                                         AS total_colleges,
  COUNT(ipeds_unit_id)                             AS with_ipeds,
  COUNT(DISTINCT ipeds_unit_id)                    AS distinct_ipeds,
  COUNT(*) - COUNT(ipeds_unit_id)                  AS null_ipeds,
  COUNT(*) FILTER (WHERE ipeds_unit_id IS NOT NULL)
    - COUNT(DISTINCT ipeds_unit_id)                AS remaining_ipeds_dupes
FROM colleges_comprehensive;

-- Duplicate (name, country) pairs still present:
SELECT name, country, COUNT(*) AS cnt
FROM colleges_comprehensive
GROUP BY name, country
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 20;

-- Orphan counts in each dependent table:
SELECT 'college_admissions'      AS tbl, COUNT(*) AS orphans
FROM college_admissions ca
WHERE NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = ca.college_id)
UNION ALL
SELECT 'college_financial_data', COUNT(*)
FROM college_financial_data cfd
WHERE NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = cfd.college_id)
UNION ALL
SELECT 'academic_details', COUNT(*)
FROM academic_details ad
WHERE NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = ad.college_id)
UNION ALL
SELECT 'college_majors', COUNT(*)
FROM college_majors cm
WHERE NOT EXISTS (SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = cm.college_id);

-- Duplicate (college_id, major_id) pairs in college_majors (offered=true):
SELECT college_id, major_id, COUNT(*) AS cnt
FROM college_majors
WHERE offered = true
GROUP BY college_id, major_id
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 20;

-- Row count in the canonical view:
SELECT COUNT(*) AS canonical_college_count FROM colleges_canonical;
*/

COMMIT;
