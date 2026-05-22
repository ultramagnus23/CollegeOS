# CollegeOS

A modern college discovery, recommendation, and application intelligence platform built for global applicants.

CollegeOS combines structured university data, admissions intelligence, financial analysis, rankings, deadline automation, and personalized recommendation systems into a single platform designed to simplify the college application process.

The platform is built around a canonical data architecture using PostgreSQL + Supabase, with React frontend applications, Node.js APIs, Python scraper infrastructure, and ML-assisted recommendation pipelines.

---

# Core Capabilities

## College Discovery

Explore universities across:

* United States
* United Kingdom
* Canada
* Germany
* India
* Europe
* Australia
* Singapore
* Additional international institutions

Features:

* Advanced filtering
* Rankings exploration
* Country-based discovery
* Major-specific exploration
* Popularity-based sorting
* Financial fit filtering
* Admissions selectivity analysis

---

# Recommendation Engine

CollegeOS uses a multi-stage recommendation architecture rather than static weighted scoring.

## Recommendation Pipeline

### Stage 1 — Candidate Retrieval

Semantic retrieval using:

* embeddings
* vector similarity
* pgvector + PostgreSQL

This narrows thousands of institutions into high-fit candidates.

### Stage 2 — Ranking Intelligence

Recommendation ranking incorporates:

* academic fit
* major alignment
* subject rankings
* affordability
* admissions competitiveness
* outcomes
* popularity
* international aid availability
* career alignment

### Stage 3 — Portfolio Diversification

Recommendation outputs are diversified into:

* Reach
* Target
* Safety
* Wildcard

This prevents repetitive recommendation lists.

### Stage 4 — Explainability

Recommendations include:

* score breakdowns
* reasoning summaries
* feature-based explanations
* confidence scoring

---

# Chancing System

Admissions probability estimation is powered by:

```text
backend/src/services/consolidatedChancingService.js
```

The current system is fully integrated into the Node.js backend.

The legacy Flask and FastAPI chancing services have been removed.

The chancing engine evaluates:

* GPA competitiveness
* SAT/ACT alignment
* institutional selectivity
* international applicant considerations
* admissions deltas
* confidence levels

Responses include:

* probability
* tier classification
* confidence
* explanation metadata

---

# Canonical Data Architecture

CollegeOS uses a normalized canonical schema centered around:

```text
canonical.*
```

Primary canonical domains include:

* institutions
* admissions
* financials
* outcomes
* rankings
* deadlines
* requirements
* demographics
* programs
* recommendation intelligence
* embeddings
* popularity signals

The platform has been migrated away from fragmented legacy joins and duplicate institution representations.

---

# Rankings & Popularity Intelligence

CollegeOS supports:

* global rankings
* subject rankings
* popularity indexing
* discovery rails

Ranking normalization combines signals from:

* QS
* THE
* NIRF
* institutional metadata
* engagement metrics

Discovery rails include:

* Top Global
* Top CS
* Top Engineering
* Top Business
* Top by Country
* Trending
* Popular Colleges

---

# Financial Intelligence

Financial analysis supports:

* tuition comparison
* estimated cost of attendance
* international tuition
* aid availability
* merit scholarship indicators
* need-blind indicators
* debt analysis
* salary outcomes
* affordability scoring

Financial normalization is country-aware and supports:

* US aid systems
* UK funding systems
* Indian financing contexts
* international applicant aid semantics

---

# Deadlines & Requirements Infrastructure

CollegeOS includes a production scraper infrastructure for:

## Deadlines

* Early Action
* Early Decision
* Regular Decision
* Rolling Admissions
* International Deadlines

## Requirements

* SAT/ACT policies
* English proficiency requirements
* GPA expectations
* transcript requirements
* essays
* recommendations
* portfolio requirements

The scraper framework supports:

* retries
* batching
* schema validation
* diagnostics generation
* confidence scoring
* stale detection
* structured logging
* GitHub Actions automation

---

# Automated Data Infrastructure

The platform includes automated refresh pipelines using GitHub Actions.

## Current Pipelines

| Workflow        | Purpose                                   |
| --------------- | ----------------------------------------- |
| Daily Refresh   | Canonical data refresh                    |
| Weekly Scraper  | Rolling admissions + requirements updates |
| Monthly Scraper | Full refresh + stale reconciliation       |

The scraper infrastructure is designed to:

* tolerate partial failures
* continue on institution-level errors
* generate diagnostics artifacts
* support resumable execution

---

# Tech Stack

## Frontend

* React
* TypeScript
* Vite
* TailwindCSS

## Backend

* Node.js
* Express

## Database

* PostgreSQL
* Supabase
* pgvector

## Scraper Infrastructure

* Python
* GitHub Actions

## Recommendation Infrastructure

* vector retrieval
* ranking orchestration
* explainability layers

---

# Repository Structure

```text
frontend/
backend/
scraper/
.github/workflows/
supabase/migrations/
```

---

# Environment Variables

```bash
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=

REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
REDDIT_USERNAME=
REDDIT_PASSWORD=

DATA_GOV_API_KEY=

NODE_ENV=production
```

---

# Running Locally

## Backend

```bash
cd backend
npm install
npm run dev
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Python Scraper Infrastructure

```bash
pip install -r scraper/requirements.txt

python scraper/pipeline.py
```

---

# GitHub Actions

Primary automation entrypoints live under:

```text
.github/workflows/
```

Main workflows:

* daily-data-refresh.yml
* scrape-weekly.yml
* scrape-monthly.yml

---

# Current Focus Areas

Active platform development currently focuses on:

* recommendation intelligence
* scraper resilience
* rankings infrastructure
* financial intelligence
* canonical schema expansion
* observability
* workflow hardening
* performance optimization
* repository cleanup

---

# Status

CollegeOS is currently under active development and infrastructure stabilization.

The platform architecture is transitioning from:

* heuristic systems
* fragmented schemas
* legacy joins
* duplicated data flows

toward:

* canonical intelligence pipelines
* resilient scraper infrastructure
* explainable recommendations
* normalized ranking systems
* scalable discovery architecture
