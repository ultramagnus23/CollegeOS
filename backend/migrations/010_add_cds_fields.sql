-- Migration 010: Add Common Data Set (CDS) fields
-- Comprehensive CDS data storage for enhanced profile comparison

-- SECTION B - ENROLLMENT & PERSISTENCE
ALTER TABLE colleges ADD COLUMN grad_enrollment INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN ft_undergrad_enrollment INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN pt_undergrad_enrollment INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN first_year_retention_rate REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN four_year_graduation_rate REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN six_year_graduation_rate REAL DEFAULT NULL;

-- SECTION C - FIRST-TIME FIRST-YEAR ADMISSION
ALTER TABLE colleges ADD COLUMN total_applicants INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN total_admitted INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN total_enrolled INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN yield_rate REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN ed_applicants INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN ed_admitted INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN ed_enrolled INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN ea_applicants INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN ea_admitted INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN waitlist_offered INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN waitlist_accepted INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN waitlist_admitted INTEGER DEFAULT NULL;

-- SECTION C9 - EXTENDED SAT/ACT DATA
ALTER TABLE colleges ADD COLUMN sat_reading_50 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN sat_math_50 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN act_english_25 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN act_english_75 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN act_math_25 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN act_math_75 INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_submitting_sat REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_submitting_act REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN test_optional_policy TEXT DEFAULT NULL;

-- SECTION C11 - GPA DISTRIBUTION
ALTER TABLE colleges ADD COLUMN percent_gpa_375_plus REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_gpa_350_374 REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_gpa_325_349 REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_gpa_300_324 REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_gpa_250_299 REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_gpa_below_250 REAL DEFAULT NULL;

-- SECTION C - ADMISSION FACTORS (importance rating 1-4: Very Important, Important, Considered, Not Considered)
ALTER TABLE colleges ADD COLUMN factor_rigor TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_class_rank TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_gpa TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_test_scores TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_essay TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_recommendation TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_interview TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_extracurricular TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_talent TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_character TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_first_gen TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_alumni TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_geography TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_state_residency TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_volunteer TEXT DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN factor_work_experience TEXT DEFAULT NULL;

-- SECTION G - FINANCIAL AID
ALTER TABLE colleges ADD COLUMN avg_need_based_grant INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN avg_merit_scholarship INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_receiving_aid REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN percent_need_fully_met REAL DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN avg_net_price INTEGER DEFAULT NULL;

-- SECTION H - FINANCIAL INFO
ALTER TABLE colleges ADD COLUMN room_and_board INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN books_supplies INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN personal_expenses INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN total_cost_of_attendance INTEGER DEFAULT NULL;

-- RANKING DATA
ALTER TABLE colleges ADD COLUMN us_news_rank INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN qs_world_rank INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN times_rank INTEGER DEFAULT NULL;
ALTER TABLE colleges ADD COLUMN cds_year INTEGER DEFAULT NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_colleges_us_news_rank ON colleges(us_news_rank);
CREATE INDEX IF NOT EXISTS idx_colleges_total_applicants ON colleges(total_applicants);
CREATE INDEX IF NOT EXISTS idx_colleges_percent_gpa_375 ON colleges(percent_gpa_375_plus);
