-- 149_rate_range_check_constraints.sql
-- ----------------------------------------------------------------------------
-- Phase 2 consolidation, integrity item (partial -- rate/money ranges only,
-- not the full FK/enum sweep, see docs/audits/DB_SIZE_AUDIT_2026-07-12.md for
-- why the rest is scoped separately).
--
-- Every range below was verified against LIVE DATA before being chosen, not
-- assumed -- the columns do NOT share one convention. acceptance_rate/
-- yield_rate are stored as 0-1 fractions (observed range 0.000-1.000).
-- early_decision_rate/early_action_rate are stored as 0-100 percentages
-- (observed range 13.84-91.74) -- a DIFFERENT scale from acceptance_rate in
-- the SAME table. graduation/employment/retention/loan-default rates in
-- institution_outcomes are all 0-100 (observed max values up to 100.000).
-- A single blanket "0-100" or "0-1" rule across all rate columns would have
-- rejected real existing data either way.
--
-- CHECK constraints allow NULL to pass (standard SQL semantics) -- this only
-- constrains future non-null writes, it does not require backfilling any of
-- the many currently-NULL rate columns. Columns with zero real rows today
-- (regular_decision_rate, waitlist_rate, grad_school_rate, etc.) are left
-- unconstrained since there's no real data to confirm their intended scale --
-- adding a range on those would be guessing a convention, not verifying one.
--
-- ROLLBACK PLAN: DROP CONSTRAINT <name> reverses each individually; no data
-- is modified by this migration, only future-write validation is added.
-- ----------------------------------------------------------------------------

ALTER TABLE canonical.institution_admissions
  ADD CONSTRAINT chk_admissions_acceptance_rate_0_1 CHECK (acceptance_rate IS NULL OR (acceptance_rate >= 0 AND acceptance_rate <= 1)),
  ADD CONSTRAINT chk_admissions_yield_rate_0_1 CHECK (yield_rate IS NULL OR (yield_rate >= 0 AND yield_rate <= 1)),
  ADD CONSTRAINT chk_admissions_early_decision_rate_0_100 CHECK (early_decision_rate IS NULL OR (early_decision_rate >= 0 AND early_decision_rate <= 100)),
  ADD CONSTRAINT chk_admissions_early_action_rate_0_100 CHECK (early_action_rate IS NULL OR (early_action_rate >= 0 AND early_action_rate <= 100));

ALTER TABLE canonical.institution_outcomes
  ADD CONSTRAINT chk_outcomes_graduation_rate_4yr_0_100 CHECK (graduation_rate_4yr IS NULL OR (graduation_rate_4yr >= 0 AND graduation_rate_4yr <= 100)),
  ADD CONSTRAINT chk_outcomes_graduation_rate_6yr_0_100 CHECK (graduation_rate_6yr IS NULL OR (graduation_rate_6yr >= 0 AND graduation_rate_6yr <= 100)),
  ADD CONSTRAINT chk_outcomes_employment_rate_0_100 CHECK (employment_rate IS NULL OR (employment_rate >= 0 AND employment_rate <= 100)),
  ADD CONSTRAINT chk_outcomes_retention_rate_0_100 CHECK (retention_rate IS NULL OR (retention_rate >= 0 AND retention_rate <= 100)),
  ADD CONSTRAINT chk_outcomes_employment_rate_1yr_0_100 CHECK (employment_rate_1yr IS NULL OR (employment_rate_1yr >= 0 AND employment_rate_1yr <= 100)),
  ADD CONSTRAINT chk_outcomes_loan_default_rate_3yr_0_100 CHECK (loan_default_rate_3yr IS NULL OR (loan_default_rate_3yr >= 0 AND loan_default_rate_3yr <= 100));

ALTER TABLE canonical.institution_financials
  ADD CONSTRAINT chk_financials_tuition_international_nonneg CHECK (tuition_international IS NULL OR tuition_international >= 0),
  ADD CONSTRAINT chk_financials_cost_of_attendance_nonneg CHECK (cost_of_attendance IS NULL OR cost_of_attendance >= 0);
