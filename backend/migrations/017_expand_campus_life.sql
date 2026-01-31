-- Migration 017: Expand Campus Life
-- Adds detailed campus environment, facilities, and student life metrics

-- ==========================================
-- ADD CAMPUS ENVIRONMENT COLUMNS TO CAMPUS_LIFE
-- ==========================================

-- Campus Setting
ALTER TABLE campus_life ADD COLUMN campus_setting TEXT; -- 'urban', 'suburban', 'rural', 'small_town'
ALTER TABLE campus_life ADD COLUMN campus_size_description TEXT; -- 'compact', 'medium', 'sprawling'
ALTER TABLE campus_life ADD COLUMN campus_architecture_style TEXT;
ALTER TABLE campus_life ADD COLUMN campus_beauty_rating INTEGER; -- 1-10

-- Location Details
ALTER TABLE campus_life ADD COLUMN weather_description TEXT;
ALTER TABLE campus_life ADD COLUMN average_temp_fall REAL;
ALTER TABLE campus_life ADD COLUMN average_temp_winter REAL;
ALTER TABLE campus_life ADD COLUMN average_temp_spring REAL;
ALTER TABLE campus_life ADD COLUMN snowfall_inches_annual REAL;
ALTER TABLE campus_life ADD COLUMN nearest_major_city TEXT;
ALTER TABLE campus_life ADD COLUMN distance_to_city_miles INTEGER;
ALTER TABLE campus_life ADD COLUMN nearest_airport TEXT;
ALTER TABLE campus_life ADD COLUMN distance_to_airport_miles INTEGER;

-- Transportation
ALTER TABLE campus_life ADD COLUMN public_transportation_access INTEGER DEFAULT 0;
ALTER TABLE campus_life ADD COLUMN car_necessity_rating INTEGER; -- 1-10 (10 = absolutely need car)
ALTER TABLE campus_life ADD COLUMN campus_walkability_score INTEGER; -- 1-10
ALTER TABLE campus_life ADD COLUMN bike_friendly INTEGER DEFAULT 0;
ALTER TABLE campus_life ADD COLUMN campus_shuttle INTEGER DEFAULT 0;
ALTER TABLE campus_life ADD COLUMN parking_availability TEXT; -- 'ample', 'limited', 'very_limited', 'none'
ALTER TABLE campus_life ADD COLUMN freshman_parking_allowed INTEGER DEFAULT 0;

-- Greek Life
ALTER TABLE campus_life ADD COLUMN greek_life_available INTEGER DEFAULT 1;
ALTER TABLE campus_life ADD COLUMN greek_life_percentage REAL;
ALTER TABLE campus_life ADD COLUMN fraternities_count INTEGER;
ALTER TABLE campus_life ADD COLUMN sororities_count INTEGER;
ALTER TABLE campus_life ADD COLUMN greek_housing_available INTEGER DEFAULT 0;

-- Housing Details
ALTER TABLE campus_life ADD COLUMN freshman_housing_required INTEGER DEFAULT 0;
ALTER TABLE campus_life ADD COLUMN sophomore_housing_required INTEGER DEFAULT 0;
ALTER TABLE campus_life ADD COLUMN on_campus_housing_percentage REAL;
ALTER TABLE campus_life ADD COLUMN substance_free_housing INTEGER DEFAULT 0;
ALTER TABLE campus_life ADD COLUMN themed_housing_options TEXT; -- JSON array
ALTER TABLE campus_life ADD COLUMN single_room_availability TEXT; -- 'none', 'limited', 'ample'
ALTER TABLE campus_life ADD COLUMN apartment_style_available INTEGER DEFAULT 0;

-- Dining
ALTER TABLE campus_life ADD COLUMN dining_hall_count INTEGER;
ALTER TABLE campus_life ADD COLUMN dining_hall_rating INTEGER; -- 1-10
ALTER TABLE campus_life ADD COLUMN food_options_count INTEGER;
ALTER TABLE campus_life ADD COLUMN meal_plan_required INTEGER DEFAULT 0;
ALTER TABLE campus_life ADD COLUMN meal_plan_flexibility TEXT;
ALTER TABLE campus_life ADD COLUMN dietary_accommodations TEXT; -- JSON array (vegan, halal, kosher, etc.)

-- Fitness and Recreation
ALTER TABLE campus_life ADD COLUMN gym_facilities_rating INTEGER; -- 1-10
ALTER TABLE campus_life ADD COLUMN recreation_center_count INTEGER;
ALTER TABLE campus_life ADD COLUMN pool_available INTEGER DEFAULT 0;
ALTER TABLE campus_life ADD COLUMN outdoor_recreation_options TEXT; -- JSON array

-- ==========================================
-- STUDENT_LIFE_RATINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS student_life_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  
  -- Social Scene
  party_school_rating INTEGER, -- 1-10
  social_scene_rating INTEGER, -- 1-10
  dating_scene_rating INTEGER, -- 1-10
  school_spirit_rating INTEGER, -- 1-10
  
  -- Academic Culture
  academic_competitiveness_rating INTEGER, -- 1-10
  study_culture_rating INTEGER, -- 1-10
  class_participation_culture TEXT, -- 'very_active', 'moderate', 'quiet'
  
  -- Wellness
  mental_health_resources_rating INTEGER, -- 1-10
  counseling_availability TEXT, -- 'excellent', 'good', 'limited'
  wellness_programs_rating INTEGER, -- 1-10
  stress_level_rating INTEGER, -- 1-10 (10 = very stressful)
  
  -- Career Support
  career_services_rating INTEGER, -- 1-10
  internship_support_rating INTEGER, -- 1-10
  alumni_engagement_rating INTEGER, -- 1-10
  
  -- Safety
  campus_safety_incidents_yearly INTEGER,
  sexual_assault_prevention_programs INTEGER DEFAULT 0,
  emergency_alert_system INTEGER DEFAULT 1,
  campus_police_rating INTEGER, -- 1-10
  
  -- Overall
  overall_student_satisfaction INTEGER, -- 1-10
  would_recommend_percentage REAL,
  
  -- Data Quality
  source TEXT,
  rating_count INTEGER, -- Number of student reviews
  last_updated DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id)
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_student_life_ratings_college ON student_life_ratings(college_id);
CREATE INDEX IF NOT EXISTS idx_student_life_party ON student_life_ratings(party_school_rating);
CREATE INDEX IF NOT EXISTS idx_student_life_safety ON student_life_ratings(campus_safety_incidents_yearly);
