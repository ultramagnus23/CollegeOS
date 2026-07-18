# audit/02_database.md — Database Audit (READ-ONLY)

Connection: live pooler (`aws-1-ap-northeast-2.pooler.supabase.com:6543`, Postgres 17.6), service role. All numbers from `psql` against the live DB.

## 0. Premise correction
Prompt said "~179 tables, target <50." Actual user-table count (`pg_class ... group by schema`):

| schema | tables | note |
|---|---|---|
| `public` | **74** | legacy data model + live app tables, mixed |
| `canonical` | **49** | intended data model (frontend read contract) |
| auth / storage / realtime / vault / supabase_migrations | 35 | Supabase-managed system schemas — **out of scope** |

**Total app tables = 123, not ~179.** The real problem is not raw count — it's that **the app runs on two parallel data models simultaneously** (`public.college*` legacy + `canonical.institution*`). See §3.

## 1. Inventory highlights (largest by size)
Command: `pg_total_relation_size` over `public`+`canonical`. Full data in `audit/table_disposition.md`.

- Largest canonical: `institutions` 129MB/9,848 rows · `institution_programs` 83MB/100k · `institution_embeddings` 69MB/7,712 (cosine-similarity vectors stored as data — **no pgvector**, matches constraint) · `institution_financials` 31MB.
- Largest public (legacy): `college_majors` 35MB but **0 live rows** (184,800 est, all dead tuples) · `colleges_comprehensive` 27MB/8,330 · `colleges` 9MB/5,336 · `colleges_legacy` 5MB/6,207 · `college_programs` 4.7MB/19,049 (0 live).

**49 of 123 tables are completely empty (0 rows)** — 18 in canonical (forward-declared scaffolding), 31 in public. Command: `select count(*)` per table with reltuples=-1.

## 2. Code cross-reference
Command per table: `rg -c -g '!backend/migrations/**' -g '!*.sql' '\b<name>\b' src backend/src scraper ml scripts`.

**21 tables have zero code references.** ⚠️ Caveat (prompt warned re: dynamic names): some zero-ref tables hold real data and are consumed by **in-DB RPCs/views, not JS** — notably `canonical.institution_search_index` (8,236 rows, used by the search RPC), `canonical.institution_aliases` (18,633 rows), `career_outcomes_detail` (8,330). These are **INVESTIGATE, not drop**. The genuinely-safe zero-ref set is the `*_merge_archive` and empty scaffolding tables.

Bare-name matching also **over-counts** common words (`deadlines` 603, `applications` 312, `essays` 178, `tasks` 224 include variable/identifier matches). Ref counts are directional, not literal query-site counts.

## 3. Overlap detection — the core sprawl
Two generations of the college data model coexist:

| Legacy (`public`) | Canonical (`canonical`) | Status |
|---|---|---|
| `colleges` (5,336), `colleges_comprehensive` (8,330), `colleges_legacy` (6,207, 0 refs) | `institutions` (9,848) | **3 legacy variants** for one concept |
| `college_admissions` (6,327), `college_admissions_stats` (5,359) | `institution_admissions` (8,280) | duplicated |
| `college_majors` (0 live), `college_programs` (0 live) | `institution_programs` (100,149) | legacy dead, canonical live |
| `college_financial_data`, `college_financial_aid`, `cost_of_attendance` | `institution_financials` (11,913) | duplicated |
| `academic_outcomes` (0 refs), `career_outcomes_detail` (0 refs) | `institution_outcomes` (12,251) | duplicated |
| `college_rankings` | `institution_rankings` (4,720) | duplicated |
| `deadlines` / `college_deadlines` / `application_deadlines` / `deadline_history` (public) | `institution_deadlines` (308) | duplicated |

**⚠️ Blocker for consolidation:** `public.colleges` is **still queried at runtime** — `rg "FROM colleges"` finds live call sites in `backend/src/models/College.js`, `models/Application.js`, `routes/deadlines.js`, `routes/signals.js`, `services/mlService.js`, `jobs/deadlineScrapingScheduler.js`, `services/collegeDeadlineIntelligenceService.js`. The frontend read-path uses `canonical.mv_college_cards` (`src/lib/collegeService.ts`), but the **backend still runs on `public.colleges`**. Therefore `public.college*` **cannot be archived until these backend consumers are migrated to `canonical`.** That is a code-migration project (Phase 6), not a `set schema archive` one-liner. This is the single biggest reason the table count is high.

## 4. Data quality (canonical core)

**Deadline coverage** (`institution_deadlines.institution_id → institutions.id`, country=`country_code`):
- **Overall: 262 / 9,848 institutions = 2.7% have any deadline.** Confirms the "sparse deadlines" premise emphatically.
- By country: GB 29/197 (14.7%), IN 40/510 (7.8%), AU 6.8%, CA 5.3%, JP 3.4%, US **131/6,509 (2.0%)**, DE 2.1%, FR 0.9%, IE 0/73 (0%).
- `institution_deadlines` = 308 rows / 262 distinct institutions (slightly below CLAUDE.md's claimed 362/262 — re-verify; possible recent change or MV lag).

**Requirements coverage:** `institution_requirements` = 216 rows / ~216 institutions (2.2% of 9,848).

**Duplicate institutions:** normalized `canonical_name`+`country_code` grouping → **397 duplicate groups, 397 extra rows.** Caveat: some are legitimately distinct campuses sharing a name; needs manual triage against `institution_identity_map` before any merge. (CLAUDE.md reports a prior 124-row dedup; these 397 are under a looser normalization and overlap unknown.)

## 5. RLS & exposure
Commands: `pg_tables.rowsecurity`, `pg_policies`.
- **`public`: 29 / 74 tables have RLS DISABLED.** Many are empty legacy/scaffolding tables, but live ones should be reviewed (esp. any holding user data).
- **`public.chancing_audit_log`: RLS ENABLED but ZERO policies** → silently blocks the anon client entirely. Either add a policy or disable RLS intentionally.
- `canonical`: 34/49 RLS-disabled, 15 enabled. Canonical is read through the backend service role + MV, so RLS-off there is lower-risk, but should be a deliberate documented choice.

## 6. Disposition summary
Full matrix in `audit/table_disposition.md`. Rough tallies:
- **KEEP:** ~30 canonical core + ~20 live public app tables ≈ **50 tables.**
- **ARCHIVE (empty scaffolding + merge_archive):** ~40 tables, near-zero bytes.
- **MERGE (legacy public.college* → canonical):** ~16 tables — **gated on backend code migration.**
- **INVESTIGATE:** ~10 (zero-ref-but-populated, RPC-consumed).

The <50 KEEP target is **reachable** — but only after (a) archiving the ~40 empty tables (trivial, reversible) and (b) migrating backend readers off `public.college*` so the ~16 legacy tables can be merged/archived (non-trivial code work).
