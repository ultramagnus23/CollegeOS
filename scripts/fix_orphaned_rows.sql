-- scripts/fix_orphaned_rows.sql
--
-- Re-links the 117 orphaned rows in college_admissions, college_financial_data,
-- academic_details, college_programs, student_demographics, and campus_life
-- back to colleges_comprehensive using the college_name column that was preserved
-- during the initial data load.
--
-- Run this in the Supabase SQL Editor AFTER the fill_missing.py scraper has
-- added any colleges that were missing from colleges_comprehensive.
--
-- The final ALTER TABLE statements drop the temporary college_name helper columns
-- once re-linking is complete.

-- ─── Re-link orphaned rows ────────────────────────────────────────────────────

UPDATE college_admissions ca
   SET college_id = cc.id
  FROM colleges_comprehensive cc
 WHERE ca.college_name = cc.name
   AND ca.college_id IS NULL;

UPDATE college_financial_data cfd
   SET college_id = cc.id
  FROM colleges_comprehensive cc
 WHERE cfd.college_name = cc.name
   AND cfd.college_id IS NULL;

UPDATE academic_details ad
   SET college_id = cc.id
  FROM colleges_comprehensive cc
 WHERE ad.college_name = cc.name
   AND ad.college_id IS NULL;

UPDATE college_programs cp
   SET college_id = cc.id
  FROM colleges_comprehensive cc
 WHERE cp.college_name = cc.name
   AND cp.college_id IS NULL;

UPDATE student_demographics sd
   SET college_id = cc.id
  FROM colleges_comprehensive cc
 WHERE sd.college_name = cc.name
   AND sd.college_id IS NULL;

UPDATE campus_life cl
   SET college_id = cc.id
  FROM colleges_comprehensive cc
 WHERE cl.college_name = cc.name
   AND cl.college_id IS NULL;

-- ─── Verification: check remaining orphan counts ──────────────────────────────
SELECT 'college_admissions'      AS tbl, COUNT(*) AS remaining_orphans FROM college_admissions      WHERE college_id IS NULL
UNION ALL
SELECT 'college_financial_data'  AS tbl, COUNT(*) AS remaining_orphans FROM college_financial_data  WHERE college_id IS NULL
UNION ALL
SELECT 'academic_details'        AS tbl, COUNT(*) AS remaining_orphans FROM academic_details        WHERE college_id IS NULL
UNION ALL
SELECT 'college_programs'        AS tbl, COUNT(*) AS remaining_orphans FROM college_programs        WHERE college_id IS NULL
UNION ALL
SELECT 'student_demographics'    AS tbl, COUNT(*) AS remaining_orphans FROM student_demographics    WHERE college_id IS NULL
UNION ALL
SELECT 'campus_life'             AS tbl, COUNT(*) AS remaining_orphans FROM campus_life             WHERE college_id IS NULL;

-- ─── Drop the temporary college_name helper columns ──────────────────────────
-- Only run the ALTER TABLE statements below AFTER confirming 0 remaining orphans
-- from the SELECT above.  Comment them out if you need to investigate further.

ALTER TABLE college_admissions      DROP COLUMN IF EXISTS college_name;
ALTER TABLE college_financial_data  DROP COLUMN IF EXISTS college_name;
ALTER TABLE academic_details        DROP COLUMN IF EXISTS college_name;
ALTER TABLE college_programs        DROP COLUMN IF EXISTS college_name;
ALTER TABLE student_demographics    DROP COLUMN IF EXISTS college_name;
ALTER TABLE campus_life             DROP COLUMN IF EXISTS college_name;
