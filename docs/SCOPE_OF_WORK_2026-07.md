# CollegeOS Revamp — Scope of Work (2026-07-08)

Grounded in a live end-to-end API audit of both tracks (fresh user → register → onboard →
dashboard → discovery → chancing → deadlines → scholarships), live prod DB counts, and a
dead-code sweep. Companion doc: [PRD_COLLEGEOS_V2.md](PRD_COLLEGEOS_V2.md).

---

## 1. E2E Audit Results (what works / what doesn't)

### Undergrad track — WORKS
| Surface | Status | Evidence |
|---|---|---|
| Register / login / JWT | ✅ | 201/200, tokens issued |
| Onboarding → profile persistence | ✅ | PUT /auth/onboarding 200, completion 65% stable, both `users` + `student_profiles` written |
| Dashboard aggregate | ✅ | profile %, R/T/S distribution, nextAction all real |
| Recommendations | ✅ | Relevant + country-filtered (Cambridge/UK for US+UK CS applicant), reach/target/safety spread, chancing-consistent admit % |
| College search | ✅ | RPC-based, relevance-ranked, filters live |
| Notifications / timeline / deadlines endpoints | ✅ (empty-state) | 200s; content appears only after applications are created |

### Undergrad track — BROKEN or LOW-VALUE
| Surface | Problem | Root cause | Fix size |
|---|---|---|---|
| **Scholarships page** | Empty for every user, always | `routes/scholarships.js` passed `needBased/meritBased: false` (instead of `undefined`) when the query params were absent → model appended `AND need_based=false AND merit_based=false` → 0 of 56 rows match | **FIXED this session** (2 lines) |
| Scholarships data | All 54 dated deadlines are in the past (2024 cycle); `amount` NULL on flagship rows; 2 parallel tables (`scholarships` 56 rows, `scholarships_new` 36 rows) with different schemas, `user_scholarships` has 0 rows ever | Stale 2024 seed, never refreshed; duplicated model | Data refresh + table consolidation (2–3 d) |
| Deadlines auto-population | User must add deadlines manually for most colleges | `canonical.institution_deadlines` has only 228 rows (~58 institutions) out of 8,236 | Data acquisition, not code (ongoing scraper target expansion) |
| Requirements | Same — 234 rows | Same | Same pipeline |
| `GET /scholarships/search`, `GET /scholarships/match` | 400 (route `/:id` swallows the words as an id) | Route-order trap; frontend doesn't call these paths, but any consumer that does gets a DB error | 30 min guard (`/:id(\\d+)`) |
| Exchange-rate persistence | Fails on every boot | `currency_rates` table missing `source_api` column (migration drift) | 1 migration |

### Masters track — WORKS
- Track switch (`PUT /masters/track` with `programTrack`), masters profile save (frontend field
  names verified to match backend sanitizer), programs list, discover, program detail,
  readiness checklist, funding list, applications CRUD — all 200 and correctly gated.
- Isolation holds: masters routes never touch undergrad chancing (TRACK_VIOLATION guard live).

### Masters track — the real problem is DATA, not code
| Gap | Live number | Consequence |
|---|---|---|
| `masters_program_deadlines` | **0 rows** | Masters Deadlines page permanently empty; no timeline value |
| `masters_admission_datapoints` | **0 rows** | Chancing returns `insufficient_data` band for essentially every program (even MIT) |
| Programs with `acceptance_rate` | **3 / 648** | Same as above |
| Programs with tuition | 110 / 648 | Funding/cost comparison mostly blank |
| Programs linked to a canonical institution | 251 / 648 | 61% of programs can't join rankings/outcomes/institution data |
| Funding fields (stipends, assistantships, waivers) | ~all NULL | Funding page shows names with no numbers |
| Scholarships (structured) for masters | 0 (449 programs have only free-text `raw_scholarships` from the Excel) | No masters scholarship matching possible |

### ML engine — honest status
- Undergrad chancing model: logistic regression trained on applicants **simulated from real
  aggregate stats** (ROC-AUC 0.873 on synthetic holdout — not real accuracy). Real outcome
  labels: `prediction_logs.actual_outcome` = **0 rows**, `admission_outcomes` = 0,
  `masters_admission_datapoints` = 0. **There is no concrete data to train on today.**
