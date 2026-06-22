-- 119_institution_placements.sql
-- Structured placement-outcomes table (esp. for India, where placement stats —
-- highest/average/median package, % placed — are a primary decision factor).
-- Populated by the placement scraper (backend/src/scrapers/adapters/
-- institutionPlacements.js) from each institution's official placements page /
-- placement report. Packages stored in absolute INR (LPA * 100,000) for currency
-- consistency with the money system. Never fabricated — every row carries source_url.

CREATE TABLE IF NOT EXISTS canonical.institution_placements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      uuid NOT NULL REFERENCES canonical.institutions(id) ON DELETE CASCADE,
  cycle_year          text NOT NULL,
  highest_package_inr numeric,
  average_package_inr numeric,
  median_package_inr  numeric,
  placement_rate_pct  numeric,
  percentiles         jsonb DEFAULT '{}'::jsonb,   -- e.g. {"p90": 2500000, "p75": 1500000}
  currency            text DEFAULT 'INR',
  source_url          text,
  source_type         text,                         -- 'official' | 'brochure' | 'report'
  confidence_score    numeric,
  raw_payload         jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, cycle_year)
);

CREATE INDEX IF NOT EXISTS idx_institution_placements_inst
  ON canonical.institution_placements (institution_id);
