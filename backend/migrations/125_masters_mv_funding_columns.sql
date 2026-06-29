-- ---------------------------------------------------------------------------
-- 122_masters_mv_funding_columns.sql
-- Add assistantship_types and tuition_waiver_available to mv_masters_program_cards
-- ---------------------------------------------------------------------------

-- 1) Drop and recreate the materialized view with the two new columns
DROP MATERIALIZED VIEW IF EXISTS canonical.mv_masters_program_cards CASCADE;

CREATE MATERIALIZED VIEW canonical.mv_masters_program_cards AS
SELECT
  p.id,
  p.institution_name,
  p.institution_country,
  p.city,
  p.program_name,
  p.degree_type,
  p.specialization,
  p.is_stem_designated,
  p.gre_requirement,
  p.gmat_requirement,
  p.funding_availability,
  p.tuition_total,
  p.tuition_currency,
  p.program_length_months,
  p.median_earnings,
  p.median_debt,
  p.data_quality_score,
  p.last_scraped_at,
  p.assistantship_types,
  p.tuition_waiver_available,
  (SELECT COUNT(*) FROM canonical.masters_program_pathways pw     WHERE pw.masters_program_id = p.id) AS pathway_count,
  (SELECT COUNT(*) FROM canonical.masters_admission_datapoints dp WHERE dp.masters_program_id = p.id) AS datapoint_count
FROM canonical.masters_programs p;

-- 2) Indexes — UNIQUE index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_masters_cards_id      ON canonical.mv_masters_program_cards(id);
CREATE INDEX        idx_mv_masters_cards_country ON canonical.mv_masters_program_cards(institution_country);
CREATE INDEX        idx_mv_masters_cards_degree  ON canonical.mv_masters_program_cards(degree_type);