- The only realistic paths to concrete labels (in order of speed):
  1. **GradCafe scraping** for masters (`scraper/masters/grad_cafe.py` was already revived to
     parse the Inertia.js page JSON) → populates `masters_admission_datapoints` with real
     (profile, program, decision) tuples. This is the single highest-leverage ML task.
  2. **Outcome capture loop** in-product: when a user's application reaches a decision,
     prompt for the result → writes `prediction_logs.actual_outcome`. Slow to accumulate but
     it's the compounding moat.
  3. Public self-reported UG results (r/collegeresults-style) — legally reviewed before use
     per the primary+open-sources-only rule.
- Do **not** claim "trained ML" in the UI until (1) or (2) has real volume. Masters bands are
  rules-based by design and must stay that way until datapoints exist.

---

## 2. Dead code & bloat inventory

Verified this session (zero live references unless noted):

| Item | Type | Action |
|---|---|---|
| `backend/src/services/deadlineGenerator.js` | Dead (referenced only in comments) | Delete |
| `backend/src/services/intelligentSearch.js` | Dead | Delete |
| `backend/src/services/chancingService.js` (legacy pre-consolidation) | Dead | Delete |
| `backend/archive/`, `scraper/archive/` (~3 MB) | Dead trees | Delete from repo (git history retains) |
| `backend/db/migrations/` (1 orphan file) | Orphan | Delete |
| `backend/src/routes/search.js` | Dead route (frontend uses canonical RPCs directly) | Delete route + mount |
| `src/pages/FinancialAid.tsx` | Dead (redirects to /scholarships) | Delete + keep redirect in router |
| `scholarships` vs `scholarships_new` | Duplicate tables | Consolidate onto one schema (keep the richer `scholarships` columns, add `degree_levels` usage) |
| `tasks` vs `application_tasks` | Parallel task tables (partial consolidation done in mig 116) | Finish consolidation, drop `application_tasks` |
| `scraper/` vs `scrapers/` Python trees | Both referenced by different workflows | Pick one (recommend `scraper/`, which the newer masters + expanded scorecard code lives in), port the 2 live jobs, delete the other |
| `docs/TROUBLESHOOTING.md` | Stale (SQLite-era) | Delete or rewrite header |
| CLAUDE.md "migration 070 pending / ~98 files" | Stale fact (repo is at 138, 149 files) | Update |

Load-time note: the heavy fixes (route-level lazy-loading, backend warmup ping, dashboard
query parallelism) already landed in June. Remaining wins are dead-page removal above,
`Onboarding.tsx` (107 KB single file) split, and bundle analysis on `recharts`/`firebase`
(the two largest deps).

---

## 3. Workstreams, order, and effort

**WS1 — Quick fixes (≤1 day)** ✅ partially done this session
scholarships filter bug (done), `/:id` route guard, `currency_rates.source_api` migration,
CLAUDE.md stale-fact refresh.

**WS2 — Scholarships that actually help (3–5 days)**
Consolidate the two tables → one `scholarships` schema with `degree_levels`; refresh the 56
stale rows to the 2026-27 cycle (primary sources only — provider pages); structured-extract
the 449 `raw_scholarships` texts from the postgrad Excel into scholarship rows linked to
programs; wire masters funding page + a masters scholarships tab to it; deadline-aware
sorting (future first); revive `user_scholarships` tracking UX.

**WS3 — Masters data re-verification & fill (1–2 weeks, parallelizable)**
Re-verify the 648 imported programs against program pages (validator + confidence gating
already exist in `scraper/masters/`); backfill `canonical_institution_id` for the 397
unlinked; scrape program deadlines into `masters_program_deadlines` (the deadline model
exists, table is empty); tuition/funding extraction; GradCafe ingestion into
`masters_admission_datapoints` → chancing bands light up for real.

**WS4 — Deadline/requirements coverage (ongoing)**
Continue TARGETS expansion (23/58 verified today) with the #139 adapter framework; goal:
every college a user actually adds has auto-deadlines, so nothing is manual. Metric: % of
newly-created applications that get ≥1 auto deadline (instrument it).

