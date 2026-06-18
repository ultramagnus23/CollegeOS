-- 101_enrich_financials_from_legacy.sql
-- H3: canonical.institution_financials has avg_financial_aid + net_price_* at
-- 100% NULL. public.college_financial_aid holds aid package + net-price brackets;
-- public.academic_details holds median_debt. All are USD integers (no scaling).
-- Fill NULLs only (never overwrite). Updates latest-year financials row per inst.

WITH latest AS (
  SELECT DISTINCT ON (institution_id) id, institution_id
  FROM canonical.institution_financials
  ORDER BY institution_id, data_year DESC NULLS LAST, updated_at DESC NULLS LAST
),
aid AS (
  SELECT DISTINCT ON (idm.institution_id)
    idm.institution_id,
    cfa.avg_financial_aid_package AS avg_aid,
    cfa.avg_net_price_0_30k       AS np_low,
    cfa.avg_net_price_48_75k      AS np_mid,
    cfa.avg_net_price_110k_plus   AS np_high
  FROM public.college_financial_aid cfa
  JOIN canonical.institution_identity_map idm
    ON idm.source_table = 'public.colleges_comprehensive'
   AND idm.source_pk = cfa.college_id::text
   AND idm.is_canonical_match = true
  ORDER BY idm.institution_id, cfa.academic_year DESC NULLS LAST
),
debt AS (
  SELECT DISTINCT ON (idm.institution_id)
    idm.institution_id,
    ad.median_debt AS avg_debt
  FROM public.academic_details ad
  JOIN canonical.institution_identity_map idm
    ON idm.source_table = 'public.colleges_comprehensive'
   AND idm.source_pk = ad.college_id::text
   AND idm.is_canonical_match = true
  WHERE ad.median_debt IS NOT NULL
  ORDER BY idm.institution_id, ad.data_year DESC NULLS LAST
)
UPDATE canonical.institution_financials f
SET
  avg_financial_aid     = COALESCE(f.avg_financial_aid, aid.avg_aid),
  net_price_low_income  = COALESCE(f.net_price_low_income, aid.np_low),
  net_price_mid_income  = COALESCE(f.net_price_mid_income, aid.np_mid),
  net_price_high_income = COALESCE(f.net_price_high_income, aid.np_high),
  avg_debt              = COALESCE(f.avg_debt, debt.avg_debt),
  source_attribution = f.source_attribution || jsonb_build_object(
    'h3_financials_enrichment', jsonb_build_object(
      'source', 'IPEDS/Scorecard',
      'source_table', 'public.college_financial_aid + academic_details',
      'confidence', 0.85,
      'last_verified_at', now())),
  updated_at = now()
FROM latest
LEFT JOIN aid  ON aid.institution_id  = latest.institution_id
LEFT JOIN debt ON debt.institution_id = latest.institution_id
WHERE f.id = latest.id
  AND (aid.institution_id IS NOT NULL OR debt.institution_id IS NOT NULL)
  AND (f.avg_financial_aid IS NULL OR f.net_price_low_income IS NULL
       OR f.net_price_mid_income IS NULL OR f.net_price_high_income IS NULL
       OR f.avg_debt IS NULL);
