CollegeOS - Comprehensive College Application Management Platform

A full-stack college application tracker helping students discover, organize, and apply to universities worldwide. Features 1000+ colleges (US, India, UK, Germany) with detailed admissions data, personalized chancing calculator, deadline tracking, essay management, and intelligent college recommendations.

Built with React, Node.js, and MySQL. Combines CollegeVine's data-rich interface with Common App's organizational tools, making college applications manageable for students globally.

Key Features: Smart college search • Admission chance calculator • Application deadline tracker • Financial aid comparison • Essay manager • Personalized recommendations

---

## Automated Data Pipeline

CollegeOS includes a fully automated, zero-touch data pipeline that keeps all college data and ML models fresh without manual intervention.

### Architecture

```
Railway Service 1 (Node backend)          Railway Service 2 (Python worker)
───────────────────────────────────        ──────────────────────────────────
backend/src/app.js                         scraper/orchestrator_worker.py
  └─ backend/jobs/orchestrator.js            ├─ scraper/reddit_scraper.py
       (node-cron, spawns Python)            ├─ scraper/admissions_scraper.py
                                             ├─ scraper/financial_scraper.py
                                             ├─ scraper/college_profile_scraper.py
                                             └─ scraper/training_pipeline.py
```

Both services write run results to `scraper_run_logs` in Postgres, which is served by `GET /api/admin/health`.

### Schedules

| Job | Schedule | Table written |
|-----|----------|---------------|
| Reddit chance-me scraper | Every 6h | `chance_me_posts` |
| Admissions stats | Daily 02:00 UTC | `college_admissions_stats` |
| Financial aid | Daily 03:00 UTC | `college_financial_aid` |
| College profiles | Every Sunday 04:00 UTC | `colleges` |
| ML retrain check | Every 1h (triggers if 100+ new rows) | `ml_metadata` |

### Health Dashboard

```
GET /api/admin/health
```

Returns JSON with scraper last-run times, DB counts, and ML model metrics. Cached for 60 seconds.

### Required Environment Variables

```bash
DATABASE_URL=postgresql://...
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=CollegeOS/1.0 by YourUsername
REDDIT_USERNAME=
REDDIT_PASSWORD=
DATA_GOV_API_KEY=        # https://api.data.gov/signup/ (free)
OPENAI_API_KEY=          # for claudeParser.js + valuesEngine.js
NODE_ENV=production
```

### Running Locally

```bash
# Node orchestrator starts automatically when ENABLE_SCRAPING_JOBS=true
ENABLE_SCRAPING_JOBS=true node backend/src/app.js

# Python worker (separate terminal or process)
pip install -r scraper/requirements.txt
python scraper/orchestrator_worker.py

# Run a single scraper manually
python scraper/reddit_scraper.py
python scraper/admissions_scraper.py
python scraper/financial_scraper.py
python scraper/college_profile_scraper.py

# Run ML training manually
python scraper/training_pipeline.py
```

### Database Migration

The new tables are created by migration `049_automation_schema.sql`, which runs automatically on server startup:

- `chance_me_posts` — parsed Reddit applicant + outcome rows (upsert key: `reddit_post_id, college_name`)
- `college_admissions_stats` — per-college per-year admissions stats
- `college_financial_aid` — per-college per-year financial aid data
- `scraper_run_logs` — one row per scraper job run (used by health endpoint)
