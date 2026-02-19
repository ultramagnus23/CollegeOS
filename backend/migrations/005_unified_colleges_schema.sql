-- Migration 005: Unified Colleges Schema
-- This migration creates a comprehensive college schema that matches seed data

-- Drop existing colleges table and related triggers/indexes if they exist
DROP TABLE IF EXISTS colleges_fts;
DROP TRIGGER IF EXISTS colleges_ai;
DROP TRIGGER IF EXISTS colleges_au;
DROP TRIGGER IF EXISTS colleges_ad;
DROP INDEX IF EXISTS idx_colleges_country;
DROP INDEX IF EXISTS idx_colleges_name;
DROP INDEX IF EXISTS idx_colleges_major_categories;
DROP TABLE IF EXISTS colleges;

-- Create new unified colleges table with ALL required fields
CREATE TABLE colleges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Basic Info
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  location TEXT,
  type TEXT, -- Public/Private
  
  -- URLs
  official_website TEXT NOT NULL,
  admissions_url TEXT,
  programs_url TEXT,
  application_portal_url TEXT,
  
  -- Programs & Academics
  programs TEXT, -- JSON array
  major_categories TEXT, -- JSON array
  academic_strengths TEXT, -- JSON array
  
  -- Application Info
  application_portal TEXT, -- Common App, UCAS, Studielink, Direct
  acceptance_rate REAL,
  
  -- Requirements (JSON objects)
  requirements TEXT, -- {accepted_boards, language_exams, min_scores, etc.}
  deadline_templates TEXT, -- {early_action, regular_decision, etc.}
  
  -- Financial
  tuition_cost REAL,
  financial_aid_available INTEGER DEFAULT 0,
  
  -- Additional Data
  research_data TEXT, -- JSON for scraped/aggregated data
  description TEXT,
  logo_url TEXT,
  
  -- Educational Board Specific
  cbse_requirements TEXT, -- JSON
  igcse_requirements TEXT, -- JSON
  ib_requirements TEXT, -- JSON
  
  -- Country Specific
  studielink_required INTEGER DEFAULT 0, -- For Netherlands
  numerus_fixus_programs TEXT, -- JSON array for Netherlands
  ucas_code TEXT, -- For UK
  common_app_id TEXT, -- For US
  
  -- Metadata
  trust_tier TEXT DEFAULT 'official',
  is_verified INTEGER DEFAULT 0,
  last_scraped_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_colleges_country ON colleges(country);
CREATE INDEX idx_colleges_name ON colleges(name);
CREATE INDEX idx_colleges_major_categories ON colleges(major_categories);
CREATE INDEX idx_colleges_type ON colleges(type);
CREATE INDEX idx_colleges_application_portal ON colleges(application_portal);

-- Create full-text search virtual table
CREATE VIRTUAL TABLE colleges_fts USING fts5(
  name, 
  description, 
  programs,
  major_categories,
  location,
  content=colleges,
  content_rowid=id
);

-- Triggers to keep FTS table in sync
CREATE TRIGGER colleges_ai AFTER INSERT ON colleges BEGIN
  INSERT INTO colleges_fts(rowid, name, description, programs, major_categories, location)
  VALUES (new.id, new.name, new.description, new.programs, new.major_categories, new.location);
END;

CREATE TRIGGER colleges_au AFTER UPDATE ON colleges BEGIN
  UPDATE colleges_fts 
  SET name = new.name, 
      description = new.description, 
      programs = new.programs,
      major_categories = new.major_categories,
      location = new.location
  WHERE rowid = new.id;
END;

CREATE TRIGGER colleges_ad AFTER DELETE ON colleges BEGIN
  DELETE FROM colleges_fts WHERE rowid = old.id;
END;
