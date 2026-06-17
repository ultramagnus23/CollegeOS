BEGIN;

DROP VIEW IF EXISTS public.clean_colleges;

CREATE OR REPLACE VIEW public.clean_colleges AS
SELECT
  cc.id,
  cc.name,
  cc.country,
  COALESCE(cc.state, cc.state_region) AS state,
  cc.city,
  cc.website_url AS official_website,
  cc.institution_type,
  cc.latitude,
  cc.longitude,
  cc.logo_url,
  cc.description,
  cc.top_majors,
  cc.total_enrollment,
  cc.undergraduate_enrollment,
  cc.popularity_score,
  cc.need_aware_intl,
  cc.meets_full_need
FROM public.colleges_comprehensive cc
WHERE cc.name IS NOT NULL
  AND cc.country IS NOT NULL;

GRANT SELECT ON public.clean_colleges TO anon;
GRANT SELECT ON public.clean_colleges TO authenticated;

DROP TABLE IF EXISTS public.colleges_backup_before_merge;
DROP TABLE IF EXISTS public.colleges_comprehensive_backup_before_merge;
DROP TABLE IF EXISTS public.colleges_v2;
DROP TABLE IF EXISTS public."_stg_Comprehensive";

COMMIT;
