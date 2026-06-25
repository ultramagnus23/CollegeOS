-- audit_outcome_rates.sql
-- One-time blast-radius audit for the retention/graduation-rate corruption
-- (Phase 5). Run read-only BEFORE/AFTER migration 123 to see how many rows are
-- out of the plausible 0–100 range, and on which scale they're stored.
--
-- Usage: psql "$DATABASE_URL" -f scripts/audit_outcome_rates.sql
--
-- Buckets:
--   null_count    – no value
--   fraction_0_1  – stored as a 0–1 fraction (needs *100)
--   pct_0_100     – stored correctly as a 0–100 percentage
--   over_100      – out of range (the *100 corruption / leaked counts)
--   negative      – invalid

\echo '=== canonical.institution_outcomes ==='
SELECT
  field,
  count(*)                                              AS total_non_null,
  count(*) FILTER (WHERE v > 1   AND v <= 100)          AS pct_0_100,
  count(*) FILTER (WHERE v >= 0  AND v <= 1)            AS fraction_0_1,
  count(*) FILTER (WHERE v > 100)                       AS over_100,
  count(*) FILTER (WHERE v < 0)                         AS negative,
  max(v)                                                AS max_value
FROM (
  SELECT 'retention_rate'      AS field, retention_rate::numeric      AS v FROM canonical.institution_outcomes WHERE retention_rate      IS NOT NULL
  UNION ALL
  SELECT 'graduation_rate_4yr',          graduation_rate_4yr::numeric        FROM canonical.institution_outcomes WHERE graduation_rate_4yr IS NOT NULL
  UNION ALL
  SELECT 'graduation_rate_6yr',          graduation_rate_6yr::numeric        FROM canonical.institution_outcomes WHERE graduation_rate_6yr IS NOT NULL
  UNION ALL
  SELECT 'employment_rate',              employment_rate::numeric            FROM canonical.institution_outcomes WHERE employment_rate     IS NOT NULL
) s
GROUP BY field
ORDER BY field;

-- Source table that fed the corruption (only if it exists in this deployment).
\echo '=== public.academic_details (source) ==='
SELECT
  field,
  count(*)                                     AS total_non_null,
  count(*) FILTER (WHERE v > 1 AND v <= 100)   AS pct_0_100,
  count(*) FILTER (WHERE v >= 0 AND v <= 1)    AS fraction_0_1,
  count(*) FILTER (WHERE v > 100)              AS over_100,
  max(v)                                       AS max_value
FROM (
  SELECT 'retention_rate'      AS field, retention_rate::numeric      AS v FROM public.academic_details WHERE retention_rate      IS NOT NULL
  UNION ALL
  SELECT 'graduation_rate_4yr',          graduation_rate_4yr::numeric        FROM public.academic_details WHERE graduation_rate_4yr IS NOT NULL
) s
GROUP BY field
ORDER BY field;
