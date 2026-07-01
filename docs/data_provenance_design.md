# Data Provenance System — Design Document

**Status:** Design only. No migrations or code written. Follows `docs/data_audit_report.md` (2026-07-01 financials audit, 15,958 rows) and `docs/synthetic_data_inventory.md` (9-item fabrication inventory, 5 fixed / 4 open).

---

## 1. Current state (what exists today)

Grepped `backend/migrations/*.sql` for every provenance-adjacent column. Three incompatible generations coexist:

| Generation | Shape | Where |
|---|---|---|
| **Legacy SQLite-era (archived, dead)** | scalar `confidence_score REAL`, `last_verified DATE`, occasionally `verification_status TEXT DEFAULT 'unverified'/'auto'` | `011`, `013`–`022`, `029`, `031`–`034`, `068` — pre-canonical, mostly superseded tables |
| **Mid-era scalar** | `data_source TEXT`, `last_verified_at TIMESTAMPTZ`, `data_quality_score NUMERIC` | `043_financial_complete.sql`, `045_funding_sources.sql`, `071_ml_pipeline_columns.sql`, `120_masters_track_foundation.sql` (masters track) |
| **Canonical (current, 079 onward)** | `source_attribution JSONB DEFAULT '{}'`, `raw_payload JSONB DEFAULT '{}'`, plus a table-level `canonical.verification_status` ENUM (`unverified`, `verified`, `government_verified`, `deprecated`) only on `canonical.institutions`, and a `canonical.source_tier` ENUM used only in `institution_identity_map` / `institution_sources` | `079_migration_0_0_canonical_rebuild.sql`, populated by `094`/`096`/`097`/`098`/`100`/`101`/`128`/`129` |

Every `canonical.institution_*` domain table created in `079` (admissions, financials, rankings, outcomes, programs, deadlines, demographics, campus_life) already carries `source_attribution JSONB` + `raw_payload JSONB` — but nothing enforces a shape inside that JSONB. In practice it holds at least three different shapes today:
- flat: `{"source": "manual_seed", "confidence": 0.85}`
- nested: `{"h3_financials_enrichment": {"source": "IPEDS/Scorecard", "confidence": 0.85, "raw_payload": {...}}}`
- empty: `{}`

The audit found this nesting inconsistency alone caused 6,191 well-attributed rows to be miscounted as "unknown" by a naive top-level-key check. That is the central bug this design must not repeat.

Additionally `canonical.institutions` and `canonical.institution_identity_map`/`institution_sources` already model row-level (not field-level) verification via the `verification_status` enum and `source_tier` enum + `source_priority` (1–6) — a real, working table-level mechanism that predates this design and should be reused, not replaced.

---

## 2. Core schema decision: standardized JSONB column, not new columns, not a separate table

**Decision: keep one `source_attribution JSONB` column per canonical table (already exists on all 8 domain tables), but standardize its internal shape with a fixed top-level key schema, plus add two new *scalar* columns per table for the fields that need to be indexable/queryable: `verification_status canonical.verification_status` and `last_verified_at TIMESTAMPTZ`.**

Rejected alternatives and why:

- **Per-table dedicated columns for every provenance field** (`source`, `source_url`, `source_type`, `source_date`, `confidence`, `scrape_method`, `raw_payload_reference` as 7 new columns × 8+ tables). Rejected: this is a 56+-column migration across tables that already have a working JSONB slot for exactly this purpose; it would be pure churn with no gain, and would still require backfilling the same data the JSONB already partially holds. The `120_masters_track_foundation.sql` generation already tried the scalar-column approach (`data_source`, `data_quality_score`) and it is exactly the inconsistency we are now cleaning up — repeating it in the canonical tables would recreate generation drift instead of ending it.

