# CollegeOS

A college discovery, recommendation, and application-intelligence platform for global applicants, with first-class support for students applying from India to universities abroad.

CollegeOS combines structured university data, an admissions-chancing model, financial analysis, rankings, and a multi-stage recommendation pipeline. It is built on a canonical PostgreSQL/Supabase schema, a React/TypeScript frontend, a Node.js/Express backend, and Python + Node scraper infrastructure.

> **Status & honesty note.** CollegeOS is under active development. This README describes what is **actually implemented today**, not aspirations. Where a capability is partial or not yet live, it says so. See `SYSTEM_STATUS_FINAL.md`, `DATA_STATUS.md`, `ML_STATUS.md`, and `SCRAPER_STATUS.md` for verified, point-in-time detail.

---

## What works today

- **College discovery** across ~8,200 institutions (US, UK, India, Canada, Germany, Europe, Australia, Singapore and more) with filtering by country, major/program, acceptance rate, and cost.
- **Search** by name, acronym (e.g. "MIT" → Massachusetts Institute of Technology), and major, with quality-aware ranking.
- **Admissions chancing** — a calibrated model with a transparent heuristic fallback (details below).
- **Recommendation pipeline** — multi-stage retrieval → ranking → diversification → explainability.
- **Onboarding → profile persistence** and an application/timeline scaffold.

## What is partial / not yet live (so the README stays honest)

- **Semantic / vector search is NOT enabled.** `pgvector` is not installed; an embeddings table exists but is not used for retrieval. Search is keyword + trigram + acronym matching today.
- **Deadlines & requirements coverage is sparse** (being populated from primary sources — see below). The *infrastructure* is in place; broad data is not yet.
- **The chancing model is trained on simulated data**, because no labeled real admission outcomes exist in the system yet. It is honest and calibrated, but not validated against real admits/rejects.
- **Scheduled GitHub Actions refresh is currently gated** (`action_required`) at the repo/org level and does not run automatically until an admin clears it.

---

## Search

The user-facing search is a Supabase RPC, `canonical.search_colleges` (plus `canonical.search_institutions` for entity resolution), called directly from `src/lib/collegeService.ts`. It supports:

- name + alias + acronym resolution (initial-letter matching)
- typo tolerance (PostgreSQL `pg_trgm` trigram similarity)
- major/keyword matching against `canonical.institution_programs`
- filters: country, acceptance-rate range, cost
- relevance ranking: exact/entity match → institutional quality (`global_rank`, then selectivity) → keyword strength

Semantic/embedding ranking is **planned, not implemented** (`pgvector` is not installed).

---

## Recommendation Engine

A multi-stage pipeline under `backend/src/services/recommendation/`:

1. **Candidate retrieval** — filtered retrieval from the canonical schema (not vector/semantic retrieval today).
2. **Ranking** — academic fit, major alignment, affordability, selectivity, outcomes, popularity.
3. **Diversification** — Reach / Target / Safety / Wildcard buckets.
4. **Explainability** — score breakdowns, reasoning summaries, confidence.

---

## Chancing System

Admissions probability is produced by `backend/src/services/consolidatedChancingService.js` (the single chancing service — legacy Flask/FastAPI services were removed). It is **model-first with a heuristic fallback**:

- **Model:** a calibrated logistic-regression model (`backend/ml/`, trained by `backend/ml/trainChancingModel.js`). Features: SAT vs college median, GPA, and college selectivity (logit of acceptance rate).
- **Honesty:** there are currently **no labeled real admission outcomes** in the system, so the model is trained on applicants **simulated from real per-college statistics** (acceptance rate + median SAT). Reported ROC-AUC / Brier / precision-recall are **synthetic-holdout** metrics — they measure recovery of the stats-grounded relationship, not validated accuracy against real admits/rejects. See `ML_STATUS.md` and `MODEL_REPORT.md`.
- **Real-label path:** `POST /api/chancing/outcome` captures real outcomes into `ml_training_data` + `prediction_logs`; the trainer **auto-switches to real labels** once ≥200 accepted/rejected rows exist. Until then it uses the simulation and says so (`dataset.synthetic: true`).
- **Fallback:** when a college lacks stats or the student lacks a test score, a 7-factor heuristic is used. Every result carries `probability_source` (`model` | `heuristic`).

---

## Canonical Data Architecture

