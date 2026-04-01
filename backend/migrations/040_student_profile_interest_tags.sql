-- Migration 040: Add interest_tags, career_goals and why_college to student_profiles
--
-- interest_tags: JSON array of matched interest keywords derived from career goals
--                (e.g. ["engineering","research"]) — populated by the automation service
-- career_goals:  free-text string from onboarding ("I want to study…")
-- why_college:   free-text string from onboarding ("I am applying to college because…")

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS career_goals TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS why_college TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS interest_tags TEXT; -- JSON array
