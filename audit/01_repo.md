# audit/01_repo.md — Repo Audit (READ-ONLY)

Branch: `audit/full-system-2026-07` · Date: 2026-07-18 · Every number below carries the command that produced it.

> **Premise corrections vs the audit prompt** (prompt said "verify, don't assume"):
> - Frontend is **Vite + React**, not Next.js (`vite.config.ts`, `src/` TSX). There are **no Next.js API routes**; the backend API is **Node/Express** (`backend/src/routes/`).
> - Backend is **Express**, not FastAPI. No FastAPI anywhere (`grep -ri fastapi backend/` → none).
> - Migrations live in **`backend/migrations/` (160 files)**, applied by `backend/src/config/database.js` at boot — **not** `supabase/migrations/` (which holds 1 file).

---

## 1. Branch state

Command: `git branch -r | grep -v HEAD | wc -l` → **134 remote branches.**

Ahead/behind vs `origin/main` (`git rev-list --count origin/main..<b>` / `<b>..origin/main`):

| Branch | Ahead | Behind | Read |
|---|---|---|---|
| `origin/feat/undergrad-masters-followups` | 21 | 116 | **Most unmerged real work.** Recent, masters+UG followups. Candidate to review/merge or close. |
| `origin/copilot/verify-data-availability` | 20 | 1499 | Ancient (~1500 behind). Abandoned. |
| `origin/copilot/fix-database-schema-mismatch` | 19 | 1499 | Ancient. Abandoned. |
| `origin/copilot/fix-layer-3-backend-logic` | 16 | 1499 | Ancient. Abandoned. |
| `origin/copilot/add-international-student-form` | 10 | 1204 | Old. Abandoned. |
| `origin/master` | 2 | 1419 | **Diverged legacy default.** `main` is the live default; `master` is a stale parallel line — should be archived/deleted. |
| ~40 `feat/*` and `fix/*` | 1–8 | 116–160 | Recent-ish topic branches, small deltas; most likely already cherry-picked into `main`. Individually reviewable. |

**Finding B1:** 134 remote branches is severe branch sprawl. ~90 are `copilot/*` auto-generated branches, most 1200–1500 commits behind `main` → abandoned. Recommend bulk-deleting merged/ancient branches; only `feat/undergrad-masters-followups` (21 ahead) clearly carries unmerged work worth a review. `origin/master` is a diverged legacy default branch to retire.

## 2. Structure map

Commands: `git ls-files <dir> | wc -l`, `... | xargs wc -l`.

| Area | Tracked files | LOC | What it actually does (from reading, not name) |
|---|---|---|---|
| `src/` | 214 | 43,266 (ts/tsx) | Vite/React frontend. Undergrad + parallel **masters** track (duplicated layouts/onboarding/types). |
| `backend/` | 554 | 63,807 (js) | Express API (36 route files, ~37 mounted `/api/*` groups), recommendation pipeline, scraper adapters, 160 migrations. |
| `scraper/` | 114 | 17,545 (py) | **Tracked** Python scraper tree. Invoked by workflows (QS/CWUR/Wikidata sources, India pipelines, masters). |
| `scrapers/` | 0 tracked | — | **`.gitignore`d** (`git check-ignore scrapers/` → ignored). Untracked local-only tree. **CLAUDE.md's "scrapers/ vs scraper/ consolidation" concern is moot — `scrapers/` is not in the repo.** |
| `ml/` | 54 | 3,577 (py) | Chancing model training + reddit extraction pipeline. |
| `backend/migrations/` | 160 | — | Canonical migration set (numbered to ~140). |
| `supabase/migrations/` | 1 | — | Near-empty; not the live migration path. |
| `.github/workflows/` | 13 | — | See §5. |
| `docs/` | 64 | — | Audit docs, plans, status reports. |

## 3. Dead code

- **TypeScript unused exports** — `npx ts-prune -p tsconfig.app.json | grep -v '(used in module)' | wc -l` → **226**. Inflated by barrel re-exports in `src/contracts/index.ts` (≈15 of them are re-exported symbols). Real orphans include e.g. `DecisionCountdown`, `WordCountTracker#useWordCount`, `DataFreshnessIndicator#getRelativeTimeAgo`. Net genuine dead exports ≈ 180 after discounting barrels — needs per-symbol confirmation before removal.
- **Unused frontend deps** — `npx depcheck` → **0 unused runtime deps.** Reported devDeps (`autoprefixer`, `postcss`, `@tailwindcss/typography`, `jest`, `nodemon`) are config-loaded false positives. Frontend dependency hygiene is good.
- **Python dead code** — `vulture scraper ml --min-confidence 90 | wc -l` → **6 items.** `ruff check scraper ml --select F401` → **36 unused imports** (all auto-fixable). Python side is clean.
- **API surface** — 36 route files, ~37 `app.use('/api/...')` mounts (`grep app.use backend/src`). Full zero-caller endpoint cross-ref deferred into Phase 2/3 (frontend `grep` per route); no obviously-unmounted route file found at the app level.

