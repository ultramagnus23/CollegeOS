-- Migration 124: add a budget preference to masters_profile (onboarding parity)
--
-- Undergrad onboarding collects a budget/cost-sensitivity signal and the masters
-- DISCOVERY endpoint already consumes a `budgetMax` filter — but masters
-- onboarding never captured it, so the filter was always empty. This adds a real
-- storage home so the collected budget is persisted AND fed into discovery.
-- Additive, idempotent.

ALTER TABLE public.masters_profile
  ADD COLUMN IF NOT EXISTS target_budget_max      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS target_budget_currency TEXT;
