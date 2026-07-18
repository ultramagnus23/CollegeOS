# audit/03_blockers.md — Functional Blockers (READ-ONLY root-cause)

## 1. "Enrichment connectivity failure" — NOT REPRODUCED (premise stale)

Checklist worked through with evidence:

- **Connection method:** workflows use `DATABASE_URL` / `SUPABASE_DB_URL` secrets. Local `.env` `DATABASE_URL` host = `aws-1-ap-northeast-2.pooler.supabase.com:6543` — the **IPv4 Supavisor pooler (transaction mode)**, i.e. already the recommended path. (`grep '^DATABASE_URL=' .env | sed 's|.*@||'`)
- **IPv6 test:** N/A — the connection string is the pooler hostname, not the direct `db.<ref>.supabase.co:5432` host, so the IPv6-only-AAAA failure mode the prompt anticipates does not apply here. A live connectivity read succeeded from this machine (`psql "$DATABASE_URL" -c "select version()"` → PostgreSQL 17.6).
- **Actual run status** (`gh run list --limit 60`): data-enrichment workflows are **green on schedule** — Canonical Data Refresh ✅×6 (11m15s), Scorecard Refresh ✅×6 (13m54s), Deadlines/Requirements ✅, scraper-enrich ✅, UK ✅, India-weekly ✅, data-quality ✅. They are reaching Supabase and writing.
- **The one data failure** (`global-data-refresh.yml`, 2026-07-15): `gh run view --log-failed` → `DATABASE_URL` present; failed at the **QS-rankings source step** with `ERROR No QS rows; aborting` (`set -euo pipefail`, exit 1). Root cause = the QS scrape returned 0 rows (source-site change/block), **not** DB connectivity.

**Conclusion:** There is no active connectivity blocker. CLAUDE.md's "Actions stuck in `action_required`" is also stale — jobs are executing. The real pipeline fragility is **source-scraper brittleness** (a 0-row scrape aborts the whole job via `pipefail`). *Recommendation:* make source steps degrade gracefully (warn + skip on 0 rows) instead of failing the workflow; no connection change needed. If a direct-string workflow is ever added, use the pooler string — but none currently uses it.

## 2. Deadline acquisition engine — the real reason coverage is 2.7%

Four-tier design vs reality (`backend/src/scrapers/adapters/`, `backend/scripts/runScraper.js`, workflow grep):

| Tier | Implemented? | Wired into a workflow? | Notes |
|---|---|---|---|
| **UCAS rules (UK)** | Yes — `backend/scripts/phase3_seed_uk_ucas_deadlines.js` | **No** — one-shot seed script, not scheduled | Produced the 57 UK rows once; static |
| **CDS PDF (pdfplumber-equiv)** | **Yes** — `commonDataSetDeadlines.js`, registered as `cdsDeadlines` in `runScraper.js:18`, targets 241 institutions | **NO — invoked by zero workflows** (`rg 'runScraper.js' .github/workflows` shows only `usDeadlines/usRequirements/nirfRankings/institutionPlacements/arwuRankings/wikidata`) | **This is the gap.** The scalable tier exists and is dispatchable but is never run on a schedule |
| **Common App grids** | **No adapter** (`git ls-files | grep -i commonapp` → none) | — | Not built |
| **Deterministic HTML** | Yes — `usOfficialDeadlines.js` (hand-curated ~31) | **Yes** — the only deadline tier actually scheduled (`deadlines-requirements-refresh.yml:57`) | Runs weekly, `--limit 200`; last success 2026-07-15 |

**Cross-check with Phase 2 coverage (262/9,848 = 2.7%):** consistent. Only the hand-curated HTML tier (~31–90 institutions) runs on schedule; the 241-target CDS parser that would scale coverage is **coded but dormant**. UCAS is a frozen one-shot; Common App is unbuilt.