## 4. Duplication

Command: `npx jscpd src backend/src scraper --min-lines 8`.
→ **205 exact clones, 3,034 duplicated lines = 2.78% of 495 files.** Overall duplication is **low/healthy**.

Top clone blocks (dominant theme = **masters-track parallel of undergrad code**):

| Lines | File A | File B |
|---|---|---|
| 54 | `components/onboarding/ALevelOnboarding.tsx` | `components/onboarding/IBOnboarding.tsx` |
| 48 | `types/mastersProfile.ts` | `types/profile.ts` |
| 42 | `layouts/DashboardLayout.tsx` | `layouts/MastersLayout.tsx` |
| 36 | `scraper/sources/cricos_australia.py` | `scraper/sources/sise_france.py` |
| 30 | `scraper/indian/pipelines/run_india_refresh.py` | `scraper/…/pipeline.py` |
| 29 | `scraper/sources/ipeds_aux.py` | `scraper/sources/usnews_rankings.py` |
| 27 | `scraper/sources/ipeds.py` | `scraper/sources/scorecard.py` |

**Finding B2:** Scraper `sources/*.py` share a repeated fetch→parse→upsert skeleton — the real candidate for a parameterized base class (prompt's Phase 1.4 ask). Masters/undergrad frontend parallel is the other cluster. Neither is large enough to be urgent (2.78% total).

## 5. Workflow inventory (`.github/workflows/`, 13 files)

> **CLAUDE.md's workflow table is STALE** — it lists `daily-data-refresh.yml`, `scrape-weekly.yml`, `scrape-monthly.yml`, `deadline-refresh-monthly.yml` which **do not exist**. Actual files below.

Run status: `gh run list --limit 60`. Over the recent window: **almost entirely green.**

| File | Trigger | Status (recent runs) |
|---|---|---|
| `canonical-data-refresh.yml` | daily `0 4 * * *` | ✅ success ×6 |
| `scorecard-refresh.yml` | daily `30 4 * * *` | ✅ success ×6 |
| `deadlines-requirements-refresh.yml` | weekly Wed `0 6 * * 3` | ✅ success ×1 |
| `scraper-enrich.yml` | weekly Tue `0 5 * * 2` | ✅ success ×1 |
| `data-quality.yml` | weekly Mon `0 6 * * 1` | ✅ success ×1 |
| `masters-scraper-refresh.yml` | weekly Wed `0 6 * * 3` | (no recent run captured) |
| `global-data-refresh.yml` | weekly Wed `0 3 * * 3` | ❌ **failure ×1** — see below |
| `india-weekly-refresh.yml` | Mon `0 2 * * 1` | ✅ success ×1 |
| `india-monthly-refresh.yml` | 1st `0 3 1 * *` | UNKNOWN (no recent run) |
| `uk-data-refresh.yml` | 15th `0 4 15 * *` | ✅ success ×1 |
| `enrich-colleges.yml` | weekly Sun `0 2 * * 0` | ✅ (Daily College Data Refresh green ×3) |
| `frontend-runtime-validation.yml` | push/PR | ✅ ×12, ❌ ×1 |
| `onboarding-smoke.yml` | push/PR | ✅ ×13 |

**Finding B3 (contradicts prompt premise AND CLAUDE.md):** Data-enrichment workflows are **running green on schedule and writing to Supabase** (Canonical Data Refresh 11m15s, Scorecard Refresh 13m54s, both scheduled on `main`). The prompt's "enrichment fails when Actions reaches Supabase" and CLAUDE.md's "Actions stuck in `action_required`" are **both stale/false as of 2026-07-16/17.** The single data failure (`global-data-refresh.yml`, 2026-07-15) is **not connectivity** — `gh run view --log-failed` shows `DATABASE_URL` present, then `ERROR No QS rows; aborting`: the QS-rankings **source scrape** returned 0 rows. Root cause is scraper source brittleness, not DB reachability. Detail in `audit/03_blockers.md`.
