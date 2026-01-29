-- Migration: 008_requested_colleges.sql
-- Creates table for user-requested colleges that aren't in the database yet
-- Allows dynamic growth of the college database based on user needs

-- Requested colleges table
CREATE TABLE IF NOT EXISTS requested_colleges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    website TEXT,
    city TEXT,
    state TEXT,
    country TEXT NOT NULL,
    request_reason TEXT,
    
    -- Request tracking
    requested_by_user_id INTEGER,
    requested_by_email TEXT,
    request_count INTEGER DEFAULT 1,
    first_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Admin review
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'in_progress')),
    reviewed_by_admin_id INTEGER,
    reviewed_at TIMESTAMP,
    admin_notes TEXT,
    
    -- If approved, link to the created college
    approved_college_id INTEGER,
    
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by_admin_id) REFERENCES users(id),
    FOREIGN KEY (approved_college_id) REFERENCES colleges_v2(id)
);

-- User-contributed college data (for crowdsourcing)
CREATE TABLE IF NOT EXISTS college_data_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id INTEGER,
    requested_college_id INTEGER,
    
    -- Contributor info
    contributed_by_user_id INTEGER,
    contributed_by_email TEXT,
    contributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Data contribution (JSON format for flexibility)
    data_type TEXT NOT NULL, -- 'enrollment', 'tuition', 'acceptance_rate', 'test_scores', 'deadlines', 'programs', 'general'
    data_value TEXT NOT NULL, -- JSON string with the contributed data
    source_url TEXT, -- Where they got this info
    
    -- Verification
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    verified_by_admin_id INTEGER,
    verified_at TIMESTAMP,
    verification_notes TEXT,
    
    FOREIGN KEY (college_id) REFERENCES colleges_v2(id),
    FOREIGN KEY (requested_college_id) REFERENCES requested_colleges(id),
    FOREIGN KEY (contributed_by_user_id) REFERENCES users(id),
    FOREIGN KEY (verified_by_admin_id) REFERENCES users(id)
);

-- Search miss tracking (colleges users search for but don't find)
CREATE TABLE IF NOT EXISTS search_misses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_term TEXT NOT NULL,
    search_count INTEGER DEFAULT 1,
    first_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- If a matching college was added later
    resolved_college_id INTEGER,
    resolved_at TIMESTAMP,
    
    FOREIGN KEY (resolved_college_id) REFERENCES colleges_v2(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_requested_colleges_status ON requested_colleges(status);
CREATE INDEX IF NOT EXISTS idx_requested_colleges_country ON requested_colleges(country);
CREATE INDEX IF NOT EXISTS idx_requested_colleges_name ON requested_colleges(name);
CREATE INDEX IF NOT EXISTS idx_requested_colleges_request_count ON requested_colleges(request_count DESC);

CREATE INDEX IF NOT EXISTS idx_contributions_college_id ON college_data_contributions(college_id);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON college_data_contributions(status);
CREATE INDEX IF NOT EXISTS idx_contributions_type ON college_data_contributions(data_type);

CREATE INDEX IF NOT EXISTS idx_search_misses_term ON search_misses(search_term);
CREATE INDEX IF NOT EXISTS idx_search_misses_count ON search_misses(search_count DESC);
