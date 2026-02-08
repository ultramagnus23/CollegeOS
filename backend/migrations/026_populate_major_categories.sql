-- Migration 026: Populate major_categories in colleges table
-- This migration populates the major_categories JSON field from college_programs table

-- First, update each college with its programs as major_categories JSON array
-- We need to do this row by row since SQLite doesn't have array aggregation built-in

-- Create a temporary table to hold aggregated data
CREATE TEMPORARY TABLE temp_college_majors AS
SELECT college_id, 
       '[' || GROUP_CONCAT('"' || REPLACE(program_name, '"', '\"') || '"') || ']' as major_json
FROM college_programs 
GROUP BY college_id;

-- Update colleges with their major_categories
UPDATE colleges 
SET major_categories = (
  SELECT major_json FROM temp_college_majors 
  WHERE temp_college_majors.college_id = colleges.id
)
WHERE id IN (SELECT DISTINCT college_id FROM temp_college_majors);

-- Drop temporary table
DROP TABLE temp_college_majors;

-- Also populate academic_strengths where empty (using top programs)
UPDATE colleges
SET academic_strengths = major_categories
WHERE academic_strengths IS NULL AND major_categories IS NOT NULL;
