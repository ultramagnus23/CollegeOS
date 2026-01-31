-- Migration 020: Expand Financial Data
-- Adds comprehensive financial aid and cost details

-- ==========================================
-- ADD FINANCIAL AID COLUMNS TO COLLEGE_FINANCIAL_DATA
-- ==========================================

-- Need-Based Aid Policies
ALTER TABLE college_financial_data ADD COLUMN meets_full_need INTEGER DEFAULT 0;
ALTER TABLE college_financial_data ADD COLUMN meets_full_need_percentage REAL;
ALTER TABLE college_financial_data ADD COLUMN loan_free_for_income_under INTEGER; -- Income threshold for no-loan policy
ALTER TABLE college_financial_data ADD COLUMN no_parent_contribution_income_under INTEGER;

-- Work-Study
ALTER TABLE college_financial_data ADD COLUMN work_study_available INTEGER DEFAULT 1;
ALTER TABLE college_financial_data ADD COLUMN work_study_percentage REAL;
ALTER TABLE college_financial_data ADD COLUMN average_work_study_earnings INTEGER;
ALTER TABLE college_financial_data ADD COLUMN on_campus_jobs_available INTEGER DEFAULT 1;
ALTER TABLE college_financial_data ADD COLUMN average_hours_worked_weekly REAL;

-- Merit Scholarships
ALTER TABLE college_financial_data ADD COLUMN merit_scholarship_available INTEGER DEFAULT 1;
ALTER TABLE college_financial_data ADD COLUMN merit_scholarship_average INTEGER;
ALTER TABLE college_financial_data ADD COLUMN merit_scholarship_percentage REAL;
ALTER TABLE college_financial_data ADD COLUMN merit_scholarship_range TEXT; -- e.g., "$5,000 - $25,000"
ALTER TABLE college_financial_data ADD COLUMN automatic_merit_scholarships INTEGER DEFAULT 0;

-- Athletic Scholarships
ALTER TABLE college_financial_data ADD COLUMN athletic_scholarship_available INTEGER DEFAULT 0;
ALTER TABLE college_financial_data ADD COLUMN athletic_scholarship_sports TEXT; -- JSON array

-- Institutional Grants
ALTER TABLE college_financial_data ADD COLUMN institutional_grant_average INTEGER;
ALTER TABLE college_financial_data ADD COLUMN institutional_grant_percentage REAL;
ALTER TABLE college_financial_data ADD COLUMN endowment_per_student INTEGER;

-- Outside Scholarships
ALTER TABLE college_financial_data ADD COLUMN outside_scholarship_policy TEXT; -- 'reduces_loans_first', 'reduces_grant', 'mixed'

-- Required Forms
ALTER TABLE college_financial_data ADD COLUMN fafsa_required INTEGER DEFAULT 1;
ALTER TABLE college_financial_data ADD COLUMN css_profile_required INTEGER DEFAULT 0;
ALTER TABLE college_financial_data ADD COLUMN institutional_form_required INTEGER DEFAULT 0;
ALTER TABLE college_financial_data ADD COLUMN tax_returns_required INTEGER DEFAULT 1;
ALTER TABLE college_financial_data ADD COLUMN noncustodial_parent_form INTEGER DEFAULT 0;

-- International Aid
ALTER TABLE college_financial_data ADD COLUMN international_aid_available INTEGER DEFAULT 0;
ALTER TABLE college_financial_data ADD COLUMN international_need_blind INTEGER DEFAULT 0;
ALTER TABLE college_financial_data ADD COLUMN international_aid_percentage REAL;
ALTER TABLE college_financial_data ADD COLUMN international_avg_aid INTEGER;

-- Payment Options
ALTER TABLE college_financial_data ADD COLUMN payment_plan_available INTEGER DEFAULT 1;
ALTER TABLE college_financial_data ADD COLUMN payment_plan_fee INTEGER;
ALTER TABLE college_financial_data ADD COLUMN tuition_lock_available INTEGER DEFAULT 0;
ALTER TABLE college_financial_data ADD COLUMN tuition_insurance_available INTEGER DEFAULT 0;

-- Loan Details
ALTER TABLE college_financial_data ADD COLUMN average_loan_amount INTEGER;
ALTER TABLE college_financial_data ADD COLUMN percent_with_loans REAL;
ALTER TABLE college_financial_data ADD COLUMN parent_plus_usage_rate REAL;

-- ==========================================
-- NET_PRICE_CALCULATOR_DATA TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS net_price_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  
  -- Net Price by Income Brackets
  net_price_0_30k INTEGER,
  net_price_30_48k INTEGER,
  net_price_48_75k INTEGER,
  net_price_75_110k INTEGER,
  net_price_110k_plus INTEGER,
  
  -- Average Financial Aid Package Components
  avg_grant_aid INTEGER,
  avg_federal_loan INTEGER,
  avg_institutional_loan INTEGER,
  avg_work_study_award INTEGER,
  avg_parent_contribution INTEGER,
  avg_student_contribution INTEGER,
  
  -- Percentage Receiving Aid by Type
  pct_receiving_any_aid REAL,
  pct_receiving_need_based_grant REAL,
  pct_receiving_merit_only REAL,
  pct_receiving_federal_loan REAL,
  pct_receiving_pell REAL,
  
  -- Special Populations
  first_gen_avg_aid INTEGER,
  veteran_avg_aid INTEGER,
  
  -- Data Quality
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (college_id) REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
  UNIQUE(college_id, academic_year)
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_net_price_college ON net_price_data(college_id);
CREATE INDEX IF NOT EXISTS idx_net_price_year ON net_price_data(academic_year);
