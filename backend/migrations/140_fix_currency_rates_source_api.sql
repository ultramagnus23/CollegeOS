-- Migration 140: Fix currency_rates missing source_api column
-- Root cause: the live currency_rates table pre-dates migration 040 (created by an
-- earlier, uncolumned path). 040's `CREATE TABLE IF NOT EXISTS` silently skipped adding
-- source_api to the existing table, so every exchange-rate write since has failed with
-- 42703 "column source_api does not exist" (server logs on every boot).

ALTER TABLE currency_rates ADD COLUMN IF NOT EXISTS source_api TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE currency_rates ALTER COLUMN source_api DROP DEFAULT;

-- The unique constraint from 040 also depends on source_api; add it if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'currency_rates_base_currency_quote_currency_rate_date_sou_key'
  ) THEN
    ALTER TABLE currency_rates
      ADD CONSTRAINT currency_rates_base_currency_quote_currency_rate_date_sou_key
      UNIQUE (base_currency, quote_currency, rate_date, source_api);
  END IF;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;
