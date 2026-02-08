-- Migration 025: Populate Majors Table
-- This migration populates the majors table from college_programs and adds common majors

-- ==========================================
-- POPULATE MAJORS FROM COLLEGE_PROGRAMS
-- ==========================================
-- Insert unique program names from college_programs into majors table
INSERT OR IGNORE INTO majors (major_name, major_category, stem_flag)
SELECT DISTINCT 
  program_name,
  CASE 
    WHEN program_name IN ('Computer Science', 'Data Science', 'Software Engineering', 'Information Technology', 
                          'Cybersecurity', 'AI', 'Machine Learning', 'Analytics', 'Information Systems') 
      THEN 'Technology'
    WHEN program_name IN ('Engineering', 'Aerospace Engineering', 'Biomedical Engineering', 'Chemical Engineering',
                          'Civil Engineering', 'Electrical Engineering', 'Environmental Engineering', 
                          'Industrial Engineering', 'Materials Engineering', 'Mechanical Engineering',
                          'Nuclear Engineering', 'Systems Engineering', 'Automation', 'Robotics')
      THEN 'Engineering'
    WHEN program_name IN ('Biology', 'Chemistry', 'Physics', 'Mathematics', 'Statistics', 'Astronomy',
                          'Geology', 'Oceanography', 'Environmental Science', 'Neuroscience', 'Biochemistry',
                          'Biophysics', 'Ecology', 'Genetics', 'Microbiology', 'Zoology')
      THEN 'Sciences'
    WHEN program_name IN ('Medicine', 'Nursing', 'Pharmacy', 'Public Health', 'Healthcare', 'Dentistry',
                          'Veterinary', 'Physical Therapy', 'Occupational Therapy', 'Nutrition', 'Kinesiology')
      THEN 'Health Sciences'
    WHEN program_name IN ('Business', 'Accounting', 'Accountancy', 'Finance', 'Marketing', 'Management',
                          'Economics', 'Entrepreneurship', 'Real Estate', 'Hospitality', 'International Business',
                          'Supply Chain', 'Logistics', 'Human Resources')
      THEN 'Business'
    WHEN program_name IN ('Psychology', 'Sociology', 'Political Science', 'History', 'Philosophy', 'Anthropology',
                          'Geography', 'Communications', 'Journalism', 'Media', 'Public Relations', 'Linguistics',
                          'Religious Studies', 'Gender Studies', 'Ethnic Studies', 'Cultural Studies')
      THEN 'Social Sciences'
    WHEN program_name IN ('Art', 'Art & Design', 'Art History', 'Music', 'Theatre', 'Drama', 'Film', 'Dance',
                          'Photography', 'Animation', 'Graphic Design', 'Interior Design', 'Fashion', 'Sculpture')
      THEN 'Arts & Humanities'
    WHEN program_name IN ('Law', 'Criminal Justice', 'Paralegal', 'Legal Studies', 'Criminology')
      THEN 'Law & Criminal Justice'
    WHEN program_name IN ('Education', 'Teaching', 'Special Education', 'Early Childhood', 'Curriculum')
      THEN 'Education'
    WHEN program_name IN ('Architecture', 'Urban Planning', 'Landscape Architecture', 'Construction')
      THEN 'Architecture & Planning'
    WHEN program_name IN ('Agriculture', 'Agribusiness', 'Animal Science', 'Plant Science', 'Forestry', 
                          'Horticulture', 'Food Science')
      THEN 'Agriculture'
    WHEN program_name IN ('Aerospace', 'Aeronautics', 'Aviation', 'Aerospace Management')
      THEN 'Aerospace'
    ELSE 'Other'
  END,
  CASE 
    WHEN program_name IN ('Computer Science', 'Data Science', 'Software Engineering', 'Information Technology',
                          'Cybersecurity', 'AI', 'Machine Learning', 'Analytics', 'Engineering',
                          'Aerospace Engineering', 'Biomedical Engineering', 'Chemical Engineering',
                          'Civil Engineering', 'Electrical Engineering', 'Environmental Engineering',
                          'Industrial Engineering', 'Materials Engineering', 'Mechanical Engineering',
                          'Nuclear Engineering', 'Systems Engineering', 'Biology', 'Chemistry', 'Physics',
                          'Mathematics', 'Statistics', 'Astronomy', 'Geology', 'Oceanography', 'Neuroscience',
                          'Biochemistry', 'Biophysics', 'Genetics', 'Microbiology', 'Robotics', 'Automation')
      THEN 1
    ELSE 0
  END
FROM college_programs
WHERE program_name IS NOT NULL AND TRIM(program_name) != '';

-- ==========================================
-- ADD ADDITIONAL COMMON MAJORS IF MISSING
-- ==========================================
INSERT OR IGNORE INTO majors (major_name, major_category, stem_flag) VALUES
-- Technology/Computer Science
('Computer Science', 'Technology', 1),
('Data Science', 'Technology', 1),
('Software Engineering', 'Technology', 1),
('Information Technology', 'Technology', 1),
('Cybersecurity', 'Technology', 1),
('Artificial Intelligence', 'Technology', 1),
('Machine Learning', 'Technology', 1),
('Information Systems', 'Technology', 1),
('Computer Engineering', 'Technology', 1),

