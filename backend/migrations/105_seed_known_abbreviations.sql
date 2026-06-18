-- 105_seed_known_abbreviations.sql
-- SEARCH P0: nickname abbreviations that are NOT derivable acronyms ("gatech",
-- "caltech", "berkeley", "penn") plus the "ivy league" group query. These are
-- real, widely-published abbreviations (not fabricated data); each is resolved to
-- a single institution that already exists in canonical.institutions, picked by
-- highest popularity to disambiguate (e.g. Caltech over "Southern California
-- Institute of Technology"). Verified present via read-only query 2026-06-18.
-- Idempotent: ON CONFLICT against institution_aliases_uq_inst_norm (migration 103).

-- 1) one-institution nickname abbreviations
WITH seed(abbrev, name_pattern) AS (
  VALUES
    ('gatech',   'Georgia Institute of Technology%'),
    ('ga tech',  'Georgia Institute of Technology%'),
    ('caltech',  'California Institute of Technology'),
    ('penn',     'University of Pennsylvania'),
    ('upenn',    'University of Pennsylvania'),
    ('umich',    'University of Michigan-Ann Arbor'),
    ('berkeley', 'University of California-Berkeley'),
    ('ucb',      'University of California-Berkeley'),
    ('ucla',     'University of California-Los Angeles'),
    ('ucsd',     'University of California-San Diego'),
    ('vt',       'Virginia Polytechnic Institute and State University'),
    ('vtech',    'Virginia Polytechnic Institute and State University'),
    ('ut austin','University of Texas at Austin%'),
    ('utexas',   'University of Texas at Austin%'),
    ('cornell',  'Cornell University%')
),
resolved AS (
  SELECT s.abbrev, inst.id AS institution_id
  FROM seed s
  CROSS JOIN LATERAL (
    SELECT i.id FROM canonical.institutions i
    WHERE i.canonical_name ILIKE s.name_pattern
    ORDER BY i.popularity_score DESC NULLS LAST
    LIMIT 1
  ) inst
)
INSERT INTO canonical.institution_aliases
  (institution_id, alias, normalized_alias, alias_type, source_table, source_pk)
SELECT institution_id, abbrev, canonical.normalize_search_text(abbrev),
       'abbreviation', 'curated_seed', abbrev
FROM resolved
WHERE institution_id IS NOT NULL
ON CONFLICT (institution_id, normalized_alias) DO NOTHING;

-- 2) Ivy League group: tag all eight with the shared alias "ivy league"
WITH ivy(name_pattern) AS (
  VALUES
    ('Harvard University'),
    ('Yale University'),
    ('Princeton University'),
    ('Columbia University in the City of New York'),
    ('Brown University'),
    ('Cornell University%'),
    ('Dartmouth College'),
    ('University of Pennsylvania')
),
resolved AS (
  SELECT inst.id AS institution_id
  FROM ivy
  CROSS JOIN LATERAL (
    SELECT i.id FROM canonical.institutions i
    WHERE i.canonical_name ILIKE ivy.name_pattern
    ORDER BY i.popularity_score DESC NULLS LAST
    LIMIT 1
  ) inst
)
INSERT INTO canonical.institution_aliases
  (institution_id, alias, normalized_alias, alias_type, source_table, source_pk)
SELECT institution_id, 'Ivy League', 'ivy league', 'group', 'curated_seed', 'ivy_league'
FROM resolved
WHERE institution_id IS NOT NULL
ON CONFLICT (institution_id, normalized_alias) DO NOTHING;
