-- Migration 001: Create Colleges Table
-- This table stores all available colleges in the system
-- Colleges are pre-seeded and users can only SELECT from them, not create new ones

CREATE TABLE IF NOT EXISTS colleges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL, -- US, UK, Canada, etc.
  location TEXT, -- City, State/Region
  type TEXT, -- Public, Private, Liberal Arts
  
  -- Application Information
  application_portal TEXT, -- Common App, UCAS, Direct, etc.
  acceptance_rate REAL, -- Store as decimal (0.05 = 5%)
  
  -- Programs offered (stored as JSON array)
  programs TEXT, -- ["Computer Science", "Engineering", "Business"]
  
  -- Requirements (stored as JSON)
  requirements TEXT, -- {academic: {...}, exams: {...}, essays: {...}}
  
  -- Deadline templates (stored as JSON)
  deadline_templates TEXT, -- {early_action: "11-01", regular: "01-01"}
  
  -- Research data (stored as JSON)
  research_data TEXT, -- {aid_available: true, indian_students: 150, ...}
  
  -- SEO and search
  description TEXT,
  website_url TEXT,
  logo_url TEXT,
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast searching and filtering
CREATE INDEX IF NOT EXISTS idx_colleges_country ON colleges(country);
CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(name);

-- Full-text search support
CREATE VIRTUAL TABLE IF NOT EXISTS colleges_fts USING fts5(
  name, 
  description, 
  programs,
  content=colleges,
  content_rowid=id
);

-- Trigger to keep FTS index updated
CREATE TRIGGER IF NOT EXISTS colleges_ai AFTER INSERT ON colleges BEGIN
  INSERT INTO colleges_fts(rowid, name, description, programs)
  VALUES (new.id, new.name, new.description, new.programs);
END;

CREATE TRIGGER IF NOT EXISTS colleges_au AFTER UPDATE ON colleges BEGIN
  UPDATE colleges_fts 
  SET name = new.name, description = new.description, programs = new.programs
  WHERE rowid = new.id;
END;

CREATE TRIGGER IF NOT EXISTS colleges_ad AFTER DELETE ON colleges BEGIN
  DELETE FROM colleges_fts WHERE rowid = old.id;
END;