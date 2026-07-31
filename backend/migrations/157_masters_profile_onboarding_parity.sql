-- Migration 157: masters_profile columns for onboarding parity + grad-specific depth
-- ============================================================================
-- PURPOSE
--   Masters onboarding (7 steps, 488 lines) was materially thinner than
--   undergrad onboarding (7 steps, 2,123 lines) — missing not just polish but
--   whole categories of data grad admissions actually weighs: career
--   trajectory / program fit narrative (undergrad's "Goals" step has no
--   masters equivalent at all), funding/assistantship need, thesis vs
--   coursework track, target-advisor/research fit (often the single most
--   weighted SOP element for research-track programs), and a real
--   academic/professional breakdown on recommendation letters (grad programs
--   often require a specific mix, not just a count).
--
--   All new columns are nullable/additive — existing rows and the current
--   (pre-redesign) frontend continue to work unchanged until the new
--   onboarding steps that populate them ship.
--
-- SAFETY
--   * Additive only: ALTER TABLE ADD COLUMN IF NOT EXISTS throughout.
--   * research_entries / work_entries use JSONB arrays (matches the existing
--     target_countries JSONB pattern already on this table) rather than new
--     relational tables — this is draft onboarding data, not final
--     structured application content; a heavier relational model isn't
--     warranted here.
--   * REVERSIBLE: see -- ROLLBACK block at bottom.
-- ============================================================================

ALTER TABLE masters_profile
  ADD COLUMN IF NOT EXISTS track_type TEXT,                    -- 'thesis' | 'coursework' | 'unsure'
  ADD COLUMN IF NOT EXISTS research_interests TEXT,             -- what they WANT to work on (distinct from research_experience = what they've done)
  ADD COLUMN IF NOT EXISTS advisor_targets TEXT,                -- named PIs/advisors or subfields of interest
  ADD COLUMN IF NOT EXISTS career_goals TEXT,
  ADD COLUMN IF NOT EXISTS why_this_program TEXT,
  ADD COLUMN IF NOT EXISTS funding_need TEXT,                   -- 'fully_funded_required' | 'partial_funding_preferred' | 'self_funding' | 'unsure'
  ADD COLUMN IF NOT EXISTS assistantship_interest BOOLEAN,
  ADD COLUMN IF NOT EXISTS program_format TEXT,                 -- 'on_campus' | 'online' | 'hybrid' | 'no_preference'
  ADD COLUMN IF NOT EXISTS study_pace TEXT,                     -- 'full_time' | 'part_time' | 'no_preference'
  ADD COLUMN IF NOT EXISTS lors_academic_count INTEGER,
  ADD COLUMN IF NOT EXISTS lors_professional_count INTEGER,
  ADD COLUMN IF NOT EXISTS visa_work_auth_interest BOOLEAN,
  ADD COLUMN IF NOT EXISTS research_entries JSONB,              -- [{title, role, output_type, year}]
  ADD COLUMN IF NOT EXISTS work_entries JSONB;                  -- [{title, company, years, description}]

-- ROLLBACK:
--   ALTER TABLE masters_profile
--     DROP COLUMN IF EXISTS track_type,
--     DROP COLUMN IF EXISTS research_interests,
--     DROP COLUMN IF EXISTS advisor_targets,
--     DROP COLUMN IF EXISTS career_goals,
--     DROP COLUMN IF EXISTS why_this_program,
--     DROP COLUMN IF EXISTS funding_need,
--     DROP COLUMN IF EXISTS assistantship_interest,
--     DROP COLUMN IF EXISTS program_format,
--     DROP COLUMN IF EXISTS study_pace,
--     DROP COLUMN IF EXISTS lors_academic_count,
--     DROP COLUMN IF EXISTS lors_professional_count,
--     DROP COLUMN IF EXISTS visa_work_auth_interest,
--     DROP COLUMN IF EXISTS research_entries,
--     DROP COLUMN IF EXISTS work_entries;
