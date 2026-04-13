-- scripts/verify_integrity.sql
-- ---------------------------------------------------------------------------
-- Verification script — run in the Supabase SQL editor (or psql) after every
-- seed to confirm data integrity.  Prints a comprehensive report covering:
--   1. Total colleges and distinct ipeds_unit_id counts
--   2. Duplicate ipeds_unit_id groups
--   3. Duplicate (name, country) groups
--   4. Orphaned foreign-key rows in each dependent table
--   5. Duplicate composite keys in college_majors
--   6. Sample mismatched rows (colleges in child tables but not in parent)
--   7. Canonical view row count
-- ---------------------------------------------------------------------------

-- ── 1. Summary counts ───────────────────────────────────────────────────────
SELECT
  'colleges_comprehensive'                             AS check_name,
  COUNT(*)                                             AS total_rows,
  COUNT(DISTINCT id)                                   AS distinct_ids,
  COUNT(ipeds_unit_id)                                 AS rows_with_ipeds,
  COUNT(DISTINCT ipeds_unit_id)                        AS distinct_ipeds_ids,
  COUNT(*) - COUNT(ipeds_unit_id)                      AS null_ipeds_rows,
  COUNT(*) FILTER (WHERE ipeds_unit_id IS NOT NULL)
    - COUNT(DISTINCT ipeds_unit_id)                    AS duplicate_ipeds_rows
FROM colleges_comprehensive;

-- ── 2. Duplicate ipeds_unit_id groups ───────────────────────────────────────
SELECT
  ipeds_unit_id,
  COUNT(*) AS duplicate_count,
  MIN(id)  AS min_id,
  MAX(id)  AS max_id,
  string_agg(name, ' | ' ORDER BY id) AS college_names
FROM colleges_comprehensive
WHERE ipeds_unit_id IS NOT NULL
GROUP BY ipeds_unit_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, ipeds_unit_id
LIMIT 50;

-- ── 3. Duplicate (name, country) groups ─────────────────────────────────────
SELECT
  name,
  country,
  COUNT(*) AS duplicate_count,
  MIN(id)  AS min_id,
  MAX(id)  AS max_id
FROM colleges_comprehensive
GROUP BY name, country
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, name
LIMIT 50;

-- ── 4. Orphaned foreign-key rows ─────────────────────────────────────────────
SELECT 'college_admissions'     AS table_name,
       COUNT(*)                 AS orphaned_rows
FROM   college_admissions ca
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc
         WHERE  cc.id = ca.college_id
       )
UNION ALL
SELECT 'college_financial_data',
       COUNT(*)
FROM   college_financial_data cfd
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc
         WHERE  cc.id = cfd.college_id
       )
UNION ALL
SELECT 'academic_details',
       COUNT(*)
FROM   academic_details ad
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc
         WHERE  cc.id = ad.college_id
       )
UNION ALL
SELECT 'college_majors',
       COUNT(*)
FROM   college_majors cm
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc
         WHERE  cc.id = cm.college_id
       )
UNION ALL
SELECT 'college_programs',
       COUNT(*)
FROM   college_programs cp
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc
         WHERE  cc.id = cp.college_id
       )
UNION ALL
SELECT 'student_demographics',
       COUNT(*)
FROM   student_demographics sd
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc
         WHERE  cc.id = sd.college_id
       )
UNION ALL
SELECT 'campus_life',
       COUNT(*)
FROM   campus_life cl
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc
         WHERE  cc.id = cl.college_id
       )
ORDER BY orphaned_rows DESC;

-- ── 5. Duplicate composite keys in college_majors ───────────────────────────
SELECT
  college_id,
  major_id,
  COUNT(*) AS duplicate_count,
  string_agg(CAST(awlevel AS TEXT), ', ' ORDER BY awlevel) AS awlevels
FROM college_majors
GROUP BY college_id, major_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 50;

-- ── 6. Sample mismatched rows (child rows referencing a non-existent parent) ─
-- Shows up to 10 sample rows per table to aid debugging.

SELECT 'college_admissions' AS table_name,
        ca.id               AS row_id,
        ca.college_id
FROM   college_admissions ca
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = ca.college_id
       )
LIMIT 10;

SELECT 'college_financial_data' AS table_name,
        cfd.id                  AS row_id,
        cfd.college_id
FROM   college_financial_data cfd
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = cfd.college_id
       )
LIMIT 10;

SELECT 'college_majors'  AS table_name,
        cm.college_id,
        cm.major_id
FROM   college_majors cm
WHERE  NOT EXISTS (
         SELECT 1 FROM colleges_comprehensive cc WHERE cc.id = cm.college_id
       )
LIMIT 10;

-- ── 7. Canonical view health ─────────────────────────────────────────────────
SELECT
  COUNT(*)                                           AS canonical_total,
  COUNT(DISTINCT id)                                 AS canonical_distinct_ids,
  COUNT(*) - COUNT(DISTINCT id)                      AS canonical_duplicates,
  COUNT(adm_acceptance_rate)                         AS rows_with_acceptance_rate,
  COUNT(sat_avg)                                     AS rows_with_sat_avg,
  COUNT(tuition_in_state)                            AS rows_with_tuition
FROM colleges_canonical;
