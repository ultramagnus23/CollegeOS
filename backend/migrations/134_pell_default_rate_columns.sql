-- Migration 134: pell_grant_rate + loan_default_rate_3yr
--
-- Adds two real, sourceable College Scorecard fields that have no column yet
-- (verified live against the current API — not a re-add of anything already
-- present). percent_first_gen already exists on institution_demographics
-- (added by an earlier migration) but is 100% unpopulated; no schema change
-- needed there, only wiring (see backend/scripts/refreshScorecard.js).
--
-- Scale convention: NUMERIC(6,3), 0-100 percentage, matching
-- institution_outcomes.graduation_rate_4yr and
-- institution_demographics.percent_first_gen.

ALTER TABLE canonical.institution_financials
  ADD COLUMN IF NOT EXISTS pell_grant_rate NUMERIC(6,3);

ALTER TABLE canonical.institution_outcomes
  ADD COLUMN IF NOT EXISTS loan_default_rate_3yr NUMERIC(6,3);

COMMENT ON COLUMN canonical.institution_financials.pell_grant_rate IS
  'Pct of undergrads receiving a Pell Grant (0-100). Source: College Scorecard latest.aid.pell_grant_rate.';
COMMENT ON COLUMN canonical.institution_outcomes.loan_default_rate_3yr IS
  '3-year federal student loan cohort default rate (0-100). Source: College Scorecard latest.repayment.3_yr_default_rate.';
