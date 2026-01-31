-- Migration 012: Normalized Majors Database
-- This migration implements a many-to-many relationship between colleges and majors
-- using a master majors catalog table and a join table.

-- ==========================================
-- 1. MAJORS MASTER CATALOG TABLE
-- ==========================================
-- This table represents the global dictionary of majors
CREATE TABLE IF NOT EXISTS majors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Major identification
  major_name TEXT NOT NULL UNIQUE,
  major_category TEXT,  -- STEM, Arts, Business, Health, Social Sciences, etc.
  cip_code TEXT,        -- Classification of Instructional Programs code
  
  -- Classification flags
  stem_flag INTEGER DEFAULT 0,
  
  -- Description and aliases
  description TEXT,
  synonyms TEXT,        -- JSON array of alternative names
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. COLLEGE_MAJORS JOIN TABLE (Normalized)
-- ==========================================
-- This table links colleges to majors with a proper many-to-many relationship
CREATE TABLE IF NOT EXISTS college_majors_normalized (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Foreign keys
  college_id INTEGER NOT NULL,
  major_id INTEGER NOT NULL,
  
  -- Degree information
  degree_type TEXT,     -- Bachelor's, Master's, PhD, Certificate, Associate
  
  -- Analytics data
  enrollment INTEGER,
  acceptance_rate REAL,
  popularity_index REAL,      -- Calculated metric for how popular this major is at this school
  ranking_in_school INTEGER,  -- Ranking within the school (1 = most popular)
  
  -- Offering status
  offered_flag INTEGER DEFAULT 1,  -- Whether currently offered
  
  -- Temporal tracking
  year INTEGER,
  
  -- Data quality
  source TEXT,
  confidence_score REAL DEFAULT 0.5,
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraints
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  FOREIGN KEY (major_id) REFERENCES majors(id) ON DELETE CASCADE,
  
  -- Enforce uniqueness on college-major-year combination
  UNIQUE(college_id, major_id, year)
);

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================

-- Majors table indexes
CREATE INDEX IF NOT EXISTS idx_majors_name ON majors(major_name);
CREATE INDEX IF NOT EXISTS idx_majors_category ON majors(major_category);
CREATE INDEX IF NOT EXISTS idx_majors_cip ON majors(cip_code);
CREATE INDEX IF NOT EXISTS idx_majors_stem ON majors(stem_flag);

-- College majors join table indexes
CREATE INDEX IF NOT EXISTS idx_college_majors_norm_college ON college_majors_normalized(college_id);
CREATE INDEX IF NOT EXISTS idx_college_majors_norm_major ON college_majors_normalized(major_id);
CREATE INDEX IF NOT EXISTS idx_college_majors_norm_year ON college_majors_normalized(year);
CREATE INDEX IF NOT EXISTS idx_college_majors_norm_degree ON college_majors_normalized(degree_type);
CREATE INDEX IF NOT EXISTS idx_college_majors_norm_popularity ON college_majors_normalized(popularity_index);
CREATE INDEX IF NOT EXISTS idx_college_majors_norm_offered ON college_majors_normalized(offered_flag);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_college_majors_norm_college_year ON college_majors_normalized(college_id, year);
CREATE INDEX IF NOT EXISTS idx_college_majors_norm_major_year ON college_majors_normalized(major_id, year);

-- ==========================================
-- FULL-TEXT SEARCH FOR MAJORS
-- ==========================================
CREATE VIRTUAL TABLE IF NOT EXISTS majors_fts USING fts5(
  major_name,
  description,
  synonyms,
  content=majors,
  content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS majors_fts_ai AFTER INSERT ON majors BEGIN
  INSERT INTO majors_fts(rowid, major_name, description, synonyms)
  VALUES (new.id, new.major_name, new.description, new.synonyms);
END;

CREATE TRIGGER IF NOT EXISTS majors_fts_au AFTER UPDATE ON majors BEGIN
  UPDATE majors_fts 
  SET major_name = new.major_name,
      description = new.description,
      synonyms = new.synonyms
  WHERE rowid = new.id;
END;

CREATE TRIGGER IF NOT EXISTS majors_fts_ad AFTER DELETE ON majors BEGIN
  DELETE FROM majors_fts WHERE rowid = old.id;
END;

-- ==========================================
-- EXAMPLE QUERIES (DOCUMENTATION)
-- ==========================================

-- Example 1: Find all colleges offering Computer Science
-- SELECT c.name, c.country, cm.enrollment, cm.ranking_in_school
-- FROM colleges_comprehensive c
-- JOIN college_majors_normalized cm ON c.id = cm.college_id
-- JOIN majors m ON cm.major_id = m.id
-- WHERE m.major_name = 'Computer Science'
--   AND cm.offered_flag = 1
-- ORDER BY cm.popularity_index DESC;

-- Example 2: List all majors at a specific college
-- SELECT m.major_name, m.major_category, m.stem_flag, cm.degree_type, cm.enrollment
-- FROM majors m
-- JOIN college_majors_normalized cm ON m.id = cm.major_id
-- WHERE cm.college_id = ?
--   AND cm.offered_flag = 1
-- ORDER BY cm.ranking_in_school ASC;

-- Example 3: Rank colleges by popularity of a specific major
-- SELECT c.name, c.country, cm.enrollment, cm.popularity_index,
--        RANK() OVER (ORDER BY cm.popularity_index DESC) as rank
-- FROM colleges_comprehensive c
-- JOIN college_majors_normalized cm ON c.id = cm.college_id
-- JOIN majors m ON cm.major_id = m.id
-- WHERE m.major_name = 'Engineering'
--   AND cm.offered_flag = 1
-- ORDER BY cm.popularity_index DESC
-- LIMIT 20;

-- Example 4: Get STEM majors with their college counts
-- SELECT m.major_name, m.cip_code, COUNT(DISTINCT cm.college_id) as college_count
-- FROM majors m
-- JOIN college_majors_normalized cm ON m.id = cm.major_id
-- WHERE m.stem_flag = 1
-- GROUP BY m.id
-- ORDER BY college_count DESC;

-- Example 5: Find colleges with the most majors offered
-- SELECT c.name, COUNT(DISTINCT cm.major_id) as major_count
-- FROM colleges_comprehensive c
-- JOIN college_majors_normalized cm ON c.id = cm.college_id
-- WHERE cm.offered_flag = 1
-- GROUP BY c.id
-- ORDER BY major_count DESC
-- LIMIT 20;
