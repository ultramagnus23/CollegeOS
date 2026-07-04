# DEAD_CODE_REPORT.md

_Verified by code inspection + grep on 2026-06-22. "Dead" = not imported/mounted/reachable, confirmed by search._

## Confirmed dead files (imported nowhere)

| File | Evidence | Action |
|---|---|---|
| `backend/src/services/chancingService.js` | grep: imported nowhere (only `consolidatedChancingService` is used) | delete (legacy) |
| `backend/src/services/intelligentSearch.js` | grep: imported nowhere | delete (legacy; search is the RPC) |

## Dead / redundant routes

| Mount | Backing | Status |
|---|---|---|
| `app.use('/api/search', searchRoutes)` | `backend/src/routes/search.js` | **DEAD** — the frontend never calls `/api/search` (grep empty); it uses the Supabase RPC `canonical.search_colleges` directly. The route's acronym match is also broken. Remove. |
| `app.use('/api/chance', chanceRoutes)` | `routes/chance.js` → consolidatedChancingService | **DUPLICATE** of `/api/chancing` (same service, smaller response). Consolidate. |
| `app.use('/api/chances', chancesRoutes)` | `routes/chances.js` → `mlService` → HuggingFace Space | **NOT RUNNING** — `HF_SPACE_URL` is unset, so every call throws and returns a DB-query fallback (`source: 'db_fallback'`). Used in onboarding (`StepReview.tsx`). Either configure the Space or replace with `/api/chancing`. |
| `app.use('/api/chancing', chancingRoutes)` | `routes/chancing.js` → consolidatedChancingService | **LIVE** — the real chancing path (JS model + heuristic). |

> **Three chancing endpoints, one real engine.** `/api/chancing` and `/api/chance` both wrap `consolidatedChancingService`; `/api/chances` is a separate HuggingFace path that isn't configured. This is the biggest duplication in the codebase — pick `/api/chancing` as the single source and retire the other two.

## Duplicate table / system

| Item | Evidence | Action |
|---|---|---|
| `tasks` table | 0 rows; `application_tasks` has 60 and is the live one | drop `tasks` or merge |
| Legacy `colleges` / `colleges_comprehensive` | parallel to `canonical.institutions`; still written by `seedColleges`/`pipeline.py` | converge on canonical |
| Broken scrapers (`deadlineScrapingOrchestrator`, `run_deadline_refresh.py`) | schema drift; superseded by canonical adapters | quarantine — see `SCRAPER_STATUS.md` |

## Frontend pages

All page components under `src/pages/` are routed in `src/App.tsx` (no unrouted/dead pages found). Note overlapping recommendation surfaces — `/recommendations` & `/recommenders` (both → `Recommendations`), `/college-recommendations` (→ `CollegeRecommendations`), `/suggested-colleges` (→ `SuggestedColleges`) — worth consolidating UX-wise, but not dead code.

## Root causes (pattern)

The dead code is almost entirely **migration residue**: the project moved from (a) multiple chancing engines (Flask/FastAPI → HuggingFace → JS) and (b) legacy `colleges` schema → `canonical.*`, without removing the superseded layers. Each retirement should be a small, isolated PR with a grep proving non-use first.
