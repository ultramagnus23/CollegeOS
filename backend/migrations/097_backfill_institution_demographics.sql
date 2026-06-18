-- 097_backfill_institution_demographics.sql
-- H2 backfill: canonical.institution_demographics is empty while
-- public.student_demographics holds 6,323 rows. Source: IPEDS (tier 2).
-- Residual gaps (first_gen, legacy, athlete, transfer %) left NULL -> Phase 5.

CREATE UNIQUE INDEX IF NOT EXISTS institution_demographics_uq_inst_year
  ON canonical.institution_demographics (institution_id, data_year_key);

INSERT INTO canonical.institution_demographics (
  institution_id,
  data_year,
  percent_international,
  gender_ratio,
  ethnic_distribution,
  socioeconomic_index,
  source_attribution
)
SELECT
  idm.institution_id,
  sd.data_year,
  sd.percent_international,
  CASE
    WHEN sd.percent_male IS NOT NULL AND sd.percent_female IS NOT NULL
    THEN round(sd.percent_male::numeric)::text || ':' || round(sd.percent_female::numeric)::text
  END,
  jsonb_strip_nulls(jsonb_build_object(
    'white',            sd.percent_white,
    'black',            sd.percent_black,
    'hispanic',         sd.percent_hispanic,
    'asian',            sd.percent_asian,
    'native_american',  sd.percent_native_american,
    'pacific_islander', sd.percent_pacific_islander,
    'multiracial',      sd.percent_multiracial,
    'unknown',          sd.percent_unknown_race
  )),
  sd.socioeconomic_diversity_score,
  jsonb_build_object(
    'source', 'IPEDS',
    'source_table', 'public.student_demographics',
    'confidence', 0.85,
    'last_verified_at', now()
  )
FROM public.student_demographics sd
JOIN canonical.institution_identity_map idm
  ON idm.source_table = 'public.colleges_comprehensive'
 AND idm.source_pk = sd.college_id::text
 AND idm.is_canonical_match = true
ON CONFLICT (institution_id, data_year_key) DO NOTHING;
