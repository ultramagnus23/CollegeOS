-- Migration 001: Create Colleges Table

CREATE TABLE IF NOT EXISTS colleges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  location TEXT,
  type TEXT,
  application_portal TEXT,
  acceptance_rate REAL,
  programs TEXT,
  requirements TEXT,
  deadline_templates TEXT,
  research_data TEXT,
  description TEXT,
  website_url TEXT,
  logo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_colleges_country ON colleges(country);

CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(name);

CREATE VIRTUAL TABLE IF NOT EXISTS colleges_fts USING fts5(
  name, 
  description, 
  programs,
  content=colleges,
  content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS colleges_ai AFTER INSERT ON colleges BEGIN
  INSERT INTO colleges_fts(rowid, name, description, programs)
  VALUES (new.id, new.name, new.description, new.programs);
END;

CREATE TRIGGER IF NOT EXISTS colleges_au AFTER UPDATE ON colleges BEGIN
  UPDATE colleges_fts 
  SET name = new.name, 
      description = new.description, 
      programs = new.programs
  WHERE rowid = new.id;
END;

CREATE TRIGGER IF NOT EXISTS colleges_ad AFTER DELETE ON colleges BEGIN
  DELETE FROM colleges_fts WHERE rowid = old.id;
END;