- **A separate `canonical.field_provenance` table keyed by `(table_name, row_id, field_name)`.** Rejected as the primary mechanism, though scoped in as an *optional future extension* (§3). A fully generic EAV-style provenance table would let every field carry independent provenance (e.g. `tuition_domestic` verified but `avg_debt` inferred, same row) — which is more correct in principle. But: (a) nothing in the audit found row-level provenance to be the actual problem — the audit's own classification worked at the row level (`source_attribution->>'source'` per financials row), not per field; (b) it multiplies write amplification for every ingestion/enrichment job (every scraper would need to write N rows instead of updating 1 JSONB blob); (c) it requires a join for every card render, working against `canonical.mv_college_cards` being a flat, fast read contract; (d) none of the 8 domain tables have mixed per-field provenance today — a whole row is typically written by one ingestion job with one source. Row-level JSONB matches the actual write pattern. If a genuine per-field need emerges later (e.g. a UI lets a user manually correct one field on an otherwise-scraped row), that single case can get a narrow `canonical.field_overrides` table rather than restructuring everything.

- **Do nothing / patch the classification query only.** Rejected as insufficient: the audit's own recommendation #1 ("fix the query to check nested keys") is necessary but not sufficient — it fixes counting, not the fact that new ingestion code can still write yet another shape tomorrow. A standardized shape with an enforced key schema (via a CHECK constraint or application-layer validator) is required so the drift stops recurring.

