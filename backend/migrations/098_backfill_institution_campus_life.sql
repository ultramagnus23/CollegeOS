-- 098_backfill_institution_campus_life.sql
-- H2 backfill (PARTIAL): public.campus_life (8,552 rows) is detailed on greek
-- life / dining / weather, but canonical.institution_campus_life wants
-- safety / satisfaction / cost-of-living / athletics. Only housing_guarantee
-- maps cleanly; full source row stashed in raw_payload for later extraction.
-- Remaining target fields are a GENUINE GAP (see missing_data_report.md §7).

CREATE UNIQUE INDEX IF NOT EXISTS institution_campus_life_uq_inst
  ON canonical.institution_campus_life (institution_id);

INSERT INTO canonical.institution_campus_life (
  institution_id,
  housing_guarantee,
  climate_zone,
  source_attribution,
  raw_payload
)
SELECT DISTINCT ON (idm.institution_id)
  idm.institution_id,
  CASE WHEN cl.housing_guarantee IS TRUE THEN 'guaranteed'
       WHEN cl.housing_guarantee IS FALSE THEN 'not_guaranteed' END,
  cl.weather_description,
  jsonb_build_object(
    'source', 'manual',
    'source_table', 'public.campus_life',
    'confidence', 0.60,
    'last_verified_at', now(),
    'note', 'partial map; safety/satisfaction/cost-of-living not sourced'
  ),
  to_jsonb(cl.*)
FROM public.campus_life cl
JOIN canonical.institution_identity_map idm
  ON idm.source_table = 'public.colleges_comprehensive'
 AND idm.source_pk = cl.college_id::text
 AND idm.is_canonical_match = true
ORDER BY idm.institution_id, cl.id
ON CONFLICT (institution_id) DO NOTHING;
