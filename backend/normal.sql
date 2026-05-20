-- =====================================================
-- CollegeOS: COLLEGE TABLE DATA QUALITY COMPARISON
-- Run each section separately, compare results
-- =====================================================

-- ============ SECTION 1: BASIC ROW COUNTS ============
SELECT 'colleges' as table_name, COUNT(*) as total_rows FROM public.colleges
UNION ALL
SELECT 'colleges_comprehensive', COUNT(*) FROM public.colleges_comprehensive
UNION ALL
SELECT 'colleges_v2', COUNT(*) FROM public.colleges_v2
ORDER BY total_rows DESC;

-- ============ SECTION 2: DATA COMPLETENESS (% NON-NULL) ============
-- This shows which table has most complete data

SELECT 'colleges' as table_name,
  ROUND(100.0 * COUNT(CASE WHEN name IS NOT NULL THEN 1 END) / COUNT(*), 1) as name_pct,
  ROUND(100.0 * COUNT(CASE WHEN country IS NOT NULL THEN 1 END) / COUNT(*), 1) as country_pct,
  ROUND(100.0 * COUNT(CASE WHEN city IS NOT NULL THEN 1 END) / COUNT(*), 1) as city_pct,
  ROUND(100.0 * COUNT(CASE WHEN acceptance_rate IS NOT NULL THEN 1 END) / COUNT(*), 1) as acceptance_pct,
  ROUND(100.0 * COUNT(CASE WHEN official_website IS NOT NULL THEN 1 END) / COUNT(*), 1) as website_pct,
  ROUND(100.0 * COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) / COUNT(*), 1) as lat_pct,
  ROUND(100.0 * COUNT(CASE WHEN total_enrollment IS NOT NULL THEN 1 END) / COUNT(*), 1) as enrollment_pct,
  ROUND(100.0 * COUNT(CASE WHEN description IS NOT NULL THEN 1 END) / COUNT(*), 1) as desc_pct
FROM public.colleges

UNION ALL

SELECT 'colleges_comprehensive',
  ROUND(100.0 * COUNT(CASE WHEN name IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN country IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN city IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN acceptance_rate IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN website_url IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN total_enrollment IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN description IS NOT NULL THEN 1 END) / COUNT(*), 1)
FROM public.colleges_comprehensive

UNION ALL

SELECT 'colleges_v2',
  ROUND(100.0 * COUNT(CASE WHEN name IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN location_country IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN location_city IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN acceptance_rate IS NOT NULL THEN 1 END) / COUNT(*), 1),
  ROUND(100.0 * COUNT(CASE WHEN website_url IS NOT NULL THEN 1 END) / COUNT(*), 1),
  0.0, -- no latitude in v2
  ROUND(100.0 * COUNT(CASE WHEN total_enrollment IS NOT NULL THEN 1 END) / COUNT(*), 1),
  0.0 -- no description in v2
FROM public.colleges_v2;

-- ============ SECTION 3: DUPLICATE CHECK ============
-- Count colleges with same name + country (potential dupes)

SELECT 'colleges' as table_name,
  COUNT(DISTINCT name || '|' || COALESCE(country, 'NULL')) as unique_institutions,
  COUNT(*) as total_rows,
  ROUND(100.0 * COUNT(DISTINCT name || '|' || COALESCE(country, 'NULL')) / COUNT(*), 1) as uniqueness_pct
FROM public.colleges

UNION ALL

SELECT 'colleges_comprehensive',
  COUNT(DISTINCT name || '|' || COALESCE(country, 'NULL')),
  COUNT(*),
  ROUND(100.0 * COUNT(DISTINCT name || '|' || COALESCE(country, 'NULL')) / COUNT(*), 1)
FROM public.colleges_comprehensive

UNION ALL

SELECT 'colleges_v2',
  COUNT(DISTINCT name || '|' || COALESCE(location_country, 'NULL')),
  COUNT(*),
  ROUND(100.0 * COUNT(DISTINCT name || '|' || COALESCE(location_country, 'NULL')) / COUNT(*), 1)
FROM public.colleges_v2;

-- ============ SECTION 4: FOREIGN KEY HEALTH ============
-- Which table's colleges have matching rows in detail tables?

SELECT 'colleges' as table_name,
  COUNT(*) as total_colleges,
  COUNT(CASE WHEN id IN (SELECT DISTINCT college_id FROM public.college_admissions) THEN 1 END) as with_admissions_data,
  COUNT(CASE WHEN id IN (SELECT DISTINCT college_id FROM public.college_financial_data) THEN 1 END) as with_financial_data,
  COUNT(CASE WHEN id IN (SELECT DISTINCT college_id FROM public.academic_details) THEN 1 END) as with_academic_data,
  COUNT(CASE WHEN id IN (SELECT DISTINCT college_id FROM public.college_deadlines) THEN 1 END) as with_deadlines
