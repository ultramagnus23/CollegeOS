-- Migration: 065_popularity_score.sql
-- Create the compute_popularity_score() helper function.
-- The actual score values are written by seed / fix_rankings scripts; this
-- migration only installs the reusable PL/pgSQL function.
--
-- Score breakdown (max 100 pts):
--   enrollment     0–40 pts  (normalised to 50k cap)
--   US News rank   0–30 pts  (top 500 only)
--   applications   0–20 pts  (normalised to 100k cap)
--   selectivity    0–10 pts  (lower acceptance rate → higher prestige bonus)

CREATE OR REPLACE FUNCTION compute_popularity_score(
  p_enrollment     INT,
  p_ranking_us_news INT,
  p_applications   BIGINT,
  p_acceptance_rate NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  score NUMERIC := 0;
BEGIN
  -- Enrollment weight (0-40 pts, capped at 50 000)
  score := score + LEAST(COALESCE(p_enrollment, 0), 50000)::NUMERIC / 50000 * 40;

  -- Ranking weight (0-30 pts, only top 500)
  IF p_ranking_us_news IS NOT NULL AND p_ranking_us_news <= 500 THEN
    score := score + (500 - p_ranking_us_news)::NUMERIC / 500 * 30;
  END IF;

  -- Application volume weight (0-20 pts, capped at 100 000)
  score := score + LEAST(COALESCE(p_applications, 0), 100000)::NUMERIC / 100000 * 20;

  -- Selectivity bonus (0-10 pts; lower acceptance rate = higher prestige)
  IF p_acceptance_rate IS NOT NULL THEN
    score := score + GREATEST(0, (1 - p_acceptance_rate)) * 10;
  END IF;

  RETURN ROUND(score, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
