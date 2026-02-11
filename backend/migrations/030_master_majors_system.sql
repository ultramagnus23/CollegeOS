-- Migration 030: Master Majors System
-- Creates master list of majors and college-major relationships
-- Enables efficient cross-college major queries

-- ============================================================================
-- Table 1: master_majors - ~100 common majors with categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS master_majors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  major_name TEXT NOT NULL UNIQUE,
  major_category TEXT NOT NULL,  -- STEM, Humanities, Arts, Business, etc.
  cip_code TEXT,  -- Classification of Instructional Programs code
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups by category
CREATE INDEX IF NOT EXISTS idx_master_majors_category ON master_majors(major_category);
CREATE INDEX IF NOT EXISTS idx_master_majors_name ON master_majors(major_name);

-- ============================================================================
-- Table 2: college_majors_offered - Junction table with boolean flags
-- ============================================================================
CREATE TABLE IF NOT EXISTS college_majors_offered (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  major_id INTEGER NOT NULL,
  is_offered BOOLEAN DEFAULT 1,  -- TRUE if college offers this major
  program_name TEXT,  -- College-specific name for this major
  degree_types TEXT,  -- JSON array: ["BA", "BS", "MA", "MS", "PhD"]
  department TEXT,  -- Department offering this major
  is_popular BOOLEAN DEFAULT 0,  -- TRUE if this is a popular major at this college
  ranking_in_major INTEGER,  -- College's ranking for this specific major (if known)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  FOREIGN KEY (major_id) REFERENCES master_majors(id) ON DELETE CASCADE,
  UNIQUE(college_id, major_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_college_majors_college ON college_majors_offered(college_id);
CREATE INDEX IF NOT EXISTS idx_college_majors_major ON college_majors_offered(major_id);
CREATE INDEX IF NOT EXISTS idx_college_majors_offered ON college_majors_offered(is_offered);
CREATE INDEX IF NOT EXISTS idx_college_majors_popular ON college_majors_offered(is_popular);

-- ============================================================================
-- Table 3: top_colleges_by_major - Pre-computed rankings per major
-- ============================================================================
CREATE TABLE IF NOT EXISTS top_colleges_by_major (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  major_id INTEGER NOT NULL,
  college_id INTEGER NOT NULL,
  rank_position INTEGER NOT NULL,  -- 1, 2, 3, etc.
  ranking_source TEXT,  -- 'US News', 'QS', 'THE', etc.
  ranking_year INTEGER,
  score REAL,  -- Ranking score if available
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (major_id) REFERENCES master_majors(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(major_id, college_id, ranking_source)
);

-- Indexes for fast ranking queries
CREATE INDEX IF NOT EXISTS idx_top_colleges_major ON top_colleges_by_major(major_id, rank_position);
CREATE INDEX IF NOT EXISTS idx_top_colleges_source ON top_colleges_by_major(ranking_source);

-- ============================================================================
-- Insert 100 Common Majors
-- ============================================================================

-- STEM Majors
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Computer Science', 'STEM', '11.0701'),
  ('Computer Engineering', 'STEM', '14.0901'),
  ('Electrical Engineering', 'STEM', '14.1001'),
  ('Mechanical Engineering', 'STEM', '14.1901'),
  ('Civil Engineering', 'STEM', '14.0801'),
  ('Chemical Engineering', 'STEM', '14.0701'),
  ('Biomedical Engineering', 'STEM', '14.0501'),
  ('Aerospace Engineering', 'STEM', '14.0201'),
  ('Mathematics', 'STEM', '27.0101'),
  ('Statistics', 'STEM', '27.0501'),
  ('Physics', 'STEM', '40.0801'),
  ('Chemistry', 'STEM', '40.0501'),
  ('Biology', 'STEM', '26.0101'),
  ('Biochemistry', 'STEM', '26.0202'),
  ('Molecular Biology', 'STEM', '26.0406'),
  ('Neuroscience', 'STEM', '26.1501'),
  ('Data Science', 'STEM', '11.0104'),
  ('Information Technology', 'STEM', '11.0103'),
  ('Software Engineering', 'STEM', '14.0903'),
  ('Environmental Science', 'STEM', '03.0104');

-- Business & Economics
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Business Administration', 'Business', '52.0201'),
  ('Economics', 'Business', '45.0601'),
  ('Finance', 'Business', '52.0801'),
  ('Accounting', 'Business', '52.0301'),
  ('Marketing', 'Business', '52.1401'),
  ('Management', 'Business', '52.0101'),
  ('Entrepreneurship', 'Business', '52.0701'),
  ('International Business', 'Business', '52.1101'),
  ('Business Analytics', 'Business', '52.1301'),
  ('Supply Chain Management', 'Business', '52.0203');

-- Social Sciences
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Psychology', 'Social Sciences', '42.0101'),
  ('Sociology', 'Social Sciences', '45.1101'),
  ('Anthropology', 'Social Sciences', '45.0201'),
  ('Political Science', 'Social Sciences', '45.1001'),
  ('International Relations', 'Social Sciences', '45.0901'),
  ('Public Policy', 'Social Sciences', '44.0401'),
  ('Criminal Justice', 'Social Sciences', '43.0104'),
  ('Social Work', 'Social Sciences', '44.0701'),
  ('Urban Studies', 'Social Sciences', '45.1201'),
  ('Geography', 'Social Sciences', '45.0701');

-- Humanities
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('English Literature', 'Humanities', '23.0101'),
  ('History', 'Humanities', '54.0101'),
  ('Philosophy', 'Humanities', '38.0101'),
  ('Religious Studies', 'Humanities', '38.0201'),
  ('Classics', 'Humanities', '16.1200'),
  ('Comparative Literature', 'Humanities', '16.0104'),
  ('Linguistics', 'Humanities', '16.0102'),
  ('Creative Writing', 'Humanities', '23.1302'),
  ('Art History', 'Humanities', '50.0703'),
  ('Cultural Studies', 'Humanities', '30.2601');

-- Arts & Media
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Fine Arts', 'Arts', '50.0701'),
  ('Graphic Design', 'Arts', '50.0409'),
  ('Music', 'Arts', '50.0901'),
  ('Theater', 'Arts', '50.0501'),
  ('Film Studies', 'Arts', '50.0601'),
  ('Photography', 'Arts', '50.0605'),
  ('Dance', 'Arts', '50.0301'),
  ('Media Studies', 'Arts', '09.0102'),
  ('Communications', 'Arts', '09.0101'),
  ('Journalism', 'Arts', '09.0401');

-- Health & Medicine
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Pre-Medicine', 'Health', '51.1101'),
  ('Nursing', 'Health', '51.1601'),
  ('Public Health', 'Health', '51.2201'),
  ('Health Administration', 'Health', '51.0701'),
  ('Pharmacy', 'Health', '51.2001'),
  ('Physical Therapy', 'Health', '51.2308'),
  ('Occupational Therapy', 'Health', '51.2306'),
  ('Nutrition', 'Health', '51.3101'),
  ('Kinesiology', 'Health', '31.0505'),
  ('Sports Medicine', 'Health', '51.0913');

-- Education
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Education', 'Education', '13.0101'),
  ('Elementary Education', 'Education', '13.1202'),
  ('Secondary Education', 'Education', '13.1205'),
  ('Special Education', 'Education', '13.1001'),
  ('Educational Psychology', 'Education', '42.2806'),
  ('Curriculum and Instruction', 'Education', '13.0301');

-- Architecture & Planning
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Architecture', 'Architecture', '04.0201'),
  ('Urban Planning', 'Architecture', '04.0301'),
  ('Landscape Architecture', 'Architecture', '04.0601'),
  ('Interior Design', 'Architecture', '50.0408');

-- Law & Government
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Pre-Law', 'Law', '22.0001'),
  ('Legal Studies', 'Law', '22.0101'),
  ('Government', 'Law', '45.1001'),
  ('Public Administration', 'Law', '44.0401');

-- Agriculture & Environment
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Environmental Studies', 'Environment', '03.0103'),
  ('Agriculture', 'Environment', '01.0000'),
  ('Forestry', 'Environment', '03.0501'),
  ('Marine Biology', 'Environment', '26.1302'),
  ('Sustainability Studies', 'Environment', '03.0199');

-- Languages
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Spanish', 'Languages', '16.0905'),
  ('French', 'Languages', '16.0901'),
  ('German', 'Languages', '16.0501'),
  ('Chinese', 'Languages', '16.0301'),
  ('Japanese', 'Languages', '16.0302'),
  ('Arabic', 'Languages', '16.0102');

-- Interdisciplinary
INSERT OR IGNORE INTO master_majors (major_name, major_category, cip_code) VALUES
  ('Liberal Arts', 'Interdisciplinary', '24.0101'),
  ('Gender Studies', 'Interdisciplinary', '05.0207'),
  ('African American Studies', 'Interdisciplinary', '05.0201'),
  ('Asian Studies', 'Interdisciplinary', '05.0103'),
  ('Latin American Studies', 'Interdisciplinary', '05.0106'),
  ('American Studies', 'Interdisciplinary', '05.0102');

-- Migration complete
SELECT 'Migration 030 complete: Created master_majors system with ' || COUNT(*) || ' majors' 
FROM master_majors;
