-- Migration 029: Scraping Infrastructure
-- Adds minimal tables for autonomous scraping system

-- ==========================================
-- SCRAPE QUEUE TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS scrape_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  priority INTEGER DEFAULT 2, -- 1=top1000, 2=remaining, 3=manual
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed, dead_letter
  scheduled_for DATETIME DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scrape_queue_status ON scrape_queue(status);
CREATE INDEX IF NOT EXISTS idx_scrape_queue_priority ON scrape_queue(priority, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scrape_queue_college ON scrape_queue(college_id);

-- ==========================================
-- SCRAPE AUDIT LOG TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS scrape_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  confidence_score REAL DEFAULT 0.8,
  source TEXT, -- 'official_website', 'ipeds', 'scorecard', 'manual'
  extraction_method TEXT, -- 'json_ld', 'meta_tags', 'css_selector', 'regex', 'table'
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_college ON scrape_audit_log(college_id);
CREATE INDEX IF NOT EXISTS idx_audit_scraped_at ON scrape_audit_log(scraped_at);

-- ==========================================
-- FIELD METADATA TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS field_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  confidence_score REAL DEFAULT 0.0,
  source TEXT,
  extraction_method TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  data_freshness_days INTEGER DEFAULT 0,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  UNIQUE(college_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_field_meta_college ON field_metadata(college_id);
CREATE INDEX IF NOT EXISTS idx_field_meta_freshness ON field_metadata(data_freshness_days);

-- ==========================================
-- SCRAPE STATISTICS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS scrape_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scrape_date DATE NOT NULL,
  colleges_scraped INTEGER DEFAULT 0,
  colleges_succeeded INTEGER DEFAULT 0,
  colleges_failed INTEGER DEFAULT 0,
  fields_updated INTEGER DEFAULT 0,
  avg_confidence_score REAL DEFAULT 0.0,
  scrape_duration_minutes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scrape_date)
);

CREATE INDEX IF NOT EXISTS idx_stats_date ON scrape_statistics(scrape_date);
