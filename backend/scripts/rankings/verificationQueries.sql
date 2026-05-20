-- Canonical read path verification
SELECT COUNT(*) AS cards_count FROM canonical.mv_college_cards;
SELECT COUNT(*) AS institutions_count FROM canonical.institutions;
SELECT COUNT(*) AS rankings_count FROM canonical.institution_rankings;

-- Coverage checks for discovery fields
SELECT
  COUNT(*) FILTER (WHERE popularity_score IS NOT NULL AND popularity_score > 0) AS with_popularity,
  COUNT(*) FILTER (WHERE global_rank IS NOT NULL) AS with_global_rank,
  COUNT(*) FILTER (WHERE acceptance_rate IS NOT NULL) AS with_acceptance_rate
FROM canonical.mv_college_cards;

-- Top discovery sanity
SELECT id, canonical_name, country_code, popularity_score, global_rank
FROM canonical.mv_college_cards
ORDER BY popularity_score DESC NULLS LAST, global_rank ASC NULLS LAST
LIMIT 25;

-- Legacy tables should be read-unused for runtime paths (manual grep check companion)
-- grep -R "public.clean_colleges\|public.colleges_full\|public.colleges\|college_admissions\|college_financial_data\|academic_details\|academic_outcomes\|college_rankings" backend/src src