**WS5 — Dead code removal (1–2 days)** — table above, one atomic PR per row group, tests after each.

**WS6 — Dashboard + UX revamp (1–2 weeks)** — per PRD. Undergrad dashboard is data-wired but
generic; masters dashboard is skeleton. Redesign around "what should I do this week".

**WS7 — ML v2 (after WS3)** — retrain masters bands → calibrated model on GradCafe
datapoints; undergrad stays simulated-calibrated until outcome capture accumulates; ship the
outcome-capture prompt now so labels start accruing.

Recommended order: WS1 → WS2 → WS3 (+WS4 in background) → WS5 → WS6 → WS7.

---

## 4. Done this session (2026-07-08, commits cfa84e2, 3d8e750, 3d546f5, f92aafb)

- **WS1**: Scholarships empty-list bug fixed and verified live (50+ rows now return).
  Migration 140 fixes `currency_rates` missing `source_api` (was erroring every boot).
  CLAUDE.md stale facts corrected (migration count/status, dead-code table).
- **WS5**: Removed `backend/archive/`, `scraper/archive/`, `deadlineGenerator.js`,
  `FinancialAid.tsx`, and a dead `matchScholarships()` in `financialScoringService.js` that
  silently preferred the orphaned `scholarships_new` table — all verified zero-reference
  before deletion, tsc + backend boot both clean after.
- **WS2**: Migration 141 nulls 54 scholarship deadlines stale since 2024. Masters program
  detail pages now surface the department's own funding link/notes
  (`raw_scholarships` → `funding_source_notes`, zero fabrication). Added Knight-Hennessy
  Scholars (the one legitimate named scholarship found missing from the canonical table)
  as a ready-to-run seed script.
- **WS3**: Second-pass institution-link backfill (alias map + qualifier stripping, both
  verified/explicit — no fuzzy-threshold guessing) linked 17 more masters_programs rows
  live (251→268/648). 380 remain genuine data gaps, logged not guessed.
- **WS7**: Found and fixed the ML outcome-capture loop, which had been **completely
  broken** — `users.ml_consent` didn't exist as a column (migration 142 adds it) and the
  `ml_training_data` INSERT used a column list that didn't match the live table at all.
  Added a consent toggle in Settings → Preferences (didn't exist anywhere in the frontend
  before). Verified end-to-end live: register → enable consent → create application → mark
  accepted → a real row lands in `ml_training_data`. Masters' equivalent loop
  (`POST /masters/outcomes` → `masters_admission_datapoints`) was already correct.
- **WS6**: Dashboard "Do this next" hero now shows up to 3 ranked priority actions instead
  of only 1 (verified live: fresh user now sees both "complete your profile" and "add your
  first college" simultaneously). Full visual dead-section audit deferred — needs live
  browser walkthrough, not done this pass.

## 5. Major finding: an unmerged branch with real, already-prod-applied work

`chore/launch-readiness-audit` (20 commits, diverged from `main`) contains work already
verified and applied to the live DB that `main` doesn't have — including the **GradCafe
scraper revival** and a **Common Data Set PDF deadline scraper** (the two things this doc's
WS3/WS4 identify as the highest-leverage remaining gaps), plus new UK/Australia/India
outcome scrapers, an IPEDS completions scraper, and an institution_programs backfill. It
merges cleanly (`git merge-tree` shows zero conflicts) but was **not merged** this session —
that's a scope decision for you, not something to do silently. This is also the direct cause
of the migration-numbering collision hit this session (139 exists live from this branch;
main's next free slot was actually 140).

**Recommended next action:** review and merge `chore/launch-readiness-audit`, then re-run
the E2E audit — several "empty data" findings in this doc may already be fixed there.

## 6. Deferred (flagged, not attempted — needs explicit sign-off or more time)
- `scraper/` vs `scrapers/` consolidation (touches live cron workflows).
- `scholarships` vs `scholarships_new` DB-level table drop (destructive).
- Full masters data re-verification at scale (WS3 remainder, 380 rows).
- Visual dashboard dead-section removal + masters dashboard parity (needs live browser QA).
- Merging `chore/launch-readiness-audit`.
