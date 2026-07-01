# Production Readiness Checklist

Synthesized from this session's full data-integrity cleanup, provenance rollout, browser
QA, and regression audit. Checked items are backed by a verification performed in this
session (DB query, live browser test, or `tsc`/syntax check) — not assumed.

## Data

- [x] **Fabricated values removed** — 207 fake `manual_seed` tuition rows nulled; 74%
      of colleges' fabricated 50%-default acceptance rate replaced with an honest
      "Insufficient Data" state; 643 + 453 fabricated masters derived-scores nulled;
      288 additional impossible undergrad financial/admissions values nulled; the ML
      chancing model trained on simulated applicants disabled.
- [x] **Guardrails enabled** — `verified_data_guards.ts` (frontend, 7/7 tests) and
      `verifiedDataGuards.js` (backend, 14/14 tests) built and tested. **Not yet wired
      into any live write path** — see Remaining below.
- [x] **Provenance — schema and columns** — migration 130 ran live: extended
      `verification_status` enum (10 values), added `verification_status`/
      `last_verified_at` + 28 indexes to 14 tables.
- [x] **Provenance — scraper rollout** — all 10 real scraper write-sites in
      `scraper/sources/*.py` now tag `verification_status` (government sources tagged
      `government_verified`, ranking bodies/general scrapes tagged `scraped`). Scope
      note: `scraper/masters/*` and the separate `scrapers/` tree (per `CLAUDE.md`,
      not the active tree) were not touched.
- [ ] **Provenance — backfill** — explicitly not done, by instruction. All pre-existing
      rows read `verification_status = 'unknown'` until a dedicated backfill pass runs.
- [x] **Acceptance-rate recovery** — all 219 affected rows resolved (12 + 204 + 2 restored
      from verified real sources; 1 genuinely unrecoverable, left null). Zero outstanding.
- [ ] **Duplicate institutions merged** — not executed. Preparation complete
      (`final_duplicate_merge_plan.md`): confirmed zero real user-data risk, but the
      financials/admissions/completeness/rankings conflict-resolution still needs a
      dedicated, individually-reviewed migration.

## Product

- [x] **Masters onboarding verified** — full 7-step live browser test; found and fixed
      one real bug (step position not persisted across refresh). See
      `masters_onboarding_qa.md`.
- [x] **Masters dashboard verified** — initial post-onboarding render confirmed correct,
      no fabricated data shown. Not every widget/link click-tested.
- [ ] **Undergrad dashboard/recommendations verified** — code-reviewed only in this
      pass, not live-click-tested. See `final_regression_audit.md` coverage table.
- [x] **Landing page verified** — complete redesign shipped and verified live: correct
      rendering, working FAQ interactivity, correct routing, no mobile overflow, clean
      `tsc`.
- [x] **Colleges search page bug found and fixed** — country-filter crash
      (`countryData.map is not a function`), traced to a missing `await` plus a stale
      hardcoded 4-region list; fixed and verified against the live database. **Needs
      deployment to Render to take effect in production** — see Engineering below.

## Engineering

- [x] **Migrations safe** — migration 130 used only additive, reversible operations
      (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
      `ALTER TYPE ... ADD VALUE IF NOT EXISTS`); no data mutation, verified live.
- [ ] **Rollbacks tested** — not tested. Migration 130 has no down-migration written or
      exercised; the duplicate-institution merge plan documents a rollback-safe design
      (soft-mark before hard-delete) but that migration hasn't been run yet to test.
- [x] **Indexes verified** — 28 new indexes confirmed present via
      `pg_indexes` query after migration 130.
- [ ] **Performance acceptable** — not benchmarked in this pass. One `slow_query_detected`
      warning (>500ms) was observed on `getCountryFilters`'s new query during manual
      testing — noted, not optimized (a `GROUP BY country_code` over
      `mv_college_cards` with no supporting index on `country_code`; worth an index if
      this endpoint is hit frequently).
- [ ] **The country-filter fix is not yet deployed** — verified correct against the
      production database from a local process, but the actual Render-hosted API still
      serves the old, broken code until this change is deployed.

## UX

- [x] **Mobile verified** (partial) — `/auth` and `/` (landing) checked at 375×812, no
      overflow, correct responsive text scaling. Not every page checked at mobile width.
- [x] **Desktop verified** — all pages navigated in this session rendered correctly at
      desktop viewport.
- [ ] **Accessibility checked** — not audited in this pass. The accessibility-tree
      snapshots used for QA incidentally show reasonable semantic structure (headings,
      labeled form fields, `aria-expanded` on the FAQ toggle), but no dedicated a11y
      pass (contrast ratios, keyboard navigation, screen-reader flow) was performed.
- [ ] **Empty states complete** — spot-checked only (masters dashboard's "No saved
      programs with deadlines yet" and "Funding unknown" render correctly and
      honestly). Not exhaustively reviewed across every page.

## Remaining before schema expansion begins (smallest list)

1. **Deploy the country-filter fix** (`College.js`, `collegeController.js`) to
   production — currently only verified locally against the same DB.
2. **Wire `verifiedDataGuards`/`verified_data_guards` into at least the primary write
   paths** (`consolidatedChancingService.js`, `College.js` writes if any exist,
   scraper Python equivalent) — built and tested, not yet enforced anywhere.
3. **Resolve the duplicate-institution financials/admissions/completeness/rankings
   conflicts** via the holding-table approach in `institution_merge_plan.md`, then
   execute the confirmed-safe reassignments from `final_duplicate_merge_plan.md`.
4. **Backfill `verification_status`** on existing rows using the classification rules
   already worked out in `data_provenance_design.md` and this session's audits (e.g.
   `college_scorecard` → `scraped`, nulled `manual_seed` rows → `deprecated`).
5. **Full live regression pass on undergrad flows** (dashboard, recommendations,
   college details, favorites, profile updates) — not covered in this pass; the same
   throwaway-account method used for masters QA can be reused.
