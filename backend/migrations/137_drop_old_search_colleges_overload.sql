-- Migration 137: drop the old 10-arg search_colleges overload
--
-- CREATE OR REPLACE FUNCTION does not replace a function when the parameter
-- list changes (adding p_program in migration 136) -- it silently creates a
-- second overloaded function instead, coexisting with the original. Any call
-- passing exactly 10 positional args (or naming only the original params)
-- became ambiguous between the two overloads ("is not unique" / "Could not
-- choose a best candidate function", caught immediately when verifying 136
-- live). Drop the old signature explicitly so only the 11-arg version with
-- p_program remains.

DROP FUNCTION IF EXISTS canonical.search_colleges(
  text, text, text, numeric, numeric, numeric, boolean, text, integer, integer
);
