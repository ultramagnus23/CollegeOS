-- Migration 041: College Qualitative Insights
-- Stores Reddit-sourced qualitative insights (cost experiences, scholarship
-- success stories, perceived value) with per-post sentiment tagging.
-- These are surfaced as *supplementary context* only — never merged into
-- structured admissions/financial data (problem statement requirement).

CREATE TABLE IF NOT EXISTS college_insights (
  id              SERIAL PRIMARY KEY,

  -- Source post metadata
  reddit_post_id  TEXT NOT NULL UNIQUE,
  subreddit       TEXT NOT NULL,
  post_url        TEXT,
  posted_at       TIMESTAMPTZ,
  author_flair    TEXT,                       -- e.g. "Harvard '27"

  -- Linked college (may be NULL if not matched)
  college_id      INTEGER REFERENCES colleges (id) ON DELETE SET NULL,
  college_name_raw TEXT NOT NULL,             -- as written in the post

  -- Insight classification
  insight_type    TEXT NOT NULL               -- 'cost_experience','scholarship_success','perceived_value','general'
    CHECK (insight_type IN ('cost_experience','scholarship_success','perceived_value','general')),

  -- Content
  content_snippet TEXT NOT NULL,             -- relevant excerpt (≤2000 chars)
  full_text       TEXT,                      -- full post body for audit

  -- Sentiment
  sentiment       TEXT NOT NULL DEFAULT 'neutral'
    CHECK (sentiment IN ('positive','negative','neutral','mixed')),
  sentiment_score NUMERIC(4,3),              -- -1.000 to +1.000 (from classifier)
  sentiment_model TEXT,                      -- e.g. 'vader', 'claude-3-haiku'

  -- Validation
  is_validated    BOOLEAN NOT NULL DEFAULT FALSE,
  is_spam         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Provenance
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insights_college    ON college_insights (college_id);
CREATE INDEX IF NOT EXISTS idx_insights_type       ON college_insights (insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_sentiment  ON college_insights (sentiment);
CREATE INDEX IF NOT EXISTS idx_insights_scraped    ON college_insights (scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_post_id    ON college_insights (reddit_post_id);

-- Full-text search on insight content
CREATE INDEX IF NOT EXISTS idx_insights_fts
  ON college_insights USING GIN (to_tsvector('english', content_snippet));