FROM public.colleges

UNION ALL

SELECT 'colleges_comprehensive',
  COUNT(*),
  COUNT(CASE WHEN id IN (SELECT DISTINCT college_id FROM public.college_admissions) THEN 1 END),
  COUNT(CASE WHEN id IN (SELECT DISTINCT college_id FROM public.college_financial_data) THEN 1 END),
  COUNT(CASE WHEN id IN (SELECT DISTINCT college_id FROM public.academic_details) THEN 1 END),
  COUNT(CASE WHEN id IN (SELECT DISTINCT college_id FROM public.college_deadlines) THEN 1 END)
FROM public.colleges_comprehensive;

-- ============ SECTION 5: DATA QUALITY SCORES (if available) ============
-- If colleges_comprehensive has quality metrics

SELECT 'colleges' as table_name,
  COUNT(*) as total,
  ROUND(AVG(COALESCE(data_quality_score, 0)), 2) as avg_quality_score,
  SUM(CASE WHEN is_corrupted = true THEN 1 ELSE 0 END) as corrupted_count
FROM public.colleges

UNION ALL

SELECT 'colleges_comprehensive',
  COUNT(*),
  ROUND(AVG(COALESCE(data_quality_score, 0)), 2),
  SUM(CASE WHEN is_corrupted = true THEN 1 ELSE 0 END)
FROM public.colleges_comprehensive;

-- ============ SECTION 6: RICHNESS OF DATA ============
-- Which table has most fields filled per college (average)

SELECT 'colleges' as table_name,
  COUNT(*) as total_colleges,
  ROUND(AVG(
    (CASE WHEN name IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN country IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN state IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN city IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN acceptance_rate IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN official_website IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN longitude IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN total_enrollment IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN description IS NOT NULL THEN 1 ELSE 0 END)
  ), 2) as avg_fields_per_college
FROM public.colleges

UNION ALL

SELECT 'colleges_comprehensive',
  COUNT(*),
  ROUND(AVG(
    (CASE WHEN name IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN country IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN state_region IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN city IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN acceptance_rate IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN website_url IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN longitude IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN total_enrollment IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN description IS NOT NULL THEN 1 ELSE 0 END)
  ), 2)
FROM public.colleges_comprehensive;

-- ============ SECTION 7: SAMPLE DATA (spot check) ============
-- Look at actual data to see what each table looks like

SELECT 'colleges' as source, id, name, country, state, city, acceptance_rate, total_enrollment
FROM public.colleges
LIMIT 5;

SELECT 'colleges_comprehensive', id, name, country, state_region, city, acceptance_rate, total_enrollment
FROM public.colleges_comprehensive
LIMIT 5;

SELECT 'colleges_v2', id, name, location_country, location_state, location_city, acceptance_rate, total_enrollment
FROM public.colleges_v2
LIMIT 5;

-- ============ SECTION 8: OVERLAP ANALYSIS ============
-- Which colleges appear in multiple tables?

SELECT 
  'colleges ∩ colleges_comprehensive' as overlap,
  COUNT(*) as matching_by_name_country
FROM (
  SELECT c.name, c.country
  FROM public.colleges c
  INTERSECT
  SELECT cc.name, cc.country
  FROM public.colleges_comprehensive cc
) x

UNION ALL

SELECT 
  'colleges ∩ colleges_v2',
  COUNT(*)
FROM (
  SELECT c.name, c.country
  FROM public.colleges c
  INTERSECT
  SELECT cv.name, cv.location_country
  FROM public.colleges_v2 cv
) x

UNION ALL

SELECT 
  'colleges_comprehensive ∩ colleges_v2',
  COUNT(*)
FROM (
  SELECT cc.name, cc.country
  FROM public.colleges_comprehensive cc
  INTERSECT
  SELECT cv.name, cv.location_country
  FROM public.colleges_v2 cv
) x;

-- ============ SUMMARY ============
-- Run this at the end to see which is best for each metric:

/*
INTERPRETATION GUIDE:
======================

1. Row Count: Higher is better (more colleges covered)

2. Completeness (%): Higher % means fewer NULL values
   - Target: 80%+ for critical fields (name, country, city)
   - Target: 50%+ for financial data (acceptance_rate, enrollment)

3. Uniqueness %: Should be ~100% (no duplicates)
   - Below 95% = significant duplicates, manual cleanup needed

4. Foreign Key Coverage: Higher = more enriched detail data
   - If colleges_comprehensive has 8000 colleges but only 6000 have admissions data,
     that's a problem. Check if admissions data is split across tables.

5. Data Quality Score: If available, higher is better (0-1 scale)

6. Avg Fields Per College: Higher = more complete records

7. Sample Data: Does it look reasonable? Any obvious errors?

8. Overlap: Use this to understand data flow
   - 100% overlap = tables are synchronized
   - Partial overlap = tables have different coverage areas
*/