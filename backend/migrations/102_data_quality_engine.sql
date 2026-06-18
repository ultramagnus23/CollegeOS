-- 102_data_quality_engine.sql
-- Phase 9: data-quality engine. Scans the canonical layer for impossible values
-- and missing-data gaps, classifies HIGH/MEDIUM/LOW, and records daily snapshots.
-- Scales (from audit): institution_admissions.acceptance_rate is a FRACTION 0-1;
-- institution_outcomes.* rates are PERCENT 0-100.

-- 1) History of quality runs (provenance: every snapshot timestamped).
CREATE TABLE IF NOT EXISTS canonical.data_quality_snapshots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  severity      text NOT NULL,
  category      text NOT NULL,
  issue_count   integer NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS data_quality_snapshots_idx_captured
  ON canonical.data_quality_snapshots (captured_at DESC);

-- 2) Row-level issue detector. Returns one row per (institution, issue).
CREATE OR REPLACE FUNCTION canonical.fn_data_quality_issues()
RETURNS TABLE (
  institution_id uuid,
  canonical_name text,
  severity       text,
  category       text,
  field          text,
  detail         text
)
LANGUAGE sql STABLE AS $$
  -- ---- IMPOSSIBLE VALUES (always HIGH) ----
  SELECT a.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'acceptance_rate',
         'acceptance_rate out of [0,1]: ' || a.acceptance_rate
  FROM canonical.institution_admissions a JOIN canonical.institutions i ON i.id = a.institution_id
  WHERE a.acceptance_rate IS NOT NULL AND (a.acceptance_rate < 0 OR a.acceptance_rate > 1)
  UNION ALL
  SELECT o.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'graduation_rate_4yr',
         'graduation_rate_4yr out of [0,100]: ' || o.graduation_rate_4yr
  FROM canonical.institution_outcomes o JOIN canonical.institutions i ON i.id = o.institution_id
  WHERE o.graduation_rate_4yr IS NOT NULL AND (o.graduation_rate_4yr < 0 OR o.graduation_rate_4yr > 100)
  UNION ALL
  SELECT o.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'median_start_salary',
         'median_start_salary negative: ' || o.median_start_salary
  FROM canonical.institution_outcomes o JOIN canonical.institutions i ON i.id = o.institution_id
  WHERE o.median_start_salary IS NOT NULL AND o.median_start_salary < 0
  UNION ALL
  SELECT f.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'cost_of_attendance',
         'cost_of_attendance negative: ' || f.cost_of_attendance
  FROM canonical.institution_financials f JOIN canonical.institutions i ON i.id = f.institution_id
  WHERE f.cost_of_attendance IS NOT NULL AND f.cost_of_attendance < 0
  UNION ALL
  SELECT r.institution_id, i.canonical_name, 'HIGH', 'impossible_value', 'global_rank',
         'rank < 1: ' || COALESCE(r.global_rank, r.national_rank)
  FROM canonical.institution_rankings r JOIN canonical.institutions i ON i.id = r.institution_id
  WHERE COALESCE(r.global_rank, r.national_rank) IS NOT NULL
    AND COALESCE(r.global_rank, r.national_rank) < 1

  -- ---- MISSING CRITICAL DATA (HIGH: card looks broken) ----
  UNION ALL
  SELECT i.id, i.canonical_name, 'HIGH', 'missing_majors', 'institution_programs',
         'no programs/majors rows'
  FROM canonical.institutions i
  WHERE NOT EXISTS (SELECT 1 FROM canonical.institution_programs p WHERE p.institution_id = i.id)
  UNION ALL
  SELECT i.id, i.canonical_name, 'MEDIUM', 'missing_deadlines', 'institution_deadlines',
         'no deadlines rows'
  FROM canonical.institutions i
  WHERE NOT EXISTS (SELECT 1 FROM canonical.institution_deadlines d WHERE d.institution_id = i.id)
  UNION ALL
  SELECT i.id, i.canonical_name, 'MEDIUM', 'missing_acceptance_rate', 'acceptance_rate',
         'no non-null acceptance_rate'
  FROM canonical.institutions i
  WHERE NOT EXISTS (
    SELECT 1 FROM canonical.institution_admissions a
    WHERE a.institution_id = i.id AND a.acceptance_rate IS NOT NULL)

  -- ---- MISSING ENRICHMENT (LOW) ----
  UNION ALL
  SELECT i.id, i.canonical_name, 'LOW', 'missing_rankings', 'institution_rankings',
         'no rankings rows'
  FROM canonical.institutions i
  WHERE NOT EXISTS (SELECT 1 FROM canonical.institution_rankings r WHERE r.institution_id = i.id)
  UNION ALL
  SELECT i.id, i.canonical_name, 'LOW', 'missing_outcomes', 'institution_outcomes',
         'no graduation/salary outcomes'
  FROM canonical.institutions i
  WHERE NOT EXISTS (
    SELECT 1 FROM canonical.institution_outcomes o
    WHERE o.institution_id = i.id
      AND (o.graduation_rate_4yr IS NOT NULL OR o.graduation_rate_6yr IS NOT NULL
           OR o.median_start_salary IS NOT NULL));
$$;

-- 3) Aggregate summary view (category x severity counts).
CREATE OR REPLACE VIEW canonical.v_data_quality_summary AS
  SELECT severity, category, count(*) AS issue_count
  FROM canonical.fn_data_quality_issues()
  GROUP BY severity, category
  ORDER BY
    CASE severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
    issue_count DESC;

-- 4) Record a point-in-time snapshot into history.
CREATE OR REPLACE FUNCTION canonical.fn_snapshot_data_quality()
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE total integer;
BEGIN
  INSERT INTO canonical.data_quality_snapshots (severity, category, issue_count)
  SELECT severity, category, issue_count FROM canonical.v_data_quality_summary;
  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END;
$$;
