-- masters_coverage_report.sql
-- Real, measurable data-coverage report for the masters track (Phase 3).
-- Answers "what % of masters programs actually have real (non-empty) data in
-- each category" — NOT "the scraper ran". Run read-only after any ingestion:
--
--   psql "$DATABASE_URL" -f scripts/masters_coverage_report.sql
--
-- Categories map 1:1 to the Phase-3 source table:
--   program_page  -> official program pages (SPA scraper)         [High, freshness-gated]
--   outcomes_roi  -> IPEDS / BLS OEWS / Scorecard FoS salary       [Medium-High]
--   self_reported -> GradCafe-style datapoints (sample size = N)   [Low-Medium]
-- Research/advisor fit and funding likelihood are intentionally absent — no
-- real public source exists, so they are NOT measured here.

\echo '=== Masters program coverage (denominator = all rows in canonical.masters_programs) ==='
WITH p AS (SELECT * FROM canonical.masters_programs)
SELECT
  count(*)                                                                AS total_programs,

  -- Program-page data (requirements actually scraped from the official page)
  count(*) FILTER (WHERE last_scraped_at IS NOT NULL)                     AS has_program_page,
  round(100.0 * count(*) FILTER (WHERE last_scraped_at IS NOT NULL)
        / NULLIF(count(*), 0), 1)                                         AS pct_program_page,

  -- Freshness of program-page data (scraped within 180 days)
  count(*) FILTER (WHERE last_scraped_at > now() - interval '180 days')   AS program_page_fresh,

  -- Outcomes / ROI (IPEDS+BLS+Scorecard): real earnings figure present
  count(*) FILTER (WHERE median_earnings IS NOT NULL)                     AS has_outcomes,
  round(100.0 * count(*) FILTER (WHERE median_earnings IS NOT NULL)
        / NULLIF(count(*), 0), 1)                                         AS pct_outcomes,

  -- CIP code present (the join key that makes BLS/Scorecard ingestion possible)
  count(*) FILTER (WHERE cip_code IS NOT NULL AND cip_code <> '')         AS has_cip_code
FROM p;

\echo '=== Self-reported coverage (GradCafe-style) — sample size drives display ==='
SELECT
  count(DISTINCT mp.id)                                                   AS programs_total,
  count(DISTINCT dp.masters_program_id)                                   AS programs_with_any_datapoint,
  -- Only programs with enough self-reports to show a band (matches the
  -- disclaimer's own "absent for programs without enough reports" rule).
  count(*) FILTER (WHERE c.n >= 5)                                        AS programs_with_displayable_band,
  round(avg(c.n) FILTER (WHERE c.n > 0), 1)                              AS avg_sample_size
FROM canonical.masters_programs mp
LEFT JOIN (
  SELECT masters_program_id, count(*) AS n
  FROM canonical.masters_admission_datapoints
  GROUP BY masters_program_id
) c ON c.masters_program_id = mp.id
LEFT JOIN canonical.masters_admission_datapoints dp ON dp.masters_program_id = mp.id;

\echo '=== Self-reported breakdown by source (must be labeled self-reported, never an admit rate) ==='
SELECT source, count(*) AS datapoints, count(DISTINCT masters_program_id) AS programs
FROM canonical.masters_admission_datapoints
GROUP BY source
ORDER BY datapoints DESC;
