-- 109_populate_quality_scores.sql
-- QUALITY SYSTEM: canonical.institution_quality_scores was empty (0 rows). This
-- defines a transparent, rerunnable recompute that derives each score from data
-- ALREADY present (no fabrication, no external calls):
--   coverage     <- institution_completeness.overall_score (ranking/major/salary/
--                   deadline/requirement coverage, already computed by mig 099)
--   lineage      <- how many of the 8 data sections are populated (source breadth)
--   freshness    <- recency of institutions.updated_at
--   consistency  <- 100 minus penalties for impossible values (rates/salary)
--   conflict     <- 100 (deadline/requirement conflict_status; none present yet)
--   final        <- 0.45*coverage + 0.20*lineage + 0.20*freshness + 0.15*consistency
-- Upsert keyed on the institution_id PK; safe to re-run (= repair_missing_quality).

CREATE OR REPLACE FUNCTION canonical.recompute_quality_scores()
RETURNS integer
LANGUAGE plpgsql
SET search_path = canonical, public
AS $$
DECLARE n integer;
BEGIN
  WITH comp AS (
    SELECT i.id,
           i.updated_at,
           COALESCE(c.overall_score, 0)::numeric AS coverage,
           ( (COALESCE(c.admissions_score,0)   > 0)::int
           + (COALESCE(c.financials_score,0)   > 0)::int
           + (COALESCE(c.outcomes_score,0)     > 0)::int
           + (COALESCE(c.rankings_score,0)     > 0)::int
           + (COALESCE(c.programs_score,0)     > 0)::int
           + (COALESCE(c.demographics_score,0) > 0)::int
           + (COALESCE(c.deadlines_score,0)    > 0)::int
           + (COALESCE(c.requirements_score,0) > 0)::int ) AS sections_present
    FROM canonical.institutions i
    LEFT JOIN canonical.institution_completeness c ON c.institution_id = i.id
  ),
  checks AS (
    SELECT
      cm.id,
      cm.coverage,
      cm.sections_present,
      LEAST(100, GREATEST(40,
        CASE
          WHEN extract(epoch FROM (now() - cm.updated_at)) / 86400 <= 90  THEN 100
          WHEN extract(epoch FROM (now() - cm.updated_at)) / 86400 >= 365 THEN 50
          ELSE 100 - (extract(epoch FROM (now() - cm.updated_at)) / 86400 - 90) * (50.0 / 275)
        END
      ))::numeric(5,2) AS freshness,
      (cm.sections_present * 100.0 / 8)::numeric(5,2) AS lineage,
      GREATEST(0, 100
        - CASE WHEN EXISTS (
            SELECT 1 FROM canonical.institution_admissions a
            WHERE a.institution_id = cm.id AND a.acceptance_rate IS NOT NULL
              AND (a.acceptance_rate < 0 OR a.acceptance_rate > 100)
          ) THEN 30 ELSE 0 END
        - CASE WHEN EXISTS (
            SELECT 1 FROM canonical.institution_outcomes o
            WHERE o.institution_id = cm.id AND (
                 (o.graduation_rate_6yr IS NOT NULL AND (o.graduation_rate_6yr < 0 OR o.graduation_rate_6yr > 100))
              OR (o.median_start_salary IS NOT NULL AND (o.median_start_salary <= 0 OR o.median_start_salary > 1000000))
            )
          ) THEN 20 ELSE 0 END
      )::numeric(5,2) AS consistency,
      100.0::numeric(5,2) AS conflict
    FROM comp cm
  )
  INSERT INTO canonical.institution_quality_scores AS qs
    (institution_id, consistency_score, freshness_score, lineage_score,
     conflict_score, final_quality_score, diagnostics, updated_at)
  SELECT
    id, consistency, freshness, lineage, conflict,
    round(0.45 * coverage + 0.20 * lineage + 0.20 * freshness + 0.15 * consistency, 2),
    jsonb_build_object(
      'coverage', round(coverage, 2),
      'lineage', lineage,
      'freshness', freshness,
      'consistency', consistency,
      'conflict', conflict,
      'sections_present', sections_present,
      'weights', jsonb_build_object('coverage', 0.45, 'lineage', 0.20, 'freshness', 0.20, 'consistency', 0.15),
      'computed_at', now()
    ),
    now()
  FROM checks
  ON CONFLICT (institution_id) DO UPDATE SET
    consistency_score   = EXCLUDED.consistency_score,
    freshness_score     = EXCLUDED.freshness_score,
    lineage_score       = EXCLUDED.lineage_score,
    conflict_score      = EXCLUDED.conflict_score,
    final_quality_score = EXCLUDED.final_quality_score,
    diagnostics         = EXCLUDED.diagnostics,
    updated_at          = now();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

SELECT canonical.recompute_quality_scores();
