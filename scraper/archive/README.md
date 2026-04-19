# Archived: Old Reddit Scraper Pipeline

These files are the original Node.js Reddit scraper that was replaced by the Python
data pipeline in `scraper/pipeline.py`.

They are kept here for reference only and are **not used by any active workflow**.

| File | What it did |
|---|---|
| `index.js` | Entry point — seed/incremental Reddit scrape modes |
| `redditClient.js` | Reddit public JSON API client (r/collegeresults, r/chanceme, r/ApplyingToCollege) |
| `claudeParser.js` | Gemini/Claude parser that extracted admissions data from Reddit posts |
| `db.js` | SQLite/Postgres DB layer for storing parsed Reddit posts |
| `calibrate.js` | Compared chancing model predictions against Reddit-sourced outcomes |
| `normalizer.js` | School name variant → canonical name mapper |
| `collegeConfidential.js` | College Confidential "Chance Me" thread scraper |
| `collegeScorecard.js` | Early JS College Scorecard API scraper (replaced by `sources/scorecard.py`) |

The replacement pipeline (`scraper/pipeline.py`) sources real data from IPEDS,
College Scorecard, and NCES bulk CSVs and upserts it directly into
`colleges_comprehensive` in Supabase PostgreSQL.
