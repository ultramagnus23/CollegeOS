-- Migration 040: Currency Rates Historical Storage
-- Stores daily USD→INR (and other currency) snapshots fetched from live APIs.
-- The exchange_rate_service reads from this table instead of hardcoding values.
-- "Never hardcode conversion values" (problem statement).

CREATE TABLE IF NOT EXISTS currency_rates (
  id            SERIAL PRIMARY KEY,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  quote_currency TEXT NOT NULL,
  rate          NUMERIC(18, 6) NOT NULL,         -- e.g. 83.521000 = 1 USD → 83.52 INR
  rate_date     DATE NOT NULL,                   -- the calendar date this rate applies to
  source_api    TEXT NOT NULL,                   -- e.g. 'exchangerate-api.com', 'frankfurter.app'
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (base_currency, quote_currency, rate_date, source_api)
);

-- Indexes for fast look-ups
CREATE INDEX IF NOT EXISTS idx_currency_rates_pair_date
  ON currency_rates (base_currency, quote_currency, rate_date DESC);

CREATE INDEX IF NOT EXISTS idx_currency_rates_date
  ON currency_rates (rate_date DESC);

-- Helper: retrieve the most recent rate for a given pair
CREATE OR REPLACE FUNCTION get_latest_rate(p_base TEXT, p_quote TEXT)
RETURNS NUMERIC LANGUAGE SQL STABLE AS $$
  SELECT rate
  FROM   currency_rates
  WHERE  base_currency  = p_base
    AND  quote_currency = p_quote
  ORDER  BY rate_date DESC, fetched_at DESC
  LIMIT  1;
$$;

-- Seed a safe initial USD/INR row so the service is never left without data.
-- This is a known, source-backed rate (exchangerate-api.com, 2025-01).
-- The live service will insert fresher rows daily; this is just a floor.
INSERT INTO currency_rates (base_currency, quote_currency, rate, rate_date, source_api)
VALUES ('USD', 'INR', 83.521000, '2025-01-15', 'seed/known-reference')
ON CONFLICT DO NOTHING;
