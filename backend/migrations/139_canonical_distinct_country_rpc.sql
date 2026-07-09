-- 139_canonical_distinct_country_rpc.sql
--
-- Fixes the "United States missing from the country filter" bug: the frontend
-- (src/lib/collegeService.ts getDistinctCountries) sampled up to 1000 raw rows
-- from canonical.mv_college_cards with NO ORDER BY, then deduped client-side.
-- With ~6,237 of 8,500 institutions being US and the underlying composite
-- index ordering scans by country_code, an unordered LIMIT 1000 scan can
-- exhaust its budget on alphabetically-earlier countries (DE+FR+GB+IN+KR alone
-- already sum past 1000 rows) before ever reaching a US row.
--
-- The legacy get_distinct_countries()/get_distinct_states() RPCs (migration
-- 047) query the OLD colleges_comprehensive table, not canonical -- unusable
-- here. This adds canonical-schema equivalents that do a real SELECT DISTINCT
-- server-side (no row sampling, no client-side dedup needed).

CREATE OR REPLACE FUNCTION canonical.get_distinct_country_codes()
RETURNS TABLE (country_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = canonical, public
AS $$
  SELECT DISTINCT country_code
  FROM canonical.mv_college_cards
  WHERE country_code IS NOT NULL
  ORDER BY country_code;
$$;

CREATE OR REPLACE FUNCTION canonical.get_distinct_state_regions()
RETURNS TABLE (state_region text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = canonical, public
AS $$
  SELECT DISTINCT state_region
  FROM canonical.institutions
  WHERE state_region IS NOT NULL
  ORDER BY state_region;
$$;

GRANT EXECUTE ON FUNCTION canonical.get_distinct_country_codes() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION canonical.get_distinct_state_regions() TO anon, authenticated;