A normalized schema under `canonical.*` (institutions, admissions, financials, outcomes, rankings, deadlines, requirements, demographics, programs, embeddings, popularity). The frontend read contract is the materialized view `canonical.mv_college_cards`. Migrations live in **`backend/migrations/`** and are applied by `backend/src/config/database.js`.

Current coverage (point-in-time; see `DATA_STATUS.md` for live numbers):

| Domain | Status |
|---|---|
| Institutions | ~8,200 |
| Programs | broad (~44k rows) |
| Admissions stats (acceptance rate / SAT) | partial (~1,600 / ~800 colleges) |
| Rankings | limited (QS + NIRF) |
| Deadlines | sparse (being populated from primary sources) |
| Requirements | sparse (curated seed + scraper) |

---

## Rankings

Normalized rankings currently ingested: **QS** and **NIRF** (Indian institutions). THE/US News/CWUR/ARWU are **not** ingested (the commercial ones are copyrighted; ingestion is restricted to primary/open sources). Discovery rails (Top Global / CS / Engineering / Business / by Country) are driven by rankings + selectivity.

---

## Scrapers & Data Refresh

Scrapers write through a single validated, idempotent path: `backend/src/scrapers/scraperFramework.js` + `idempotentUpsert()`. The framework enforces a **success-gate**: a run only succeeds if it adds **new** rows (`inserted`), never on `updated` alone (an `ON CONFLICT DO UPDATE` "update" is not proof of fresh data).

**Working against the canonical schema:**
- `backend/scripts/refreshScorecard.js` — U.S. Dept. of Education College Scorecard API → `canonical.institutions` (+admissions/financials), idempotent, keyed on the IPEDS id.
- `backend/src/scrapers/adapters/usOfficialDeadlines.js` — reads deadline dates live from universities' own admissions pages (never fabricated; skips pages it cannot parse).

**Known-broken / legacy (not the source of truth):** the older deadline orchestrator, the Python `scraper/pipeline.py` (writes the legacy `colleges_comprehensive` tables), and `scrapers/run_deadline_refresh.py` all suffer schema drift. See `SCRAPER_STATUS.md`.

**Sourcing policy:** primary + open sources only. Never fabricate; skipped institutions are logged with a reason.

---

## Tech Stack

- **Frontend:** React, TypeScript, Vite, TailwindCSS (project root)
- **Backend:** Node.js, Express (`backend/`)
- **Database:** PostgreSQL + Supabase (with `pg_trgm`, `unaccent`; **no `pgvector`** yet)
- **Scrapers:** Python + Node (`scraper/`, `scrapers/`, `backend/src/scrapers/`)
- **CI:** GitHub Actions (`.github/workflows/`) — currently gated pending admin approval

---

## Repository Structure

```text
.                      # React/TS/Vite frontend (root: src/, index.html, vite.config.ts)
backend/               # Node.js/Express API
  ├─ src/              # routes, services, models, scrapers
  ├─ ml/               # chancing model trainer + artifacts
  ├─ migrations/       # canonical SQL migrations (applied by src/config/database.js)
  └─ scripts/          # seed + scraper scripts
scraper/               # Python scraper tree (pipeline.py, indian/, ipeds/)
scrapers/              # second Python scraper tree (deadline refresh)
.github/workflows/     # CI + scheduled refresh workflows
```

---

## Environment Variables

```bash
DATABASE_URL=                 # PostgreSQL/Supabase connection string
SUPABASE_DB_URL=              # used by Python scrapers
SUPABASE_SERVICE_KEY=
COLLEGE_SCORECARD_API_KEY=    # (or DATA_GOV_API_KEY) for refreshScorecard.js / pipeline.py
HUGGING_FACE_API_KEY=         # optional
NODE_ENV=production
```

---

## Running Locally

**Frontend (project root):**
```bash
npm install
npm run dev
```

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Python scrapers:**
```bash
pip install -r scraper/requirements.txt
python scraper/pipeline.py            # legacy pipeline (writes legacy tables)
node backend/scripts/refreshScorecard.js --batch=1000   # canonical Scorecard refresh
```

---

## Status

Active development and stabilization. Current focus: data coverage (deadlines/requirements from primary sources), converging legacy scrapers onto the canonical schema, search quality, and accumulating real admission outcomes so the chancing model can train on real labels.
