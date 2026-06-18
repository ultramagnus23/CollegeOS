-- 108_normalize_country_codes.sql
-- DATA QUALITY: canonical.institutions.country_code mixes ISO-3166 alpha-2 codes
-- (US, GB, IN, DE, FR, IE, NL) with full names (CANADA, SOUTH KOREA, AUSTRALIA,
-- ...). This broke country filtering in search (passing 'CA' matched nothing).
-- Normalize the nine full-name values to their ISO-2 codes, then refresh the
-- card MV and rebuild the search index so downstream consumers see ISO codes.
-- Idempotent: re-running only affects rows still holding a full name.

UPDATE canonical.institutions AS i
SET country_code = m.iso
FROM (VALUES
  ('SOUTH KOREA', 'KR'),
  ('CANADA',      'CA'),
  ('AUSTRALIA',   'AU'),
  ('SWITZERLAND', 'CH'),
  ('JAPAN',       'JP'),
  ('SWEDEN',      'SE'),
  ('NEW ZEALAND', 'NZ'),
  ('SINGAPORE',   'SG'),
  ('HONG KONG',   'HK')
) AS m(name, iso)
WHERE upper(btrim(i.country_code)) = m.name;

-- Cards derive country_code from institutions; refresh so filters see ISO codes.
REFRESH MATERIALIZED VIEW canonical.mv_college_cards;

-- Rebuild the search corpus so searchable_json country_code is consistent.
SELECT canonical.rebuild_institution_search_index();
