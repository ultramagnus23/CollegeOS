-- Migration: 063_verify_net_price_brackets.sql
-- Ensure net-price income brackets and debt/default-rate columns exist on
-- college_financial_data.  Uses IF NOT EXISTS so the migration is safe to run
-- even if some columns were already added in an earlier migration.

ALTER TABLE college_financial_data
  ADD COLUMN IF NOT EXISTS net_price_0_30k          INTEGER,
  ADD COLUMN IF NOT EXISTS net_price_30_48k         INTEGER,
  ADD COLUMN IF NOT EXISTS net_price_48_75k         INTEGER,
  ADD COLUMN IF NOT EXISTS net_price_75_110k        INTEGER,
  ADD COLUMN IF NOT EXISTS net_price_110k_plus      INTEGER,
  ADD COLUMN IF NOT EXISTS pct_receiving_pell        NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS loan_default_rate_3yr     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS median_debt_at_graduation INTEGER;
