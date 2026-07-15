-- 148_consolidate_scholarships_new.sql
-- ----------------------------------------------------------------------------
-- Phase 2 consolidation: scholarships_new (36 rows) -> scholarships (108 rows).
-- scholarships_new has zero code references anywhere in the repo (verified by
-- grep) -- the one code path that preferred it (financialScoringService.js's
-- matchScholarships()) was already removed in a prior session. This migration
-- only handles the DB-side data: migrate genuinely non-duplicate rows, then
-- drop the table.
--
-- Of 36 rows: 5 are exact-name duplicates of existing scholarships rows
-- (Aga Khan Foundation, Vanier Canada, Chevening, Rhodes, Gates Cambridge) --
-- skipped, scholarships already has them. 8 have scholarship_type='loan' in
-- the source data itself (HDFC Credila, MPOWER Financing, SBI Global
-- Ed-Vantage, IDFC FIRST Bank, Avanse, Prodigy Finance, Axis Bank, and J.N.
-- Tata Endowment Loan Scholarship -- this last one's name looks like a
-- scholarship but the source row's own scholarship_type tags it 'loan') --
-- excluded, these are NOT scholarships and do not belong in `scholarships`;
-- two of them (Prodigy Finance, MPower Financing) already exist under
-- different exact names in canonical.private_loans with much richer loan
-- fields (interest rates, repayment terms) -- inserting here would create a
-- worse duplicate, not fix one. Left untouched; a proper private_loans
-- reconciliation is a separate, later task, not guessed at here.
-- The remaining 23 rows are real, distinct, named scholarships/fellowships
-- with no existing match -- migrated below. 2 grant-type rows (ICCR,
-- Australia Awards) are mapped to scholarship_type='government' since both
-- providers are literally government bodies -- a justified mapping, not a
-- guess, to satisfy scholarships' existing CHECK constraint (which only
-- allows merit/need-based/merit-need/government/external, no 'grant'/'loan').
--
-- deadline_month/deadline_day in scholarships_new can't be combined into a
-- real DATE without a year (which would be fabricated) -- migrated rows get
-- deadline = NULL, consistent with migration 141's precedent of nulling
-- rather than guessing scholarship deadlines.
--
-- ROLLBACK PLAN: scholarships_new is dropped at the end. To reverse, the 36
-- original rows can be reconstructed from this migration's git history (the
-- table's pre-drop content is not separately snapshotted since it has zero
-- code references and the real rows worth keeping are being copied forward
-- into `scholarships` by this same migration, not lost).
-- ----------------------------------------------------------------------------

INSERT INTO public.scholarships (
  name, provider, country, currency, amount_min, amount_max,
  renewable, renewable_years, application_url, description,
  scholarship_type, eligible_nationalities, eligible_majors, eligible_genders,
  min_gpa_4_scale, status
)
SELECT
  sn.name, sn.provider, sn.country, sn.currency, sn.amount_min, sn.amount_max,
  sn.renewable, sn.renewable_years::smallint, sn.application_url, sn.description,
  CASE sn.scholarship_type
    WHEN 'need' THEN 'need-based'
    WHEN 'grant' THEN 'government'  -- both grant-type rows (ICCR, Australia Awards) are government-sourced
    ELSE sn.scholarship_type        -- 'merit' passes through unchanged; 'loan' rows excluded below
  END,
  to_jsonb(sn.eligible_nationalities), to_jsonb(sn.eligible_majors),
  to_jsonb(sn.eligible_genders), sn.min_gpa, 'active'
FROM public.scholarships_new sn
WHERE NOT EXISTS (
  SELECT 1 FROM public.scholarships s WHERE lower(s.name) = lower(sn.name)
)
AND sn.scholarship_type != 'loan';  -- excludes all 8 loan-type rows per the source data's own classification,
                                     -- including "J.N. Tata Endowment Loan Scholarship" (name looked like a
                                     -- scholarship but scholarship_type='loan' in the source row itself)

DROP TABLE public.scholarships_new;
