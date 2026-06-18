-- 095_backfill_major_ontology.sql
-- H2 seed: canonical.major_ontology is empty. Seed identity rows from the
-- 37 canonical majors in public.majors so university-specific names can later
-- be normalized against them. (id is bigint NOT NULL with no sequence default.)

CREATE UNIQUE INDEX IF NOT EXISTS major_ontology_uq_canonical_alias
  ON canonical.major_ontology (canonical_major, alias);

INSERT INTO canonical.major_ontology (
  id,
  canonical_major,
  alias,
  parent_major,
  confidence
)
SELECT
  COALESCE((SELECT max(id) FROM canonical.major_ontology), 0)
    + row_number() OVER (ORDER BY m.name),
  m.name,
  m.name,                 -- identity alias: canonical seed layer
  m.broad_category,
  0.90
FROM public.majors m
WHERE m.name IS NOT NULL
ON CONFLICT (canonical_major, alias) DO NOTHING;
