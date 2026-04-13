-- Migration 058: Grade, gender, essay columns, scholarships table, deadlines/tasks/timeline
--
-- Run in Supabase SQL editor (or via psql) before deploying.
-- All ALTER TABLE statements use IF NOT EXISTS so they are safe to re-run.

-- 1. Users table — grade and gender for scholarship matching and profile context
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_grade VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender        VARCHAR(50);

-- 2. Colleges table — essay requirements and deadlines
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS common_app_essays_required    INTEGER DEFAULT 1;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS supplemental_essays_required  INTEGER DEFAULT 0;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS supplemental_essay_prompts    JSONB;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS rd_deadline                   DATE;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS ed_deadline                   DATE;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS ea_deadline                   DATE;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS country                       VARCHAR(100) DEFAULT 'USA';

-- 3. Application deadlines table
CREATE TABLE IF NOT EXISTS application_deadlines (
  id               SERIAL PRIMARY KEY,
  application_id   INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  deadline_type    VARCHAR(50)  NOT NULL,  -- 'ED', 'EA', 'RD', 'Scholarship', 'FAFSA', 'CSS'
  deadline_date    DATE,
  notes            TEXT,
  completed        BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_deadlines_app   ON application_deadlines(application_id);
CREATE INDEX IF NOT EXISTS idx_app_deadlines_date  ON application_deadlines(deadline_date);

-- 4. Application tasks table
CREATE TABLE IF NOT EXISTS application_tasks (
  id               SERIAL PRIMARY KEY,
  application_id   INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  task_type        VARCHAR(50),           -- 'essay', 'document', 'test_score', 'recommendation'
  title            TEXT NOT NULL,
  description      TEXT,
  completed        BOOLEAN DEFAULT false,
  due_date         DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_tasks_app ON application_tasks(application_id);

-- 5. Timeline events table
CREATE TABLE IF NOT EXISTS timeline_events (
  id               SERIAL PRIMARY KEY,
  user_id          UUID REFERENCES auth.users(id),
  application_id   INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  college_id       INTEGER REFERENCES colleges(id),
  event_type       VARCHAR(100),  -- 'deadline', 'decision', 'visa', 'financial_aid', 'housing'
  title            TEXT NOT NULL,
  event_date       DATE NOT NULL,
  is_critical      BOOLEAN DEFAULT false,
  completed        BOOLEAN DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timeline_events_user  ON timeline_events(user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_app   ON timeline_events(application_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_date  ON timeline_events(event_date);

-- 6. Scholarships table (replaces/supplements any earlier schema)
CREATE TABLE IF NOT EXISTS scholarships_new (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,
  provider              VARCHAR(255),
  amount_min            INTEGER,
  amount_max            INTEGER,
  currency              VARCHAR(10) DEFAULT 'USD',
  scholarship_type      VARCHAR(50),  -- 'merit', 'need', 'grant', 'loan', 'work-study'
  eligible_nationalities TEXT[],
  eligible_genders      TEXT[],       -- ['all', 'female', 'transgender', 'non-binary']
  eligible_majors       TEXT[],
  eligible_years        TEXT[],       -- ['freshman', 'sophomore', 'junior', 'senior', 'graduate']
  min_gpa               DECIMAL(3,2),
  deadline_month        INTEGER,
  deadline_day          INTEGER,
  renewable             BOOLEAN DEFAULT false,
  renewable_years       INTEGER,
  application_url       TEXT,
  description           TEXT,
  country               VARCHAR(100) DEFAULT 'USA',
  is_verified           BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Seed supplemental essay counts for top colleges (safe to re-run)
UPDATE colleges SET supplemental_essays_required = 5, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%harvard%';
UPDATE colleges SET supplemental_essays_required = 5, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%mit%' OR LOWER(name) = 'massachusetts institute of technology';
UPDATE colleges SET supplemental_essays_required = 3, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%stanford%';
UPDATE colleges SET supplemental_essays_required = 5, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%yale%';
UPDATE colleges SET supplemental_essays_required = 4, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%columbia%';
UPDATE colleges SET supplemental_essays_required = 5, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%princeton%';
UPDATE colleges SET supplemental_essays_required = 4, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%upenn%' OR LOWER(name) LIKE 'university of pennsylvania%';
UPDATE colleges SET supplemental_essays_required = 4, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%dartmouth%';
UPDATE colleges SET supplemental_essays_required = 4, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%brown%';
UPDATE colleges SET supplemental_essays_required = 3, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%cornell%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%duke%';
UPDATE colleges SET supplemental_essays_required = 3, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%chicago%' AND LOWER(name) NOT LIKE '%chicago state%';
UPDATE colleges SET supplemental_essays_required = 3, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%northwestern%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%johns hopkins%';
UPDATE colleges SET supplemental_essays_required = 3, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%caltech%' OR LOWER(name) = 'california institute of technology';
UPDATE colleges SET supplemental_essays_required = 3, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%georgetown%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%vanderbilt%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%rice%' AND LOWER(name) NOT LIKE '%price%';
UPDATE colleges SET supplemental_essays_required = 3, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%notre dame%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%emory%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%carnegie mellon%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%tufts%';
UPDATE colleges SET supplemental_essays_required = 3, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%boston college%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%nyu%' OR LOWER(name) LIKE '%new york university%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%usc%' OR LOWER(name) LIKE '%university of southern california%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%ucla%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%uc berkeley%' OR LOWER(name) LIKE '%university of california, berkeley%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%michigan%' AND LOWER(name) LIKE '%university%' AND LOWER(name) NOT LIKE '%state%';
UPDATE colleges SET supplemental_essays_required = 2, common_app_essays_required = 1
  WHERE LOWER(name) LIKE '%virginia%' AND LOWER(name) LIKE '%university%' AND LOWER(name) NOT LIKE '%george%';
