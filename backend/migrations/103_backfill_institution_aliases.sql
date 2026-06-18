-- 103_backfill_institution_aliases.sql
-- SEARCH P0: canonical.institution_aliases is EMPTY (0 rows), so the frontend
-- search (which matches against aliases) has nothing to resolve "uiuc", "cmu",
-- "BU", etc. This backfills aliases from data ALREADY in canonical.institutions
-- (canonical_name, short_name, the aliases jsonb array, and a derived acronym).
-- No external data, no fabrication — purely derived from existing rows.
-- Idempotent: unique index + ON CONFLICT DO NOTHING; safe to re-run.

-- Normalize free text the same way as institutions.normalized_name:
-- unaccent + lowercase + non-alphanumerics collapsed to single spaces + trimmed.
CREATE OR REPLACE FUNCTION canonical.normalize_search_text(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(
    btrim(regexp_replace(lower(public.unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', ' ', 'g')),
    ''
  );
$$;

-- Derive an acronym from significant words: "Carnegie Mellon University" -> "cmu",
-- "University of Illinois Urbana Champaign" -> "uiuc". Stopwords are dropped.
-- Returns NULL when fewer than 2 significant letters result.
CREATE OR REPLACE FUNCTION canonical.derive_acronym(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(ac) >= 2 THEN ac END
  FROM (
    SELECT string_agg(left(w, 1), '' ORDER BY ord) AS ac
    FROM (
      SELECT w, ord
      FROM unnest(string_to_array(canonical.normalize_search_text(p_text), ' '))
        WITH ORDINALITY AS t(w, ord)
      WHERE w <> ''
        AND w NOT IN ('of','the','and','at','for','in','de','la','le','du','des',
                      'von','di','el','y','e','da','do','dos','das','a','an')
    ) words
  ) agg;
$$;

-- Idempotency key (table ships without a unique constraint).
CREATE UNIQUE INDEX IF NOT EXISTS institution_aliases_uq_inst_norm
  ON canonical.institution_aliases (institution_id, normalized_alias);

INSERT INTO canonical.institution_aliases
  (institution_id, alias, normalized_alias, alias_type, source_table, source_pk)
SELECT DISTINCT ON (institution_id, normalized_alias)
  institution_id, alias, normalized_alias, alias_type, 'canonical.institutions', source_pk
FROM (
  -- 1) canonical name
  SELECT i.id AS institution_id, i.canonical_name AS alias,
         canonical.normalize_search_text(i.canonical_name) AS normalized_alias,
         'canonical'::text AS alias_type, i.id::text AS source_pk
  FROM canonical.institutions i

  UNION ALL
  -- 2) short name (e.g. "Georgia Tech", "Caltech")
  SELECT i.id, i.short_name,
         canonical.normalize_search_text(i.short_name), 'short_name', i.id::text
  FROM canonical.institutions i
  WHERE canonical.normalize_search_text(i.short_name) IS NOT NULL

  UNION ALL
  -- 3) known aliases from the jsonb array; each element may be comma-joined
  SELECT i.id, btrim(part),
         canonical.normalize_search_text(part), 'known_alias', i.id::text
  FROM canonical.institutions i
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(i.aliases) = 'array' THEN i.aliases ELSE '[]'::jsonb END
  ) AS elem(val)
  CROSS JOIN LATERAL regexp_split_to_table(elem.val, '\s*,\s*') AS part
  WHERE canonical.normalize_search_text(part) IS NOT NULL

  UNION ALL
  -- 4) derived acronym
  SELECT i.id, upper(canonical.derive_acronym(i.canonical_name)),
         canonical.derive_acronym(i.canonical_name), 'acronym', i.id::text
  FROM canonical.institutions i
  WHERE canonical.derive_acronym(i.canonical_name) IS NOT NULL
) src
WHERE normalized_alias IS NOT NULL
  AND length(normalized_alias) >= 2
ORDER BY institution_id, normalized_alias, alias_type
ON CONFLICT (institution_id, normalized_alias) DO NOTHING;
