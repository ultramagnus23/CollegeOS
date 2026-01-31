const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('./env');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.initialized = false;
  }
  
  initialize() {
    if (this.initialized) return this.db;
    
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(config.database.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Connect to database
      this.db = new Database(config.database.path, {
        verbose: config.nodeEnv === 'development' ? logger.debug : null
      });
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      // Performance optimizations
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      
      logger.info('Database connected successfully');
      this.initialized = true;
      
      return this.db;
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }
  
  runMigrations() {
    const db = this.initialize();
    
    logger.info('Running database migrations...');
    
    // Create tables
    db.exec(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        google_id TEXT UNIQUE,
        full_name TEXT NOT NULL,
        country TEXT NOT NULL,
        target_countries TEXT,
        intended_majors TEXT,
        test_status TEXT,
        language_preferences TEXT,
        onboarding_complete INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Colleges table (Layer 1: Core Static Data)
      -- Core static spine: manually curated base facts only
      CREATE TABLE IF NOT EXISTS colleges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        country TEXT NOT NULL,
        location TEXT,
        official_website TEXT NOT NULL,
        admissions_url TEXT,
        programs_url TEXT,
        application_portal_url TEXT,
        academic_strengths TEXT,
        major_categories TEXT,
        acceptance_rate REAL,
        tuition_domestic INTEGER,
        tuition_international INTEGER,
        student_population INTEGER,
        average_gpa REAL,
        sat_range TEXT,
        act_range TEXT,
        graduation_rate REAL,
        ranking INTEGER,
        trust_tier TEXT DEFAULT 'official',
        is_verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_colleges_country ON colleges(country);
      CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(name);
      CREATE INDEX IF NOT EXISTS idx_colleges_major_categories ON colleges(major_categories);
      CREATE INDEX IF NOT EXISTS idx_colleges_acceptance_rate ON colleges(acceptance_rate);
      
      -- College Data table (Layer 2: Trusted Dynamic Data)
      CREATE TABLE IF NOT EXISTS college_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        college_id INTEGER NOT NULL,
        data_type TEXT NOT NULL,
        data_content TEXT NOT NULL,
        source_url TEXT NOT NULL,
        trust_tier TEXT DEFAULT 'official',
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_valid INTEGER DEFAULT 1,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_college_data_college ON college_data(college_id);
      CREATE INDEX IF NOT EXISTS idx_college_data_type ON college_data(data_type);
      
      -- Applications table
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        college_id INTEGER NOT NULL,
        status TEXT DEFAULT 'researching',
        application_type TEXT,
        priority TEXT,
        notes TEXT,
        submitted_at DATETIME,
        decision_received_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
      CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
      
      -- Deadlines table
      CREATE TABLE IF NOT EXISTS deadlines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        deadline_type TEXT NOT NULL,
        deadline_date DATETIME NOT NULL,
        description TEXT,
        is_completed INTEGER DEFAULT 0,
        completed_at DATETIME,
        reminder_sent INTEGER DEFAULT 0,
        source_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_deadlines_application ON deadlines(application_id);
      CREATE INDEX IF NOT EXISTS idx_deadlines_date ON deadlines(deadline_date);
      
      -- Essays table (Drive Links Only)
      CREATE TABLE IF NOT EXISTS essays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        essay_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        word_limit INTEGER,
        google_drive_link TEXT,
        status TEXT DEFAULT 'not_started',
        last_edited_at DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_essays_application ON essays(application_id);
      CREATE INDEX IF NOT EXISTS idx_essays_status ON essays(status);
      
      -- Student Profiles table
      CREATE TABLE IF NOT EXISTS student_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        graduation_year INTEGER,
        gpa_weighted REAL,
        gpa_unweighted REAL,
        gpa_scale TEXT,
        class_rank INTEGER,
        class_size INTEGER,
        class_rank_percentile REAL,
        sat_ebrw INTEGER,
        sat_math INTEGER,
        sat_total INTEGER,
        act_composite INTEGER,
        act_english INTEGER,
        act_math INTEGER,
        act_reading INTEGER,
        act_science INTEGER,
        jee_main_percentile REAL,
        jee_advanced_rank INTEGER,
        neet_score INTEGER,
        board_exam_percentage REAL,
        board_type TEXT,
        predicted_a_levels TEXT,
        ib_predicted_score INTEGER,
        gcse_results TEXT,
        abitur_grade REAL,
        german_proficiency TEXT,
        toefl_score INTEGER,
        ielts_score REAL,
        duolingo_score INTEGER,
        country TEXT,
        state_province TEXT,
        city TEXT,
        high_school_name TEXT,
        high_school_type TEXT,
        curriculum_type TEXT,
        is_first_generation INTEGER DEFAULT 0,
        is_legacy INTEGER DEFAULT 0,
        legacy_schools TEXT,
        ethnicity TEXT,
        citizenship_status TEXT,
        intended_majors TEXT,
        preferred_states TEXT,
        preferred_countries TEXT,
        preferred_college_size TEXT,
        preferred_setting TEXT,
        budget_max INTEGER,
        min_acceptance_rate REAL,
        max_acceptance_rate REAL,
        special_circumstances TEXT,
        hooks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles(user_id);
      
      -- Student Activities table
      CREATE TABLE IF NOT EXISTS student_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES student_profiles(id) ON DELETE CASCADE,
        activity_name TEXT NOT NULL,
        activity_type TEXT,
        position_title TEXT,
        organization_name TEXT,
        description TEXT,
        grade_9 INTEGER DEFAULT 0,
        grade_10 INTEGER DEFAULT 0,
        grade_11 INTEGER DEFAULT 0,
        grade_12 INTEGER DEFAULT 0,
        hours_per_week REAL,
        weeks_per_year INTEGER,
        total_hours INTEGER,
        awards_recognition TEXT,
        tier_rating INTEGER DEFAULT 4,
        participation_during_school INTEGER DEFAULT 1,
        participation_during_break INTEGER DEFAULT 0,
        participation_all_year INTEGER DEFAULT 0,
        participation_post_graduation INTEGER DEFAULT 0,
        display_order INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_student_activities_student ON student_activities(student_id);
      CREATE INDEX IF NOT EXISTS idx_student_activities_tier ON student_activities(tier_rating);
      
      -- Student Coursework table
      CREATE TABLE IF NOT EXISTS student_coursework (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES student_profiles(id) ON DELETE CASCADE,
        course_name TEXT NOT NULL,
        course_level TEXT,
        subject_area TEXT,
        grade_level INTEGER,
        final_grade TEXT,
        grade_points REAL,
        weighted INTEGER DEFAULT 0,
        exam_score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_student_coursework_student ON student_coursework(student_id);
      CREATE INDEX IF NOT EXISTS idx_student_coursework_level ON student_coursework(course_level);
      
      -- Student Awards table
      CREATE TABLE IF NOT EXISTS student_awards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER REFERENCES student_profiles(id) ON DELETE CASCADE,
        award_name TEXT NOT NULL,
        award_level TEXT,
        organization TEXT,
        grade_received INTEGER,
        year_received INTEGER,
        description TEXT,
        display_order INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_student_awards_student ON student_awards(student_id);
      
      -- Sources table (Data Provenance)
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        trust_tier TEXT NOT NULL,
        domain TEXT NOT NULL,
        last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        robots_txt_compliant INTEGER DEFAULT 1,
        rate_limit_ms INTEGER DEFAULT 2000,
        notes TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_sources_domain ON sources(domain);
      CREATE INDEX IF NOT EXISTS idx_sources_trust ON sources(trust_tier);
      
      -- Research Cache table (Layer 3: On-Demand Data)
      CREATE TABLE IF NOT EXISTS research_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_hash TEXT UNIQUE NOT NULL,
        college_id INTEGER,
        research_type TEXT NOT NULL,
        data_content TEXT NOT NULL,
        source_urls TEXT,
        trust_tier TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_research_cache_hash ON research_cache(query_hash);
      CREATE INDEX IF NOT EXISTS idx_research_cache_expires ON research_cache(expires_at);
      
      -- Refresh tokens table
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
      
      -- ML Training Data table (for admission predictions)
      CREATE TABLE IF NOT EXISTS ml_training_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        college_id INTEGER NOT NULL,
        gpa REAL,
        sat_total INTEGER,
        act_composite INTEGER,
        class_rank_percentile REAL,
        num_ap_courses INTEGER,
        activity_tier_1_count INTEGER,
        activity_tier_2_count INTEGER,
        is_first_gen INTEGER DEFAULT 0,
        is_legacy INTEGER DEFAULT 0,
        state TEXT,
        college_acceptance_rate REAL,
        college_sat_median INTEGER,
        college_type TEXT,
        decision TEXT CHECK(decision IN ('accepted', 'rejected', 'waitlisted', 'deferred')),
        enrolled INTEGER DEFAULT 0,
        application_year INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_ml_training_student ON ml_training_data(student_id);
      CREATE INDEX IF NOT EXISTS idx_ml_training_college ON ml_training_data(college_id);
      CREATE INDEX IF NOT EXISTS idx_ml_training_decision ON ml_training_data(decision);
      CREATE INDEX IF NOT EXISTS idx_ml_training_year ON ml_training_data(application_year);
      
      -- ML User Interactions table (for recommendations)
      CREATE TABLE IF NOT EXISTS ml_user_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        college_id INTEGER NOT NULL,
        interaction_type TEXT CHECK(interaction_type IN ('viewed', 'saved', 'applied', 'removed')),
        session_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_ml_interactions_student ON ml_user_interactions(student_id);
      CREATE INDEX IF NOT EXISTS idx_ml_interactions_college ON ml_user_interactions(college_id);
      CREATE INDEX IF NOT EXISTS idx_ml_interactions_type ON ml_user_interactions(interaction_type);
      CREATE INDEX IF NOT EXISTS idx_ml_interactions_timestamp ON ml_user_interactions(timestamp);
      
      -- ML Essays table (for essay scoring/NLP)
      CREATE TABLE IF NOT EXISTS ml_essays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        college_id INTEGER,
        essay_prompt_type TEXT,
        essay_text TEXT NOT NULL,
        word_count INTEGER,
        quality_score INTEGER CHECK(quality_score >= 1 AND quality_score <= 10),
        acceptance_outcome TEXT CHECK(acceptance_outcome IN ('accepted', 'rejected', 'waitlisted', 'pending', NULL)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_ml_essays_student ON ml_essays(student_id);
      CREATE INDEX IF NOT EXISTS idx_ml_essays_college ON ml_essays(college_id);
      CREATE INDEX IF NOT EXISTS idx_ml_essays_outcome ON ml_essays(acceptance_outcome);
      
      -- ML Model Versions table (track deployed models)
      CREATE TABLE IF NOT EXISTS ml_model_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        model_version TEXT NOT NULL,
        model_type TEXT CHECK(model_type IN ('admission_prediction', 'recommendation', 'essay_scoring')),
        accuracy_score REAL,
        training_data_count INTEGER,
        training_date DATETIME,
        is_active INTEGER DEFAULT 0,
        model_path TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_ml_models_name ON ml_model_versions(model_name);
      CREATE INDEX IF NOT EXISTS idx_ml_models_active ON ml_model_versions(is_active);
      
      -- Chancing History table (track profile changes impact)
      CREATE TABLE IF NOT EXISTS chancing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        college_id INTEGER NOT NULL,
        chance_percentage INTEGER,
        category TEXT CHECK(category IN ('Safety', 'Target', 'Reach')),
        profile_snapshot TEXT,
        factors TEXT,
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_chancing_history_user ON chancing_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_chancing_history_date ON chancing_history(calculated_at);
    `);
    
    // Add ml_consent column to users if it doesn't exist
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ml_consent INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore error
    }
    
    logger.info('Database migrations completed successfully');
  }
  
  getDatabase() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.db;
  }
  
  close() {
    if (this.db) {
      this.db.close();
      this.initialized = false;
      logger.info('Database connection closed');
    }
  }
}

// Singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;