CollegeOS - Comprehensive College Application Management Platform

A full-stack college application tracker helping students discover, organize, and apply to universities worldwide. Features 1000+ colleges (US, India, UK, Germany) with detailed admissions data, personalized chancing calculator, deadline tracking, essay management, and intelligent college recommendations.

Built with React, Node.js, and PostgreSQL (Supabase). Combines data-rich college search with Common App's organizational tools, making college applications manageable for students globally.

Key Features: Smart college search • Admission chance calculator • Application deadline tracker • Financial aid comparison • Essay manager • Personalized recommendations

---

## Chancing Model

Admission probability is calculated entirely in JavaScript by the deterministic sigmoid model in:

```
backend/src/services/consolidatedChancingService.js  →  calculateChance(studentProfile, college)
```

This function uses the student's GPA and SAT delta against the college's medians, anchors to the
college's own selectivity via a log-odds term, applies an international student penalty, and
returns `{ tier, probability, confidence, explanation }`.

**The former Python Flask service (`backend/ml-service/`) and FastAPI service (`backend/chancing_service/`) have been removed.** They were never running on Render and had no active callers. All chancing routes (`POST /api/chance`, `POST /api/chancing/calculate`, `POST /api/chancing/ml/batch`) use `consolidatedChancingService` exclusively.

---

## Automated Data Pipeline

CollegeOS includes a fully automated, zero-touch data pipeline that keeps all college data and ML models fresh without manual intervention.

### Architecture (quick-stabilization ownership split)

```
GitHub Actions (source of truth)          Optional fallback/manual (Python-only)
───────────────────────────────────       ──────────────────────────────────────
.github/workflows/daily-data-refresh.yml  scraper/orchestrator_worker.py
  └─ scraper/pipeline.py                    └─ backend/scripts/data-pipeline/*
```

The official admissions data refresh path is **GitHub Actions + `scraper/pipeline.py`**.
`backend/scripts/data-pipeline/*` + `scraper/orchestrator_worker.py` is retained as Python fallback/manual path.

### Schedules

| Job | Schedule | Table written |
|-----|----------|---------------|
| Daily data refresh | Daily 03:00 UTC | `colleges_comprehensive` |

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
# Backend app (scraper scheduling is NOT source-of-truth here)
node backend/src/app.js

# Optional Python fallback worker
pip install -r scraper/requirements.txt
python scraper/orchestrator_worker.py

# Run official GitHub Actions pipeline entrypoint locally
python scraper/pipeline.py

# Run ML training manually
python scraper/training_pipeline.py
```

### Database Migration

The new tables are created by migration `049_automation_schema.sql`, which runs automatically on server startup:

- `chance_me_posts` — parsed Reddit applicant + outcome rows (upsert key: `reddit_post_id, college_name`)
- `college_admissions_stats` — per-college per-year admissions stats
- `college_financial_aid` — per-college per-year financial aid data
- `scraper_run_logs` — one row per scraper job run (used by health endpoint)

---

## Scraper Setup

The Python data pipeline runs automatically via GitHub Actions (`.github/workflows/daily-data-refresh.yml`). No always-on scraper server is required.

### Schedule

| Job | Trigger |
|---|---|
| `refresh` (`daily-data-refresh.yml`) | Daily at 03:00 UTC + manual dispatch |

The job can also be triggered manually from the GitHub UI: **Actions → Daily College Data Refresh → Run workflow**.

### Required GitHub Secrets

Add these in your repository under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Required by | Description |
|---|---|---|
| `DATABASE_URL` | All jobs | PostgreSQL connection string (from Supabase or Render) |
| `REDDIT_CLIENT_ID` | `reddit-scraper` | Reddit app client ID |
| `REDDIT_CLIENT_SECRET` | `reddit-scraper` | Reddit app client secret |
| `REDDIT_USER_AGENT` | `reddit-scraper` | e.g. `CollegeOS/1.0 by YourUsername` |
| `REDDIT_USERNAME` | `reddit-scraper` | Reddit account username |
| `REDDIT_PASSWORD` | `reddit-scraper` | Reddit account password |
| `DATA_GOV_API_KEY` | `admissions-scraper`, `financial-scraper`, `college-profile-scraper` | Free key from [api.data.gov/signup](https://api.data.gov/signup/) |

Get a Reddit app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → **create app** → type **script**.