-- Engineering
('Mechanical Engineering', 'Engineering', 1),
('Electrical Engineering', 'Engineering', 1),
('Civil Engineering', 'Engineering', 1),
('Chemical Engineering', 'Engineering', 1),
('Aerospace Engineering', 'Engineering', 1),
('Biomedical Engineering', 'Engineering', 1),
('Industrial Engineering', 'Engineering', 1),
('Environmental Engineering', 'Engineering', 1),
('Materials Engineering', 'Engineering', 1),
('Nuclear Engineering', 'Engineering', 1),

-- Sciences
('Biology', 'Sciences', 1),
('Chemistry', 'Sciences', 1),
('Physics', 'Sciences', 1),
('Mathematics', 'Sciences', 1),
('Statistics', 'Sciences', 1),
('Environmental Science', 'Sciences', 1),
('Neuroscience', 'Sciences', 1),
('Biochemistry', 'Sciences', 1),
('Genetics', 'Sciences', 1),
('Marine Biology', 'Sciences', 1),

-- Health Sciences
('Medicine', 'Health Sciences', 0),
('Nursing', 'Health Sciences', 0),
('Pre-Med', 'Health Sciences', 0),
('Public Health', 'Health Sciences', 0),
('Pharmacy', 'Health Sciences', 0),
('Physical Therapy', 'Health Sciences', 0),
('Dentistry', 'Health Sciences', 0),
('Veterinary Science', 'Health Sciences', 0),
('Nutrition', 'Health Sciences', 0),
('Kinesiology', 'Health Sciences', 0),

-- Business
('Business Administration', 'Business', 0),
('Finance', 'Business', 0),
('Marketing', 'Business', 0),
('Accounting', 'Business', 0),
('Economics', 'Business', 0),
('Management', 'Business', 0),
('Entrepreneurship', 'Business', 0),
('International Business', 'Business', 0),
('Supply Chain Management', 'Business', 0),
('Human Resources', 'Business', 0),

-- Social Sciences
('Psychology', 'Social Sciences', 0),
('Sociology', 'Social Sciences', 0),
('Political Science', 'Social Sciences', 0),
('International Relations', 'Social Sciences', 0),
('Anthropology', 'Social Sciences', 0),
('Geography', 'Social Sciences', 0),
('Communications', 'Social Sciences', 0),
('Journalism', 'Social Sciences', 0),
('Public Relations', 'Social Sciences', 0),
('Linguistics', 'Social Sciences', 0),

-- Arts & Humanities
('English', 'Arts & Humanities', 0),
('History', 'Arts & Humanities', 0),
('Philosophy', 'Arts & Humanities', 0),
('Art', 'Arts & Humanities', 0),
('Music', 'Arts & Humanities', 0),
('Theatre', 'Arts & Humanities', 0),
('Film Studies', 'Arts & Humanities', 0),
('Creative Writing', 'Arts & Humanities', 0),
('Art History', 'Arts & Humanities', 0),
('Religious Studies', 'Arts & Humanities', 0),

-- Languages
('Spanish', 'Languages', 0),
('French', 'Languages', 0),
('German', 'Languages', 0),
('Chinese', 'Languages', 0),
('Japanese', 'Languages', 0),
('Arabic', 'Languages', 0),
('Russian', 'Languages', 0),
('Portuguese', 'Languages', 0),
('Italian', 'Languages', 0),
('Korean', 'Languages', 0),

-- Education
('Education', 'Education', 0),
('Elementary Education', 'Education', 0),
('Secondary Education', 'Education', 0),
('Special Education', 'Education', 0),
('Early Childhood Education', 'Education', 0),

-- Law & Criminal Justice
('Pre-Law', 'Law & Criminal Justice', 0),
('Criminal Justice', 'Law & Criminal Justice', 0),
('Criminology', 'Law & Criminal Justice', 0),
('Legal Studies', 'Law & Criminal Justice', 0),

-- Architecture & Design
('Architecture', 'Architecture & Design', 0),
('Interior Design', 'Architecture & Design', 0),
('Graphic Design', 'Architecture & Design', 0),
('Industrial Design', 'Architecture & Design', 0),
('Urban Planning', 'Architecture & Design', 0),
('Fashion Design', 'Architecture & Design', 0),

-- Agriculture & Environmental
('Agriculture', 'Agriculture', 0),
('Animal Science', 'Agriculture', 0),
('Food Science', 'Agriculture', 0),
('Forestry', 'Agriculture', 0),
('Sustainability', 'Agriculture', 0);

-- ==========================================
-- REBUILD FULL-TEXT SEARCH INDEX
-- ==========================================
-- Drop and rebuild FTS data
DELETE FROM majors_fts;
INSERT INTO majors_fts(rowid, major_name, description, synonyms)
SELECT id, major_name, description, synonyms FROM majors;
