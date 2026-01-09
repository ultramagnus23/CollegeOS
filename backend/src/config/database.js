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
        trust_tier TEXT DEFAULT 'official',
        is_verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Add location column if it doesn't exist (migration)
      -- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check first
      -- This will be handled by the seed script
      
      CREATE INDEX IF NOT EXISTS idx_colleges_country ON colleges(country);
      CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(name);
      CREATE INDEX IF NOT EXISTS idx_colleges_major_categories ON colleges(major_categories);
      
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
    `);
    
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