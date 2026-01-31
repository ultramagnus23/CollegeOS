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
      
      -- ═══════════════════════════════════════════════════════════════
      -- COMPREHENSIVE CHANCING SYSTEM TABLES
      -- ═══════════════════════════════════════════════════════════════
      
      -- US College CDS Data (Common Data Set factors and weights)
      CREATE TABLE IF NOT EXISTS college_cds_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        college_id INTEGER NOT NULL UNIQUE,
        -- CDS Section C7 importance weights (4=Very Important, 3=Important, 2=Considered, 1=Not Considered, 0=N/A)
        rigor_weight INTEGER DEFAULT 3,
        gpa_weight INTEGER DEFAULT 4,
        class_rank_weight INTEGER DEFAULT 2,
        test_scores_weight INTEGER DEFAULT 3,
        essay_weight INTEGER DEFAULT 3,
        recommendations_weight INTEGER DEFAULT 3,
        extracurriculars_weight INTEGER DEFAULT 3,
        interview_weight INTEGER DEFAULT 1,
        talent_ability_weight INTEGER DEFAULT 2,
        character_personal_qualities_weight INTEGER DEFAULT 3,
        first_generation_weight INTEGER DEFAULT 2,
        legacy_weight INTEGER DEFAULT 2,
        geographic_residence_weight INTEGER DEFAULT 1,
        state_residency_weight INTEGER DEFAULT 1,
        volunteer_work_weight INTEGER DEFAULT 2,
        work_experience_weight INTEGER DEFAULT 2,
        level_of_interest_weight INTEGER DEFAULT 2,
        -- Admission statistics
        total_applicants INTEGER,
        total_admitted INTEGER,
        students_enrolled INTEGER,
        yield_rate REAL,
        -- GPA distribution
        gpa_4_0_scale_pct REAL,
        gpa_3_75_3_99_pct REAL,
        gpa_3_50_3_74_pct REAL,
        gpa_3_25_3_49_pct REAL,
        gpa_3_00_3_24_pct REAL,
        -- Class rank distribution
        class_rank_top_10_pct REAL,
        class_rank_top_25_pct REAL,
        class_rank_top_50_pct REAL,
        -- SAT/ACT percentiles
        sat_25th_percentile INTEGER,
        sat_75th_percentile INTEGER,
        act_25th_percentile INTEGER,
        act_75th_percentile INTEGER,
        -- Essay and other info
        essay_required INTEGER DEFAULT 1,
        interview_offered TEXT DEFAULT 'optional',
        data_year INTEGER DEFAULT 2024,
        source_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_cds_college ON college_cds_data(college_id);
      
      -- Indian College Requirements (exam-based admissions)
      CREATE TABLE IF NOT EXISTS indian_college_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        college_id INTEGER NOT NULL UNIQUE,
        -- Entrance exam info
        entrance_exam_type TEXT CHECK(entrance_exam_type IN ('JEE_Advanced', 'JEE_Main', 'CAT', 'NEET', 'BITSAT', 'GATE', 'CLAT', 'Board_Marks', 'SAT', 'Other')),
        -- Category-wise cutoff ranks (opening-closing)
        cutoff_general_opening INTEGER,
        cutoff_general_closing INTEGER,
        cutoff_obc_opening INTEGER,
        cutoff_obc_closing INTEGER,
        cutoff_sc_opening INTEGER,
        cutoff_sc_closing INTEGER,
        cutoff_st_opening INTEGER,
        cutoff_st_closing INTEGER,
        cutoff_ews_opening INTEGER,
        cutoff_ews_closing INTEGER,
        -- For percentage-based admissions
        min_board_percentage REAL,
        min_12th_percentage REAL,
        -- Quota info
        home_state_quota_bonus REAL DEFAULT 0,
        has_management_quota INTEGER DEFAULT 0,
        management_quota_fee_premium REAL,
        -- Other requirements
        requires_interview INTEGER DEFAULT 0,
        requires_essay INTEGER DEFAULT 0,
        -- Weights for private colleges
        exam_weight REAL DEFAULT 0.9,
        board_marks_weight REAL DEFAULT 0.1,
        interview_weight REAL DEFAULT 0,
        essay_weight REAL DEFAULT 0,
        data_year INTEGER DEFAULT 2024,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_indian_reqs_college ON indian_college_requirements(college_id);
      CREATE INDEX IF NOT EXISTS idx_indian_reqs_exam ON indian_college_requirements(entrance_exam_type);
      
      -- UK College Requirements (A-levels/IB based)
      CREATE TABLE IF NOT EXISTS uk_college_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        college_id INTEGER NOT NULL UNIQUE,
        -- Typical offers
        typical_offer_a_levels TEXT,
        typical_offer_ib_points INTEGER,
        typical_offer_scottish_highers TEXT,
        -- UCAS points
        min_ucas_points INTEGER,
        average_ucas_points INTEGER,
        -- Admissions tests
        admissions_test_required INTEGER DEFAULT 0,
        admissions_test_name TEXT,
        -- Interview
        interview_required INTEGER DEFAULT 0,
        interview_type TEXT DEFAULT 'none',
        -- Personal statement and reference
        personal_statement_weight INTEGER DEFAULT 3,
        reference_weight INTEGER DEFAULT 2,
        -- Course-specific
        course_specific_requirements TEXT,
        contextual_offers_available INTEGER DEFAULT 0,
        -- Weights
        predicted_grades_weight REAL DEFAULT 0.6,
        admissions_test_weight REAL DEFAULT 0.2,
        interview_weight REAL DEFAULT 0.15,
        personal_statement_weight_pct REAL DEFAULT 0.05,
        data_year INTEGER DEFAULT 2024,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_uk_reqs_college ON uk_college_requirements(college_id);
      
      -- German College Requirements (Abitur/NC based)
      CREATE TABLE IF NOT EXISTS german_college_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        college_id INTEGER NOT NULL UNIQUE,
        -- NC (Numerus Clausus)
        has_nc INTEGER DEFAULT 0,
        nc_grade_cutoff REAL,
        nc_waiting_semesters INTEGER,
        -- Language requirements
        german_level_required TEXT DEFAULT 'C1',
        english_level_required TEXT DEFAULT 'B2',
        dsh_required INTEGER DEFAULT 0,
        testdaf_required INTEGER DEFAULT 0,
        -- Abitur
        abitur_grade_minimum REAL,
        -- For non-NC programs
        has_aptitude_test INTEGER DEFAULT 0,
        aptitude_test_name TEXT,
        motivation_letter_required INTEGER DEFAULT 0,
        -- Weights
        abitur_weight REAL DEFAULT 0.7,
        language_weight REAL DEFAULT 0.2,
        motivation_letter_weight REAL DEFAULT 0.1,
        data_year INTEGER DEFAULT 2024,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_german_reqs_college ON german_college_requirements(college_id);
      
      -- Admitted Student Samples (real profiles for comparison)
      CREATE TABLE IF NOT EXISTS admitted_student_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        college_id INTEGER NOT NULL,
        admission_year INTEGER NOT NULL,
        -- Academic profile
        student_gpa REAL,
        student_sat_total INTEGER,
        student_act_composite INTEGER,
        class_rank_percentile REAL,
        num_ap_courses INTEGER,
        num_ib_courses INTEGER,
        -- For Indian students
        jee_rank INTEGER,
        board_percentage REAL,
        -- For UK students
        a_level_grades TEXT,
        ib_points INTEGER,
        ucas_points INTEGER,
        -- For German students
        abitur_grade REAL,
        -- Activities and qualities
        activity_summary TEXT,
        tier_1_activities INTEGER DEFAULT 0,
        tier_2_activities INTEGER DEFAULT 0,
        tier_3_activities INTEGER DEFAULT 0,
        -- Demographics
        is_first_gen INTEGER DEFAULT 0,
        is_legacy INTEGER DEFAULT 0,
        is_urm INTEGER DEFAULT 0,
        state_of_residence TEXT,
        country TEXT,
        intended_major TEXT,
        -- Essay and other
        essay_quality_rating INTEGER CHECK(essay_quality_rating >= 1 AND essay_quality_rating <= 5),
        notable_achievements TEXT,
        -- Source and verification
        source TEXT,
        source_url TEXT,
        is_verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_admitted_samples_college ON admitted_student_samples(college_id);
      CREATE INDEX IF NOT EXISTS idx_admitted_samples_year ON admitted_student_samples(admission_year);
      
      -- ═══════════════════════════════════════════════════════════════
      -- SEARCH HISTORY TABLE
      -- ═══════════════════════════════════════════════════════════════
      
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        search_query TEXT NOT NULL,
        result_count INTEGER DEFAULT 0,
        searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_search_history_date ON search_history(searched_at);
      
      -- ═══════════════════════════════════════════════════════════════
      -- STUDENT ESSAYS TABLE (for tracking essays per college)
      -- ═══════════════════════════════════════════════════════════════
      
      CREATE TABLE IF NOT EXISTS student_essays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        college_id INTEGER,
        application_id INTEGER,
        essay_type TEXT DEFAULT 'supplemental',
        prompt_text TEXT,
        word_limit INTEGER,
        status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'complete')),
        google_docs_link TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL,
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_student_essays_user ON student_essays(user_id);
      CREATE INDEX IF NOT EXISTS idx_student_essays_app ON student_essays(application_id);
      
      -- ═══════════════════════════════════════════════════════════════
      -- LDA-BASED ML CHANCING SYSTEM TABLES
      -- ═══════════════════════════════════════════════════════════════
      
      -- LDA Model Registry
      CREATE TABLE IF NOT EXISTS lda_model_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        college_id INTEGER NOT NULL,
        model_version TEXT NOT NULL,
        model_path TEXT NOT NULL,
        scaler_path TEXT,
        sample_count INTEGER,
        accepted_count INTEGER,
        rejected_count INTEGER,
        class_balance REAL,
        accuracy_score REAL,
        precision_score REAL,
        recall_score REAL,
        f1_score REAL,
        cv_mean REAL,
        cv_std REAL,
        feature_columns TEXT,
        feature_importance TEXT,
        is_deployed INTEGER DEFAULT 1,
        trained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deployed_at DATETIME,
        retired_at DATETIME,
        training_config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_lda_registry_college ON lda_model_registry(college_id);
      CREATE INDEX IF NOT EXISTS idx_lda_registry_deployed ON lda_model_registry(is_deployed);
      
      -- Model training history
      CREATE TABLE IF NOT EXISTS model_training_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        college_id INTEGER NOT NULL,
        model_version TEXT,
        trigger_type TEXT CHECK(trigger_type IN ('scheduled', 'manual', 'data_threshold', 'initial')),
        samples_used INTEGER,
        training_duration_ms INTEGER,
        accuracy_before REAL,
        accuracy_after REAL,
        improvement_delta REAL,
        success INTEGER DEFAULT 1,
        failure_reason TEXT,
        trained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_training_history_college ON model_training_history(college_id);
      CREATE INDEX IF NOT EXISTS idx_training_history_date ON model_training_history(trained_at);
      
      -- User contribution tracking
      CREATE TABLE IF NOT EXISTS user_outcome_contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        training_data_id INTEGER NOT NULL,
        college_id INTEGER NOT NULL,
        decision TEXT NOT NULL,
        contribution_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        points_awarded INTEGER DEFAULT 10,
        used_in_training INTEGER DEFAULT 0,
        model_version_used TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (training_data_id) REFERENCES ml_training_data(id) ON DELETE CASCADE,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_contributions_user ON user_outcome_contributions(user_id);
      CREATE INDEX IF NOT EXISTS idx_contributions_college ON user_outcome_contributions(college_id);
      
      -- User ML stats (gamification)
      CREATE TABLE IF NOT EXISTS user_ml_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        total_contributions INTEGER DEFAULT 0,
        verified_contributions INTEGER DEFAULT 0,
        total_points INTEGER DEFAULT 0,
        contribution_rank TEXT DEFAULT 'contributor',
        models_improved INTEGER DEFAULT 0,
        last_contribution_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_ml_stats_user ON user_ml_stats(user_id);
      CREATE INDEX IF NOT EXISTS idx_ml_stats_points ON user_ml_stats(total_points);
      
      -- Data sources registry
      CREATE TABLE IF NOT EXISTS ml_data_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_name TEXT NOT NULL,
        source_type TEXT CHECK(source_type IN ('reddit', 'forum', 'official', 'user', 'partner')),
        source_url TEXT,
        trust_level REAL DEFAULT 0.5,
        records_contributed INTEGER DEFAULT 0,
        last_scraped_at DATETIME,
        scrape_frequency TEXT DEFAULT 'daily',
        is_active INTEGER DEFAULT 1,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_data_sources_type ON ml_data_sources(source_type);
      CREATE INDEX IF NOT EXISTS idx_data_sources_active ON ml_data_sources(is_active);
      
      -- Prediction audit log
      CREATE TABLE IF NOT EXISTS prediction_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        college_id INTEGER NOT NULL,
        prediction_type TEXT CHECK(prediction_type IN ('ml_lda', 'rule_based', 'hybrid')),
        probability REAL,
        category TEXT,
        confidence REAL,
        model_version TEXT,
        feature_snapshot TEXT,
        factors_json TEXT,
        predicted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_prediction_audit_user ON prediction_audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_prediction_audit_college ON prediction_audit_log(college_id);
      CREATE INDEX IF NOT EXISTS idx_prediction_audit_date ON prediction_audit_log(predicted_at);
    `);
    
    // Add ml_consent column to users if it doesn't exist
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ml_consent INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore error
    }
    
    // Add additional columns to ml_training_data for LDA training
    const mlColumnsToAdd = [
      { name: 'source', type: 'TEXT DEFAULT \'user_submitted\'' },
      { name: 'source_url', type: 'TEXT' },
      { name: 'source_year', type: 'INTEGER' },
      { name: 'confidence_score', type: 'REAL DEFAULT 0.7' },
      { name: 'is_verified', type: 'INTEGER DEFAULT 0' },
      { name: 'verification_date', type: 'DATETIME' },
      { name: 'major_applied', type: 'TEXT' },
      { name: 'is_athlete', type: 'INTEGER DEFAULT 0' },
      { name: 'num_ib_courses', type: 'INTEGER DEFAULT 0' },
      { name: 'activity_tier_3_count', type: 'INTEGER DEFAULT 0' },
      { name: 'coursework_rigor_score', type: 'REAL' },
      { name: 'essay_quality_estimate', type: 'INTEGER' },
      { name: 'education_system', type: 'TEXT DEFAULT \'US\'' },
      { name: 'board_percentage', type: 'REAL' },
      { name: 'jee_rank', type: 'INTEGER' },
      { name: 'a_level_grades', type: 'TEXT' },
      { name: 'ib_points', type: 'INTEGER' },
      { name: 'abitur_grade', type: 'REAL' }
    ];
    
    for (const col of mlColumnsToAdd) {
      try {
        db.exec(`ALTER TABLE ml_training_data ADD COLUMN ${col.name} ${col.type}`);
      } catch (e) {
        // Column already exists, ignore
      }
    }
    
    // Create indexes for ML training data
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ml_training_confidence ON ml_training_data(confidence_score)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ml_training_source ON ml_training_data(source)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ml_training_verified ON ml_training_data(is_verified)`);
    } catch (e) {
      // Indexes may already exist
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