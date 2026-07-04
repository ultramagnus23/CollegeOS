# CollegeOS — Launch Checklist

Generated after a launch-readiness pass on 2026-07-04. This lists what was fixed
in-repo vs. what still needs a human with dashboard/console access.

## Done this pass

- Moved all `*_REPORT.md` / `*_STATUS.md` / audit docs into `docs/audits/`; deleted stale `.session-handoff.txt`.
- Confirmed `scraper/pipeline.py` and `scrapers/run_deadline_refresh.py` are still live-referenced by `daily-data-refresh.yml`, `scrape-weekly.yml`, and `scrape-monthly.yml` — **not deleted** (would break those workflows). See `README.md` Scrapers section.
- Fixed a real README/docs mismatch: `pgvector` **is** installed and all ~8,500 institutions already have backfilled embeddings powering hybrid recommendation retrieval (gated on a live infra-health check). Docs previously claimed otherwise.
- Standardized the chancing disclaimer ("model estimates trained on simulated data from published statistics, not real outcomes") across `Chancing.tsx`, `CollegeDetails.tsx`, `Applications.tsx`, and the dashboard college-list widget; updated `legal/ai-disclaimer.md` to match.
- Confirmed `/terms`, `/privacy`, and 6 other legal pages already exist and are linked from a global footer — verified live in the browser.
- Promoted the completeness/freshness data indicator on browse cards into a real `ConfidenceBadge` component.
- **Fixed a workflow-file bug** in `india-weekly-refresh.yml` / `india-monthly-refresh.yml`: an invalid double-quoted string inside a `${{ }}` expression made GitHub reject the entire workflow file (0 jobs ever ran, silently, for weeks). Switched to the required single-quote syntax.
- Added CI status badges to `README.md`.
- Closed all 5 open PRs (#7, #17, #18, #33, #35) with explanatory comments — all predated the June canonical-schema rewrite and had merge conflicts against current `main`.
- **Fixed a live Express route-ordering bug** in `backend/src/routes/colleges.js`: `/comprehensive/:id` was registered before `/comprehensive/stats`, so every landing-page stats fetch was swallowed by the `:id` handler and returned a 404 "College not found" on every page load. Moved `/comprehensive/stats` above `/comprehensive/:id`.
- Ran the full app locally (backend on :5000, frontend on :8080) end-to-end: landing page, `/colleges` browse (data-sparsity handling verified live — "Data not available yet" / coverage warnings render correctly), `/terms`. No console errors or failed API calls after the fixes above.

## Needs a human (dashboard/console access required)

1. **GitHub Actions approval gate.** Per CLAUDE.md this was the headline blocker; it looks cleared now (`frontend-runtime-validation`, `onboarding-smoke`, `canonical-data-refresh`, `daily-data-refresh`, `scorecard-refresh` are all green on recent runs). Spot-check `Settings → Actions` to confirm no workflows are still sitting in `action_required`.
2. **Push the fixes in this session.** Everything above is committed locally on `main` but not yet pushed — confirm before pushing since it's a shared branch. Merging/pushing will also trigger a fresh Actions run for the two India workflows, which is the only way to confirm the YAML fix actually resolves them (I could only prove they were *broken*; I couldn't dispatch a fresh run without pushing first, since `gh workflow run` operates on whatever's already on the remote).
3. **`enrich-colleges.yml` fails with a generic `fetch failed`** despite all secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SCORECARD_API_KEY`) being present in the run. This pattern (works locally, fails from GitHub's runner IPs) is consistent with a Supabase project network restriction / IP allowlist blocking GitHub Actions' ephemeral IPs. Check Supabase dashboard → Settings → Database → Network Restrictions.
4. **`scrape-weekly.yml` / `scrape-monthly.yml` are genuinely broken**, not gated — real schema drift (`canonical.institution_requirements missing columns: requirement_category, requirement_name`, `canonical.institution_admissions missing columns: acceptance_rate, institution_id`) plus a broken `ScrapeDiagnostic.__init__()` call missing required args in the legacy scraper test suite. This is the same known-broken legacy scraper tree CLAUDE.md already documents — needs a dedicated fix pass, not a quick patch, given the scope of schema misalignment.
5. **Environment variables to confirm on Render/Vercel** (not just locally):
   - Backend (Render): `DATABASE_URL` / `SUPABASE_DB_URL`, `SUPABASE_SERVICE_KEY`, `NODE_ENV=production`, `COLLEGE_SCORECARD_API_KEY` (or `DATA_GOV_API_KEY`).
   - Frontend (Vercel): `VITE_API_BASE_URL` pointed at the Render backend URL (confirmed this is what the checked-in `.env.example` recommends), plus the six `VITE_FIREBASE_*` keys.
   - GitHub Actions secrets: `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCORECARD_API_KEY` — all confirmed present via workflow preflight diagnostics, but see #3 above re: network access.
6. **Legal pages are explicitly marked as drafts** ("pending final review by a licensed lawyer," bracketed `[PRIVACY EMAIL]` placeholders). Get an actual lawyer to review `/legal/*.md` before this is genuinely launch-ready from a compliance standpoint — the disclaimers are honest about being drafts, but they are drafts.
7. **CodeQL alerts.** Per prior session memory, 62 open CodeQL alerts remained as of the last security audit — worth triaging before public launch, independent of this pass's scope.
