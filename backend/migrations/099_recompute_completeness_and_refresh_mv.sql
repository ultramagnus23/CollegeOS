-- 099_recompute_completeness_and_refresh_mv.sql
-- M1: the completeness engine computed overall_score from only admissions+financials
--     (mean 75.7%) and reported outcomes_score=0 despite 6,061 outcome rows.
--     This recomputes all 8 domain scores from actual data presence.
-- H1: canonical.mv_college_cards was created WITH NO DATA and never refreshed.
--     After the 094-098 backfills, refresh it so the frontend contract returns rows.

CREATE OR REPLACE FUNCTION canonical.recompute_institution_completeness()
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO canonical.institution_completeness AS ic (
    institution_id, admissions_score, financials_score, outcomes_score,
    rankings_score, programs_score, demographics_score, requirements_score,
    deadlines_score, overall_score, score_breakdown, updated_at
  )
  SELECT
    i.id,
    COALESCE(adm.score, 0),
    COALESCE(fin.score, 0),
    COALESCE(out.score, 0),
    rnk.score,
    prg.score,
    dem.score,
    req.score,
    ddl.score,
    -- weighted overall (admissions/financials/outcomes carry the card).
    -- adm/fin/out come from LIMIT-1 laterals that yield NULL when absent.
    round((COALESCE(adm.score,0)*0.20 + COALESCE(fin.score,0)*0.20
         + COALESCE(out.score,0)*0.15 + rnk.score*0.10 + prg.score*0.15
         + dem.score*0.08 + req.score*0.07 + ddl.score*0.05)::numeric, 2),
    jsonb_build_object(
      'admissions', COALESCE(adm.score,0), 'financials', COALESCE(fin.score,0),
      'outcomes', COALESCE(out.score,0), 'rankings', rnk.score,
      'programs', prg.score, 'demographics', dem.score,
      'requirements', req.score, 'deadlines', ddl.score),
    now()
  FROM canonical.institutions i
  -- admissions: weight key card fields
  LEFT JOIN LATERAL (
    SELECT round(100 * (
      (a.acceptance_rate IS NOT NULL)::int*0.4 +
      (a.sat_50 IS NOT NULL OR a.act_50 IS NOT NULL)::int*0.3 +
      (a.test_optional IS NOT NULL)::int*0.3)::numeric, 2) AS score
    FROM canonical.institution_admissions a
    WHERE a.institution_id = i.id
    ORDER BY a.data_year DESC NULLS LAST LIMIT 1) adm ON true
  LEFT JOIN LATERAL (
    SELECT round(100 * (
      (f.tuition_international IS NOT NULL OR f.tuition_out_state IS NOT NULL)::int*0.4 +
      (f.cost_of_attendance IS NOT NULL)::int*0.3 +
      (f.avg_financial_aid IS NOT NULL OR f.avg_debt IS NOT NULL)::int*0.3)::numeric, 2) AS score
    FROM canonical.institution_financials f
    WHERE f.institution_id = i.id
    ORDER BY f.data_year DESC NULLS LAST LIMIT 1) fin ON true
  LEFT JOIN LATERAL (
    SELECT round(100 * (
      (o.graduation_rate_4yr IS NOT NULL OR o.graduation_rate_6yr IS NOT NULL)::int*0.4 +
      (o.median_start_salary IS NOT NULL)::int*0.4 +
      (o.employment_rate IS NOT NULL OR o.retention_rate IS NOT NULL)::int*0.2)::numeric, 2) AS score
    FROM canonical.institution_outcomes o
    WHERE o.institution_id = i.id
    ORDER BY o.data_year DESC NULLS LAST LIMIT 1) out ON true
  LEFT JOIN LATERAL (
    SELECT (count(*) > 0)::int * 100 AS score
    FROM canonical.institution_rankings r WHERE r.institution_id = i.id) rnk ON true
  LEFT JOIN LATERAL (
    SELECT LEAST(count(*), 30) * 100.0 / 30 AS score   -- 30+ majors = full (Phase 4 target)
    FROM canonical.institution_programs p WHERE p.institution_id = i.id) prg ON true
  LEFT JOIN LATERAL (
    SELECT (count(*) > 0)::int * 100 AS score
    FROM canonical.institution_demographics d WHERE d.institution_id = i.id) dem ON true
  LEFT JOIN LATERAL (
    SELECT (count(*) > 0)::int * 100 AS score
    FROM canonical.institution_requirements rq WHERE rq.institution_id = i.id) req ON true
  LEFT JOIN LATERAL (
    SELECT (count(*) > 0)::int * 100 AS score
    FROM canonical.institution_deadlines dl WHERE dl.institution_id = i.id) ddl ON true
  ON CONFLICT (institution_id) DO UPDATE SET
    admissions_score   = EXCLUDED.admissions_score,
    financials_score   = EXCLUDED.financials_score,
    outcomes_score     = EXCLUDED.outcomes_score,
    rankings_score     = EXCLUDED.rankings_score,
    programs_score     = EXCLUDED.programs_score,
    demographics_score = EXCLUDED.demographics_score,
    requirements_score = EXCLUDED.requirements_score,
    deadlines_score    = EXCLUDED.deadlines_score,
    overall_score      = EXCLUDED.overall_score,
    score_breakdown    = EXCLUDED.score_breakdown,
    updated_at         = now();
$$;

SELECT canonical.recompute_institution_completeness();

-- Mirror the recomputed overall score onto institutions.completeness_score.
UPDATE canonical.institutions i
SET completeness_score = ic.overall_score
FROM canonical.institution_completeness ic
WHERE ic.institution_id = i.id
  AND i.completeness_score IS DISTINCT FROM ic.overall_score;

-- H1: populate the frontend contract view (was WITH NO DATA since migration 083).
REFRESH MATERIALIZED VIEW canonical.mv_college_cards;
