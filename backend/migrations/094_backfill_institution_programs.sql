-- 094_backfill_institution_programs.sql
-- H2 backfill: canonical.institution_programs is empty (0 rows) while
-- public.college_majors holds 184,800 IPEDS program-completion rows.
-- Bridge: college_majors.college_id -> colleges_comprehensive.id
--         -> institution_identity_map.source_pk -> institution_id (uuid).
-- Source: IPEDS completions (tier 2). Never overwrites: ON CONFLICT DO NOTHING.

-- Idempotency key (table has no unique constraint today).
CREATE UNIQUE INDEX IF NOT EXISTS institution_programs_uq_inst_norm_degree
  ON canonical.institution_programs (institution_id, normalized_program_name, degree_type_key);

INSERT INTO canonical.institution_programs (
  institution_id,
  program_name,
  normalized_program_name,
  degree_type,
  field_category,
  enrollment,
  metadata,
  source_attribution
)
SELECT
  idm.institution_id,
  m.name,
  lower(regexp_replace(m.name, '[^a-zA-Z0-9]', '', 'g')),
  'Bachelor'::text,                       -- college_majors.awlevel is uniformly 6 (undergrad)
  m.broad_category,
  cm.completions_count,
  jsonb_build_object(
    'cip_code', m.cip_code,
    'is_stem', m.is_stem,
    'awlevel', cm.awlevel,
    'completions_pct', cm.completions_pct
  ),
  jsonb_build_object(
    'source', 'IPEDS',
    'source_table', 'public.college_majors',
    'confidence', 0.90,
    'last_verified_at', now()
  )
FROM public.college_majors cm
JOIN public.majors m
  ON m.id = cm.major_id
JOIN canonical.institution_identity_map idm
  ON idm.source_table = 'public.colleges_comprehensive'
 AND idm.source_pk = cm.college_id::text
 AND idm.is_canonical_match = true
WHERE COALESCE(cm.offered, true) = true
  AND m.name IS NOT NULL
ON CONFLICT (institution_id, normalized_program_name, degree_type_key) DO NOTHING;
