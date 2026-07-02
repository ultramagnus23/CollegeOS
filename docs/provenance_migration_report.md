# Data Provenance System — Implementation Report

Implements the schema from `docs/data_provenance_design.md`. **Schema and plumbing only
— no backfill**, per explicit instruction. All existing rows default to
`verification_status = 'unknown'` rather than being marked verified without a real
classification pass.

## 1. Migration

**File:** `backend/migrations/130_provenance_system.sql`. Ran directly against the live
DB (verified before/after, not assumed).

- Extended the **existing** `canonical.verification_status` enum (defined in migration
  079, previously used only by `canonical.institutions`) rather than creating a new
  type — added `scraped`, `imported`, `inferred`, `estimated`, `user_supplied`,
  `unknown` to the existing `unverified`, `verified`, `government_verified`,
  `deprecated`. Confirmed live: `["unverified","verified","government_verified","deprecated","scraped","imported","inferred","estimated","user_supplied","unknown"]`
  — 10 values, matching the design doc's 9-value target plus the pre-existing
  `unverified`.
- Added `verification_status canonical.verification_status NOT NULL DEFAULT 'unknown'`
  and `last_verified_at TIMESTAMPTZ` to all **14** tables that already carry
  `source_attribution`: `institution_admissions`, `institution_campus_life`,
  `institution_demographics`, `institution_financials`, `institution_outcomes`,
  `institution_programs`, `institution_rankings`, `eu_admissions_profile`,
  `india_admissions_profile`, `india_financial_aid`, `uk_admissions_profile`,
  `uk_financial_support`, `us_admissions_profile`, `us_financial_aid`.
- Added 28 indexes (one on `verification_status`, one on `last_verified_at`, per table)
  so "show only verified data" and re-verification-window queries are indexed from day
  one rather than retrofitted later.
- **Verified live** via `information_schema.columns` and `pg_indexes` queries after
  running: all 14 tables show both new columns with the correct default
  (`'unknown'::canonical.verification_status`), all 28 indexes exist.

**Note on `ALTER TYPE ... ADD VALUE`**: this cannot be used in the same transaction as a
later statement that references the new value in a parsed `DEFAULT` clause, so the 6
`ADD VALUE` statements were run first as independent auto-committing statements, then
the column/index `DO $$ ... $$` block ran afterward. The migration file documents this
sequencing requirement in its header comment for anyone re-applying it via a fresh-DB
migration runner.

## 2. ORM support

`backend/src/services/collegeService.js` — added `verification_status, last_verified_at`
to the `admissionsPromise` and `financialsPromise` `SELECT` lists (the two most
trust-sensitive domains, matching this session's fabrication incidents). Verified
`node -c` syntax-clean.

## 3. API support

Since `collegeService.js` directly backs the college-detail route response (no
transformation layer strips fields), adding the columns to its `SELECT` statements *is*
the API-level change — no separate route-handler edit was needed. Existing response
shape is additive-only (no fields removed or renamed).

## 4. Scraper support

`scraper/sources/nces_ipeds.py`'s `process_ic_ay` function (writes to
`institution_financials` from real US Dept. of Education IPEDS data) now sets
`verification_status = 'government_verified'` and `last_verified_at = NOW()` on both
insert and the `ON CONFLICT ... DO UPDATE` path. This is the concrete pattern other
scrapers should copy: **not modified in this pass** (out of scope — this establishes the
pattern in one real, currently-active scraper rather than touching every scraper file).
Verified `python -c "import ast; ast.parse(...)"` — syntactically valid.

Scrapers NOT yet updated with this pattern (flagged, not touched): every other file
under `scraper/sources/*.py` and `scraper/masters/**/*.py` that writes to a
provenance-bearing table. Each should set an appropriate `verification_status` matching
its actual data quality (e.g. `scraped` for a live scrape, `estimated` for a derived
metric, never leaving the `unknown` default on a genuine write).

## 5. Frontend support

- `src/contracts/collegeContracts.ts` — added `verification_status, last_verified_at` to
  the `admissions` and `financials` entries in `COLLEGE_DETAIL_SECTION_COLUMNS` (the
  actual Supabase query column list — without this change, adding TS types alone would
  not have fetched the new columns at all).
- `src/lib/collegeService.ts` — added `verificationStatus`/`lastVerifiedAt` fields to
  the `admissionsData` and `financialData` objects returned by `formatCollege`, typed
  against the `VerificationStatus` union already defined in
  `src/lib/verified_data_guards.ts` (reused rather than re-declared, so the two stay in
  sync structurally).
- Verified `npx tsc --noEmit -p .` — clean, no errors introduced.

## 6. Explicitly NOT done (backfill) — what it would look like later

- All existing rows in the 14 tables currently read `verification_status = 'unknown'`
  (the column default) — this is correct and intentional, not an oversight. A future
  backfill pass would need to classify existing rows using the same method this
  session's manual audits used: check `source_attribution->>'source'` /
  `raw_payload` non-emptiness / the nested-key pattern found in
  `data_audit_report.md` (e.g. `college_scorecard`-sourced rows → `scraped`;
  `h3_financials_enrichment`-nested rows → `scraped` or `imported`; the confirmed
  `manual_seed`-with-empty-`raw_payload` rows → `deprecated`; the migration-129
  `manual_seed`-with-real-differentiated-values rows, per `acceptance_rate_recovery.md`'s
  correction → `user_supplied` or a real `scraped`-adjacent status, not `deprecated`).
- The Python-side scraper rollout (only 1 of many scraper files updated with the
  pattern) remains open work.
- No frontend UI (badge/tooltip) was built to *display* verification_status yet — the
  design doc recommends a lightweight per-domain-block badge; this pass only makes the
  data available to the frontend, it doesn't render anything with it yet.