**Highest-leverage, lowest-cost fix in the whole audit:** add one step to `deadlines-requirements-refresh.yml` → `node scripts/runScraper.js cdsDeadlines --limit=...`. No new code, zero cost, and it activates the parser CLAUDE.md already calls "the scalable primary mechanism." (Confirm the parser's current yield on a dry run before committing to a schedule.)

## 3. End-to-end user flow — LIVE walkthrough (backend :5000 + frontend :8080)

Backend booted clean (`Server running on port 5000`, `Colleges table: 9442 rows`, schema contract `ok:true`). Frontend loaded with no console errors. Flow walked in the in-app browser:

**Search → list (`/colleges`): WORKS.** `GET /api/colleges`, `/search?q=Harvard`, `/filters/*` all 200. Search for "Harvard" returns the right row with **real card data** (Acceptance 3.7%, Tuition $85,540).
- ⚠️ *Empty-state (missing data):* default list (first 100, alphabetical) shows nearly every card as "Data not available yet" + "⚠ Incomplete data" — root cause **missing data** (low-coverage institutions sort first), not broken code. Even Harvard's card shows SAT/ACT/Start Salary/Grad Rate as "not available."
- ⚠️ *UX:* the "⚠ Incomplete data / Data not yet verified" badge fires even on Harvard (which has verified acceptance + tuition). The completeness/verification threshold is over-pessimistic.

**List → college detail page: BROKEN (contract drift) — the headline functional bug.**
- Clicking "View Details" issues `GET /api/colleges/harvard-university-ceda6162-…` → **404**, then the app retries `GET /api/colleges/ceda6162-…` (UUID) → 200. **Bug 3a:** the card's `slug` (`<name>-<uuid>`) doesn't match the detail endpoint's slug resolver (canonical slug is `harvard-university-united-states`), so every detail open eats a failing round-trip before the UUID fallback.
- The page then renders **"Unknown / University", Location "Unknown", blank Acceptance Rate, and seven empty "Global Rank ()" rows** — for a college whose API response contains all of it. **Bug 3b (root cause):** the detail endpoint returns the **canonical nested shape** `{institution:{canonical_name, city, state_region, country_code…}, admissions, financials, deadlines, rankings, …}` (verified: `curl … | keys`), but `src/pages/CollegeDetails.tsx` reads a **legacy flat shape** (`name`, `location`, `acceptance_rate`, `ranking`, `deadlineTemplates`, `comprehensiveData`, `admissionsData`). The card list was migrated to the canonical contract; **the detail page was never migrated.**
- **Consequence:** the detail page is broken for **all colleges regardless of data coverage** — this is *broken code*, not missing data. Harvard's deadlines and rankings are present in the response but never displayed. Deadlines display therefore can't be evaluated as "sparse" here — it's not wired to the data at all on this page.

**Chancing:** gated behind auth — "Sign in to see your chances" / "Create a free account to unlock chancing." Expected behavior for a guest; not testable without a login. (Chancing service = calibrated logistic regression + Brier tracking per constraint; not exercised in this pass.)

**Other boot-time observations:**
- `error: relation "scholarships_new" does not exist` — code probes `scholarships_new`, falls back to `scholarships`. Matches CLAUDE.md's unresolved `scholarships` vs `scholarships_new` duplication; the probe is dead weight.
- `warn: Recommendation env vars missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, EMBEDDING_MODEL, PYTHON_PATH`. Two flags for the zero-LLM constraint: (a) the rec pipeline *checks for* `OPENAI_API_KEY`/`EMBEDDING_MODEL` — confirm these are not actually called in the data path (embeddings are precomputed + stored, similarity is in-app cosine, so this is likely a vestigial env check, but worth verifying it can't trigger a paid call). (b) With them unset, recommendations may run in a degraded/fallback mode locally.

### Root-cause map
| Symptom | Root cause | Class |
|---|---|---|
| Cards show "Data not available yet" | Low field coverage on most institutions | Missing data |
| Detail page "Unknown"/blank everywhere | `CollegeDetails.tsx` reads legacy flat contract; API returns canonical nested | **Broken code** |
| Detail open → 404 then retry | card `slug` ≠ detail endpoint slug resolver | **Broken code** |
| Deadlines not shown on detail | same contract drift (response has `deadlines`, page ignores it) | **Broken code** |
| Deadline data itself thin | scalable CDS parser dormant (unscheduled) | Blocked pipeline |
| `global-data-refresh` red | QS source returned 0 rows + `pipefail` | Scraper brittleness |
