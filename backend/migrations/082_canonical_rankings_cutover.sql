-- Canonical rankings ingestion/performance support

CREATE UNIQUE INDEX IF NOT EXISTS institution_rankings_uq_institution_body_year
  ON canonical.institution_rankings (institution_id, ranking_body, ranking_year);

CREATE INDEX IF NOT EXISTS institution_rankings_idx_global_rank
  ON canonical.institution_rankings (global_rank);

CREATE INDEX IF NOT EXISTS institution_rankings_idx_subject_rank
  ON canonical.institution_rankings (subject_rank);

CREATE INDEX IF NOT EXISTS institutions_idx_popularity_score
  ON canonical.institutions (popularity_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS mv_college_cards_idx_popularity
  ON canonical.mv_college_cards (popularity_score DESC NULLS LAST, global_rank ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS mv_college_cards_idx_country_rank
  ON canonical.mv_college_cards (country_code, global_rank ASC NULLS LAST, popularity_score DESC NULLS LAST);

CREATE OR REPLACE FUNCTION canonical.refresh_popularity_score_from_rankings()
RETURNS void
LANGUAGE sql
AS $$
  WITH ranking AS (
    SELECT institution_id, MIN(global_rank) AS best_global_rank
    FROM canonical.institution_rankings
    GROUP BY institution_id
  ),
  admissions AS (
    SELECT institution_id,
           MAX(application_volume) AS application_volume,
           MAX(acceptance_rate) AS acceptance_rate
    FROM canonical.institution_admissions
    GROUP BY institution_id
  ),
  outcomes AS (
    SELECT institution_id, MAX(median_start_salary) AS salary
    FROM canonical.institution_outcomes
    GROUP BY institution_id
  ),
  scored AS (
    SELECT
      i.id,
      (
        (CASE
          WHEN r.best_global_rank IS NULL THEN 0.25
          WHEN r.best_global_rank <= 10 THEN 1.0
          WHEN r.best_global_rank <= 25 THEN 0.95
          WHEN r.best_global_rank <= 50 THEN 0.90
          WHEN r.best_global_rank <= 100 THEN 0.85
          WHEN r.best_global_rank <= 200 THEN 0.78
          WHEN r.best_global_rank <= 300 THEN 0.70
          WHEN r.best_global_rank <= 500 THEN 0.62
          ELSE 0.50
        END) * 0.45
        + LEAST(COALESCE(a.application_volume, 0) / 100000.0, 1.0) * 0.20
        + (1 - LEAST(COALESCE(a.acceptance_rate, 0.8), 1.0)) * 0.20
        + LEAST(COALESCE(o.salary, 0) / 200000.0, 1.0) * 0.15
      ) * 100 AS popularity_score
    FROM canonical.institutions i
    LEFT JOIN ranking r ON r.institution_id = i.id
    LEFT JOIN admissions a ON a.institution_id = i.id
    LEFT JOIN outcomes o ON o.institution_id = i.id
  )
  UPDATE canonical.institutions i
     SET popularity_score = ROUND(s.popularity_score::numeric, 2)
    FROM scored s
   WHERE s.id = i.id;
$$;

