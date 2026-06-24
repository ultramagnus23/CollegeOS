-- 121_masters_scrape_log.sql
-- Data Quality Layer (docs/MASTERS_TRACK_PLAN.md deliverable #9): an audit trail
-- of every masters program-page scrape attempt — fetched / fetch_failed /
-- rejected / accepted — with the data-quality confidence, the validation issues,
-- and which fields were missing. Lets us see WHY a program did or did not get
-- ingested, and track freshness. Fully additive: canonical schema, new table only,
-- no change to any existing table. Idempotent (IF NOT EXISTS).

CREATE SCHEMA IF NOT EXISTS canonical;

CREATE TABLE IF NOT EXISTS canonical.masters_scrape_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_url      TEXT NOT NULL,
  institution_name TEXT,
  program_name     TEXT,
  status           TEXT NOT NULL CHECK (status IN ('fetched','fetch_failed','rejected','accepted')),
  confidence       NUMERIC(4,2),
  issues           JSONB DEFAULT '[]'::jsonb,        -- validator issues (missing/implausible/flagged)
  missing_fields   JSONB DEFAULT '[]'::jsonb,
  http_bytes       INTEGER,
  scraped_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_masters_scrape_log_status ON canonical.masters_scrape_log(status);
CREATE INDEX IF NOT EXISTS idx_masters_scrape_log_url    ON canonical.masters_scrape_log(program_url);
CREATE INDEX IF NOT EXISTS idx_masters_scrape_log_time   ON canonical.masters_scrape_log(scraped_at DESC);
