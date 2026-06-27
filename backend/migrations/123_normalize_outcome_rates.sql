-- Migration 123: Normalize outcome rates to a single 0–100 scale + guard
--
-- ROOT CAUSE: canonical.institution_outcomes mixes scales. Migration 100
-- assumed public.academic_details rates were always 0–1 fractions and applied
-- an UNCONDITIONAL `* 100`. Sources that already stored 0–100 percentages were
-- therefore multiplied into the thousands (e.g. 87 -> 8700, then silently
-- clamped to 100), and the frontend separately re-multiplied a correct 80.51
-- into "8051.0%". This migration normalizes the STORED values (not just the
-- display) and installs a DB-level guard so out-of-range values can never be
-- written again.
--
-- Normalization rule, per value v:
--   NULL                 -> NULL
--   v < 0                -> NULL   (invalid)
--   0   <= v <= 1        -> v*100  (a fraction that slipped through)
--   1   <  v <= 100      -> v      (already a correct percentage)
--   100 <  v <= 10000    -> v/100  (recover the unconditional *100 corruption)
--   v > 10000            -> NULL   (unrecoverable garbage, e.g. a count leaked in)

DO $$
DECLARE
  fld TEXT;
  fields TEXT[] := ARRAY[
    'retention_rate', 'graduation_rate_4yr', 'graduation_rate_6yr', 'employment_rate'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'canonical' AND table_name = 'institution_outcomes'
  ) THEN
    RAISE NOTICE 'canonical.institution_outcomes not present; skipping migration 123';
    RETURN;
  END IF;

  FOREACH fld IN ARRAY fields LOOP
    -- Only touch columns that actually exist on this deployment.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'canonical' AND table_name = 'institution_outcomes'
        AND column_name = fld
    ) THEN
      EXECUTE format($f$
        UPDATE canonical.institution_outcomes
           SET %1$I = CASE
                 WHEN %1$I IS NULL        THEN NULL
                 WHEN %1$I < 0            THEN NULL
                 WHEN %1$I <= 1           THEN round((%1$I * 100)::numeric, 3)
                 WHEN %1$I <= 100         THEN round(%1$I::numeric, 3)
                 WHEN %1$I <= 10000       THEN round((%1$I / 100)::numeric, 3)
                 ELSE NULL
               END
         WHERE %1$I IS NOT NULL
           AND (%1$I < 0 OR %1$I <= 1 OR %1$I > 100)
      $f$, fld);

      -- Pipeline-level guard: reject any future out-of-range write. Added NOT
      -- VALID then validated, so it can't fail mid-migration on a stray row
      -- (any remaining out-of-range value was set to NULL above).
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'canonical.institution_outcomes'::regclass
          AND conname = format('chk_%s_0_100', fld)
      ) THEN
        EXECUTE format(
          'ALTER TABLE canonical.institution_outcomes
             ADD CONSTRAINT %I CHECK (%I IS NULL OR (%I >= 0 AND %I <= 100)) NOT VALID',
          format('chk_%s_0_100', fld), fld, fld, fld
        );
        EXECUTE format(
          'ALTER TABLE canonical.institution_outcomes VALIDATE CONSTRAINT %I',
          format('chk_%s_0_100', fld)
        );
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration 123 applied: outcome rates normalized to 0–100 with CHECK guards';
END
$$;
