-- Migration 022: Athletics Table
-- Comprehensive athletics and recreation data

-- ==========================================
-- ATHLETICS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS athletics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Athletic Division
  ncaa_division TEXT, -- 'I', 'II', 'III', 'NAIA', 'NJCAA', 'None'
  athletic_conference TEXT,
  
  -- Varsity Sports Count
  varsity_sports_total INTEGER,
  varsity_sports_men INTEGER,
  varsity_sports_women INTEGER,
  varsity_sports_list TEXT, -- JSON array of sport names
  
  -- High-Profile Sports
  football_program INTEGER DEFAULT 0,
  football_division TEXT, -- FBS, FCS, etc.
  basketball_men INTEGER DEFAULT 0,
  basketball_women INTEGER DEFAULT 0,
  
  -- Club Sports
  club_sports_count INTEGER,
  club_sports_list TEXT, -- JSON array
  club_sports_funding TEXT, -- 'well_funded', 'moderate', 'student_funded'
  
  -- Intramural Sports
  intramural_sports_count INTEGER,
  intramural_participation_rate REAL,
  intramural_sports_list TEXT, -- JSON array
  
  -- Facilities
  athletic_facilities_rating INTEGER, -- 1-10
  main_gym_name TEXT,
  stadium_name TEXT,
  stadium_capacity INTEGER,
  recreation_center_sqft INTEGER,
  pools_count INTEGER,
  fitness_center_hours TEXT, -- e.g., "24/7" or "6am-midnight"
  outdoor_facilities TEXT, -- JSON array
  
  -- Athletic Culture
  sports_culture_rating INTEGER, -- 1-10 (how important is sports on campus)
  game_attendance_rating INTEGER, -- 1-10
  school_spirit_athletics INTEGER, -- 1-10
  tailgating_culture INTEGER DEFAULT 0,
  rival_schools TEXT, -- JSON array
  
  -- Athletic Aid
  athletic_scholarships_offered INTEGER DEFAULT 0,
  scholarship_sports TEXT, -- JSON array of sports with scholarships
  recruited_athlete_percentage REAL,
  walk_on_opportunities INTEGER DEFAULT 1,
  
  -- Recruiting
  ncaa_recruiting_rules TEXT, -- Division-specific rules summary
  official_visits_allowed INTEGER,
  
  -- Achievements
  national_championships INTEGER DEFAULT 0,
  conference_championships_5yr INTEGER,
  notable_sports TEXT, -- JSON array of particularly strong programs
  
  -- Data Quality
  source TEXT,
  last_verified DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- ==========================================
-- VARSITY_SPORTS_DETAIL TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS varsity_sports_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  sport_name TEXT NOT NULL,
  gender TEXT NOT NULL, -- 'men', 'women', 'coed'
  
  -- Team Info
  division TEXT,
  conference TEXT,
  
  -- Roster and Recruiting
  roster_size INTEGER,
  scholarship_spots INTEGER,
  walk_on_spots INTEGER,
  recruited_athletes_yearly INTEGER,
  
  -- Performance
  current_ranking INTEGER,
  conference_standing INTEGER,
  win_percentage_3yr REAL,
  postseason_appearances_5yr INTEGER,
  national_championships INTEGER DEFAULT 0,
  
  -- Recruiting Standards
  academic_requirements TEXT,
  typical_recruit_profile TEXT,
  contact_coach_email TEXT,
  recruiting_questionnaire_url TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, sport_name, gender)
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_athletics_college ON athletics(college_id);
CREATE INDEX IF NOT EXISTS idx_athletics_division ON athletics(ncaa_division);
CREATE INDEX IF NOT EXISTS idx_athletics_conference ON athletics(athletic_conference);
CREATE INDEX IF NOT EXISTS idx_varsity_sports_college ON varsity_sports_detail(college_id);
CREATE INDEX IF NOT EXISTS idx_varsity_sports_name ON varsity_sports_detail(sport_name);
