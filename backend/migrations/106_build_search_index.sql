-- 106_build_search_index.sql
-- SEARCH P0: canonical.institution_search_index is EMPTY, so keyword/major/country
-- search has no full-text corpus. This builds it from data ALREADY in canonical
-- (institutions + aliases + programs). The search_document tsvector is a GENERATED
-- column over autocomplete_text + searchable_json, and idx_search_index_doc (GIN)
-- already exists — so once rows land, "psychology", "computer science",
-- "engineering", country/city terms become full-text searchable. No fabricated data.
-- Rerunnable: TRUNCATE + repopulate (this is the repair_search_indexes job).

CREATE OR REPLACE FUNCTION canonical.rebuild_institution_search_index()
RETURNS integer
LANGUAGE plpgsql
SET search_path = canonical, public
AS $$
DECLARE n integer;
BEGIN
  TRUNCATE canonical.institution_search_index;

  INSERT INTO canonical.institution_search_index
    (institution_id, autocomplete_text, search_tokens, searchable_json)
  SELECT
    i.id,
    -- Human-readable autocomplete text: name + location + aliases.
    btrim(concat_ws(' ',
      i.canonical_name, i.city, i.state_region, i.country_code,
      al.alias_text
    )),
    -- Distinct normalized tokens across name, aliases, majors, programs.
    COALESCE((
      SELECT array_agg(DISTINCT tok)
      FROM unnest(string_to_array(
        canonical.normalize_search_text(concat_ws(' ',
          i.canonical_name, i.city, i.state_region, i.country_code,
          al.norm_text, pr.cats_text, pr.progs_text)),
        ' ')) AS tok
      WHERE tok <> ''
    ), ARRAY[]::text[]),
    -- Structured payload; its ::text also feeds the generated tsvector, so the
    -- major/program names below become full-text searchable.
    jsonb_strip_nulls(jsonb_build_object(
      'country_code', i.country_code,
      'city', i.city,
      'state_region', i.state_region,
      'institution_type', i.institution_type,
      'control_type', i.control_type,
      'majors', pr.cats,
      'programs', pr.progs
    ))
  FROM canonical.institutions i
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT a.alias, ' ')            AS alias_text,
           string_agg(DISTINCT a.normalized_alias, ' ') AS norm_text
    FROM canonical.institution_aliases a
    WHERE a.institution_id = i.id
  ) al ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(DISTINCT p.field_category) FILTER (WHERE p.field_category IS NOT NULL) AS cats,
           jsonb_agg(DISTINCT p.program_name)   FILTER (WHERE p.program_name   IS NOT NULL) AS progs,
           string_agg(DISTINCT p.field_category, ' ') AS cats_text,
           string_agg(DISTINCT p.program_name, ' ')   AS progs_text
    FROM canonical.institution_programs p
    WHERE p.institution_id = i.id
  ) pr ON true;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

SELECT canonical.rebuild_institution_search_index();
