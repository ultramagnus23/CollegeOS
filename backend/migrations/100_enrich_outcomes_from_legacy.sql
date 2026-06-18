-- 100_enrich_outcomes_from_legacy.sql
-- H3: canonical.institution_outcomes has graduation_rate_4yr / employment_rate /
-- retention_rate at 100% NULL. public.academic_details holds these per college.
-- SCALE: academic_details rates are FRACTIONS (0-1); canonical stores PERCENT
-- (0-100), so multiply by 100 and clamp. Fill NULLs only (never overwrite).
-- Updates the latest-year outcomes row per institution (the row the MV reads).

WITH latest AS (
  SELECT DISTINCT ON (institution_id) id, institution_id
  FROM canonical.institution_outcomes
  ORDER BY institution_id, data_year DESC NULLS LAST, updated_at DESC NULLS LAST
),
src AS (
  SELECT DISTINCT ON (idm.institution_id)
    idm.institution_id,
    LEAST(GREATEST(round((ad.graduation_rate_4yr * 100)::numeric, 3), 0), 100) AS g4,
    LEAST(GREATEST(round((ad.graduation_rate_6yr * 100)::numeric, 3), 0), 100) AS g6,
    LEAST(GREATEST(round((ad.retention_rate     * 100)::numeric, 3), 0), 100) AS ret,
    LEAST(GREATEST(round((ad.pct_employed_2yr   * 100)::numeric, 3), 0), 100) AS emp,
    ad.median_salary_6yr  AS sal_start,
    ad.median_salary_10yr AS sal_mid
  FROM public.academic_details ad
  JOIN canonical.institution_identity_map idm
    ON idm.source_table = 'public.colleges_comprehensive'
   AND idm.source_pk = ad.college_id::text
   AND idm.is_canonical_match = true
  ORDER BY idm.institution_id, ad.data_year DESC NULLS LAST
)
UPDATE canonical.institution_outcomes o
SET
  graduation_rate_4yr      = COALESCE(o.graduation_rate_4yr, src.g4),
  graduation_rate_6yr      = COALESCE(o.graduation_rate_6yr, src.g6),
  retention_rate           = COALESCE(o.retention_rate, src.ret),
  employment_rate          = COALESCE(o.employment_rate, src.emp),
  median_start_salary      = COALESCE(o.median_start_salary, src.sal_start),
  median_mid_career_salary = COALESCE(o.median_mid_career_salary, src.sal_mid),
  source_attribution = o.source_attribution || jsonb_build_object(
    'h3_outcomes_enrichment', jsonb_build_object(
      'source', 'IPEDS/Scorecard',
      'source_table', 'public.academic_details',
      'confidence', 0.85,
      'last_verified_at', now())),
  updated_at = now()
FROM latest, src
WHERE o.id = latest.id
  AND latest.institution_id = src.institution_id
  -- only touch rows where we actually fill at least one NULL
  AND (o.graduation_rate_4yr IS NULL OR o.retention_rate IS NULL
       OR o.employment_rate IS NULL OR o.median_mid_career_salary IS NULL
       OR o.graduation_rate_6yr IS NULL OR o.median_start_salary IS NULL);