**Why two new scalar columns alongside the JSONB, rather than JSONB-only:** `verification_status` and `last_verified_at` are the two fields every dashboard/monitoring/re-verification-window query (see audit recommendation #4: "null on a deadline") needs to filter and index on. JSONB can be indexed with expression indexes, but a real enum + timestamptz column is simpler, self-documenting in `\d table`, and matches the precedent already set on `canonical.institutions`. Everything else (`source`, `source_url`, `source_type`, `source_date`, `confidence`, `scrape_method`, `raw_payload_reference`) stays inside `source_attribution` because it's descriptive metadata, not something queried/filtered at scale, and already has a home.

---

## 3. Standardized `source_attribution` JSONB shape

Every write to any canonical domain table's `source_attribution` column MUST conform to this shape (enforced by a `CHECK` constraint using `jsonb_matches_schema`-style key presence checks, or — more pragmatically given Postgres has no native JSON-schema validation — a plpgsql validation trigger `canonical.validate_source_attribution()` attached to all 8 tables):

```jsonc
{
  "source": "college_scorecard",              // required, string — the canonical source-system slug (see enum-ish list below)
  "source_url": "https://...",                  // nullable, string — direct URL/API endpoint if applicable
  "source_type": "government_dataset",          // required, one of canonical.source_tier values (reuse existing enum, do not invent a new one)
  "source_date": "2025-09-01",                   // nullable, date — when the source *itself* published/last-updated the value (not when we ingested it)
  "confidence": 0.85,                            // required, numeric 0.0-1.0
  "scrape_method": "college_scorecard_api_v1",   // nullable, string — script/job name or "manual_entry" / "user_form"
  "raw_payload_reference": null,                 // nullable — either inline (small payloads, reuse the sibling raw_payload column instead) or a pointer/key if payload lives elsewhere (e.g. object storage key)
  "nulled_reason": null,                         // nullable, string — ONLY set when a value was deliberately nulled (e.g. "unverified_manual_seed_placeholder"); preserves audit trail already established for the 207 manual_seed rows
  "ingested_at": "2026-06-15T00:00:00Z"           // required, timestamptz — when this row/attribution was written (distinct from source_date)
}
```

Rules:
- **Never nest a second level under a job-name key** (e.g. no more `h3_financials_enrichment: {...}`). The audit found this pattern actively breaks classification queries. If multiple enrichment passes touch the same row, the *last* pass overwrites `source_attribution` wholesale and the *previous* attribution is archived to `raw_payload.previous_attributions` (an array) rather than left as a stale nested sibling key.
- `raw_payload` (the sibling column, already present on all 8 tables) continues to hold the full original scraped/ingested record for audit replay; `source_attribution.raw_payload_reference` is only used when the payload is too large to inline or lives in external storage — for the current scrapers, leave it `null` and rely on the `raw_payload` column.
- `source` values should be drawn from a small controlled vocabulary tracked in application code (not a DB enum, to avoid a migration every time a new scraper is added): `college_scorecard`, `ipeds`, `common_data_set`, `nirf`, `cwur`, `us_news`, `hd2022`, `manual_seed` (legacy, deprecated — see §4), `manual_curation`, `user_supplied`, `masters_enrichment`, `h3_financials_enrichment` (kept as a *value* of `source`, not a nested key), etc.

---

## 4. `verification_status` enum — precise definition and assignment rules

Reuse and extend the existing `canonical.verification_status` enum (currently: `unverified`, `verified`, `government_verified`, `deprecated`) already defined in `079_migration_0_0_canonical_rebuild.sql`. The task brief calls for 8 values; map/extend as follows (adding 5 new values, keeping the 3 existing ones semantically intact so `canonical.institutions` rows already classified `verified`/`government_verified`/`deprecated` do not need remapping):

```sql
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'scraped';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'inferred';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'estimated';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'imported';
ALTER TYPE canonical.verification_status ADD VALUE IF NOT EXISTS 'user_supplied';
-- 'unverified' is renamed in spirit to 'unknown' at the application layer (Postgres enum rename
-- is possible via ALTER TYPE ... RENAME VALUE, done in the migration, see §5 step 2)
```

Final 8-value set: `verified`, `government_verified` (kept as a stronger sub-tier of verified, used only for government-dataset sources — do not collapse into `verified`, since `institution_identity_map.source_priority = 1` already keys off it), `scraped`, `inferred`, `estimated`, `imported`, `user_supplied`, `unknown`, `deprecated`. (9 values total incl. `government_verified` — brief's 8 plus this pre-existing one; documented explicitly so nobody "fixes" it away.)

### Assignment rules

| Status | Applies when | Example from the audit |
|---|---|---|
| `government_verified` | `source_attribution.source_type = 'government_dataset'` AND source is a first-party government/statutory dataset (IPEDS, NIRF, HD2022) | College Scorecard/IPEDS rows (3,492 financials rows) |
| `verified` | Source is a reputable third-party dataset with a real methodology and the row has non-empty, plausible `raw_payload`, but is not a government dataset | CWUR/US News ranking rows; the 6,191 `h3_financials_enrichment` rows (source = IPEDS/Scorecard but arriving via a derived enrichment pipeline, confidence 0.85, real `raw_payload`) — audit explicitly says "these should be treated as verified, not unknown" |
| `scraped` | Row was produced by an automated scraper hitting a live website/API with no manual curation step, and college_scorecard-sourced rows that don't meet the stricter `government_verified` bar (e.g. college-owned pages, NIRF HTML pages per `1dbdd19` commit) | `nirf` HTML scrape rows, general `scraper/` output |
| `inferred` | Value was computed/derived from other stored fields via a documented formula (not fabricated from nothing, not directly observed) | N/A today in financials (no current formula-derived money fields survive the fabrication cleanup) — reserved for future use, e.g. a genuinely-computed `net_price` derived from `cost_of_attendance - avg_financial_aid` when both inputs are themselves verified |
| `estimated` | Value is a plausible placeholder/approximation with **no traceable source**, kept temporarily pending re-verification (NOT the same as fabricated-and-presented-as-real) | The ~6,053 "empty `{}` attribution, non-null value" financials rows (audit item, `synthetic_data_inventory.md` row 7) — until re-scraped, tag `estimated`, not `unknown`, because the row does have a real-looking number that a human should look at, distinct from a truly-empty placeholder row |
| `imported` | Row came from a bulk import/seed file with identifiable provenance metadata (a named batch/file), but the import job itself did not verify accuracy against a live source | `128_seed_global_institutions.sql` / `129_seed_global_enrichment.sql` batch-seeded rows that are not already `verified` per that migration's own tagging |
| `user_supplied` | Value was entered directly by an end user (e.g. a student manually correcting their target college's tuition) | Not yet in use — reserved for future user-correction feature |
| `unknown` | `source_attribution = '{}'` (truly empty) AND all domain-specific fields on the row are NULL (long-tail placeholder rows never enriched) | The majority of the 6,068 empty-attribution rows where audit spot-check found all financial fields NULL (e.g. "Tri-Community Adult Education," trade schools) |
| `deprecated` | Row/value was deliberately nulled or superseded and should not be surfaced, with the reason recorded in `source_attribution.nulled_reason` | **The 207 already-nulled `manual_seed` rows** — audit brief's own example. These must NOT be `unknown`; they carry a clear, recorded reason (`nulled_reason = "unverified_manual_seed_placeholder"`) and should read as `deprecated` so future queries can distinguish "we know this was bad and removed it" from "we never had any information." Also applies to the losing row in any deduplication (§5 step 4) — archived, not deleted, tagged `deprecated`. |

**Critical distinction the rules encode:** `unknown` = no signal at all (empty attribution + null values). `estimated` = a real-looking number sitting on an empty-attribution row (signal exists, but untrusted — needs re-verification, not deletion). `deprecated` = we had signal, decided it was wrong/fabricated, and explicitly retired it. Conflating these three was the root cause of the original crisis (round-number placeholders shown with a false `confidence: 0.85` looked identical to real verified data) — this table exists specifically so that never recurs.

---

## 5. Migration plan (numbers 130+; current highest is `129_seed_global_enrichment.sql`)

Proposed as a plan only — not implemented in this task.

1. **`130_standardize_provenance_schema.sql`**
   - Extend `canonical.verification_status` enum with the 5 new values (§4). Postgres requires `ALTER TYPE ... ADD VALUE` calls to run outside an explicit transaction block that also uses the new value in the same transaction, so this migration only adds enum values and does nothing else.
   - Add `verification_status canonical.verification_status NOT NULL DEFAULT 'unknown'` and `last_verified_at TIMESTAMPTZ` columns to every canonical domain table that doesn't already have them: `institution_admissions`, `institution_financials`, `institution_rankings`, `institution_outcomes`, `institution_programs`, `institution_deadlines`, `institution_demographics`, `institution_campus_life`. (`canonical.institutions` already has `verification_status`; only needs `last_verified_at` added if absent — confirm at implementation time.)
   - Add a `canonical.validate_source_attribution(jsonb) RETURNS boolean` function encoding the required-key rules from §3, plus a `CHECK (canonical.validate_source_attribution(source_attribution))` constraint on each table (added as `NOT VALID` initially so it doesn't block on legacy rows, validated separately in step 3).

2. **`131_classify_existing_provenance.sql`** — read-only classification pass, no data mutation of values, only sets the new `verification_status`/`last_verified_at` columns based on **existing** metadata, per the rules in §4, applied without guessing:
   - `government_verified`: `source_attribution->>'source' IN ('college_scorecard','ipeds','hd2022')` OR nested `source_attribution->'h3_financials_enrichment'->>'source' IN ('IPEDS/Scorecard', ...)` (fixes the audit's flagged nested-key blind spot).
   - `verified`: nested-key `h3_financials_enrichment`-style rows with confidence >= 0.7 and non-empty `raw_payload`, not already caught above; also rows from `128`/`129` seed migrations explicitly tagged `verified` at seed time.
   - `deprecated`: `source_attribution ? 'nulled_reason'` (catches the 207 manual_seed rows and any future deliberately-nulled row) — this rule runs *first*, before the `unknown` bucket, so a nulled row is never miscategorized as unknown.
   - `estimated`: `source_attribution = '{}'` AND at least one domain-specific value column on the row is NOT NULL.
   - `unknown`: everything else — specifically `source_attribution = '{}'` AND all domain-specific value columns are NULL. This is the explicit "if it doesn't clearly map, it's unknown, not an optimistic guess" bucket the task brief requires.
   - `last_verified_at` backfilled from `source_attribution->>'last_verified_at'` where present (already written by `094`/`096`/`097`/`098`/`100`/`101`), else left NULL.
   - Expected rough distribution against the audit's numbers (institution_financials, 15,958 rows): `government_verified` ≈ 3,492 (college_scorecard) + subset of the 6,191 nested rows now correctly matched; `verified` ≈ remainder of the 6,191; `deprecated` = 207 (manual_seed); `unknown` ≈ non-null-value-free subset of the 6,068 empty-attribution rows; `estimated` ≈ the ~6,053 empty-attribution-but-non-null-value subset the audit flagged as needing isolation in "the next audit iteration" — this migration's query is exactly that isolation query.

3. **`132_dedup_financials_rows.sql`** — implements the audit's dedup recommendation: for each `(institution_id, data_year)` group with >1 row in `institution_financials`, keep the row with non-empty `source_attribution` and latest `updated_at`; the losing row(s) get `verification_status = 'deprecated'`, `source_attribution.nulled_reason = 'superseded_duplicate'`, and are moved to a new `canonical.institution_financials_dedup_audit` table (archived, not deleted) rather than dropped, matching "not auto-deleted" from the audit.

4. **`133_validate_provenance_constraint.sql`** — after 131/132 have normalized existing rows into valid shapes, run `ALTER TABLE ... VALIDATE CONSTRAINT` for the `NOT VALID` checks added in 130, making the schema enforcement live for all future writes.

Each migration is idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`) per the codebase's existing convention, and none of them touch `backend/db/migrations/` (orphan path) or `backend/archive/`.

---

## 6. Frontend / API surfacing

Goal: a small, consistent trust signal per data point — not a full audit trail on every field.

- **API contract addition:** any endpoint/view built on top of the 8 canonical domain tables (and `canonical.mv_college_cards`, once it's regenerated to include the new columns) adds two lightweight fields per data-bearing group, not per individual number: `_provenance: { status: "verified" | "scraped" | ... , source: string, last_verified_at: string | null }`. This mirrors the existing pattern where `mv_college_cards` already groups fields by domain (admissions, financials, etc.) — one provenance object per domain block on the card, not 50 per-field objects.
- **Card/list surface:** a small badge/icon next to each stat block (e.g. next to "Cost of Attendance: $58,000") — a colored dot or shield icon with 3 visual tiers only: green (`verified`/`government_verified`), yellow (`scraped`/`imported`/`inferred`/`user_supplied`), and a muted/dashed treatment for `estimated`/`unknown` (shown as "data pending verification" rather than a bare number when `estimated`, since the audit explicitly says these are "plausible but unverifiable"). `deprecated` values are never rendered at all (already the current behavior — nulled).
- **Detail/tooltip:** hovering or tapping the badge reveals `source` (human-readable, e.g. "U.S. Dept. of Education College Scorecard") and `last_verified_at` (relative date, e.g. "Verified 3 months ago"). Full `source_attribution`/`raw_payload` JSON is never shown to end users — it remains an internal/admin-only surface (e.g. an internal QA tool), consistent with "keep it usable, not overwhelming."
- **Enforcement:** extend `backend/src/utils/schemaContractChecker.js` (already gates `mv_college_cards` fields per CLAUDE.md) to also assert the new `verification_status`/`last_verified_at` columns exist and are non-null on any table it checks, so the standardization can't silently regress the way the pre-existing JSONB shape drifted.

---

## 7. Summary

| Question | Answer |
|---|---|
| Columns vs JSONB vs separate table? | Keep existing per-table `source_attribution JSONB`, standardize its shape; add 2 scalar columns (`verification_status`, `last_verified_at`) per table for queryability. No EAV/separate provenance table for the primary case. |
| Why not a bigger migration? | 8 canonical tables already carry a JSONB slot built for this; the problem is inconsistent *shape* and lack of enum/query-ability, not absence of a column. |
| Enum values | `verified`, `government_verified`, `scraped`, `inferred`, `estimated`, `imported`, `user_supplied`, `unknown`, `deprecated` (9, extending existing 4-value enum). |
| Manual_seed nulled rows | `deprecated`, not `unknown` — reason preserved in `source_attribution.nulled_reason`. |
| Empty-attribution rows with real values | `estimated`, not `unknown` — distinguishes "unverified but present" from "no signal." |
| Migration numbers | `130`–`133`, following `129_seed_global_enrichment.sql`. |
