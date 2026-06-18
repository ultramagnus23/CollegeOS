# Production Readiness Audit — 2026-06-18

Verified against `supabase_dump.sql` (pg_dump, captured 2026-06-18 14:08) and the
repo at branch `docs/repo-audit-and-tasks`. All numbers below are counted directly
from the dump's `COPY` blocks — none are estimated or fabricated.

## P0 — Fixed this session

**`ReferenceError: COLLEGE_DETAIL_SECTION_COLUMNS is not defined`** crashed every
college detail page (`Failed to load college`).

- Root cause: commit `28a3e43` replaced `src/contracts/collegeContracts.ts` with a
  thin re-export shim and dropped `COLLEGE_DETAIL_SECTION_COLUMNS` +
  `CollegeDetailSection`, but `src/lib/collegeService.ts` still referenced both.
- Fix: restored the constant + type in `collegeContracts.ts`, re-validating every
  column list against the **current** canonical schema. The original lists were
  stale — `institution_requirements`, `institution_completeness`, and
  `institution_quality_scores` were redesigned since, so columns like
  `requirement_category`, `section_scores`, and `confidence_penalty` no longer
  exist and would have caused PostgREST 400s.
- Also removed a runtime-orphaned `src/utils/safePerformance.ts` twin that tripped
  the duplicate-module guard in `npm run runtime-check`.
- Gates: `npm run typecheck` clean, `npm run lint` 0 errors, `npm run runtime-check` pass.

## Dataset audit — canonical layer row counts (live dump)

| Table | Rows | Status |
|-------|------|--------|
| `canonical.institutions` | **8,236** | ✅ exceeds 5,000 target |
| `canonical.institution_admissions` | 6,236 | ~76% coverage |
| `canonical.institution_financials` | 6,236 | ~76% coverage |
| `canonical.institution_outcomes` | 6,061 | ~74% coverage |
| `canonical.institution_completeness` | 8,236 | row per institution |
| `canonical.institution_programs` | **0** | ❌ empty (majors source) |
| `canonical.institution_rankings` | **0** | ❌ empty |
| `canonical.institution_demographics` | **0** | ❌ empty |
| `canonical.institution_campus_life` | **0** | ❌ empty |
| `canonical.institution_deadlines` | **0** | ❌ empty |
| `canonical.institution_requirements` | **0** | ❌ empty |
| `canonical.institution_quality_scores` | **0** | ❌ empty |

> ⚠️ **These counts are from a snapshot that predates the backfills — they do NOT
> describe current production.** The dump began at **14:08:41**; migrations `094–102`
> were authored at **14:25–14:33** and the "applied to production" tracker note was
> committed at **14:59** (`46328c8`, which only edits one line of `TASKS.md` and is
> *not* evidence the SQL ran). So the dump cannot confirm whether production is still
> empty. **Confirm with a live read-only count before acting** (see below).

Detail pages now **load** (no crash). Whether the rankings / programs / deadlines /
requirements / demographics / campus-life sections show data depends on the *current*
live state, which this pre-migration dump cannot tell us.

## Confirm current state, then (if needed) backfill — no scraping

The dump was captured at 14:08; backfill migrations `094–102` were authored at
14:25–14:33 (same day, **after** the dump). As of the dump the live `migrations`
table topped out at `090_colleges_full_view.sql` and the canonical detail tables
were empty — but that snapshot is stale. Verify the **live** DB first:

```sql
-- read-only, run against the live DB
SELECT 'programs' t, count(*) FROM canonical.institution_programs
UNION ALL SELECT 'rankings', count(*) FROM canonical.institution_rankings
UNION ALL SELECT 'demographics', count(*) FROM canonical.institution_demographics;
SELECT filename FROM migrations WHERE filename ~ '^(09[4-9]|10[0-2])_' ORDER BY 1;
```

If those tables are still empty / `094–102` are absent from `migrations`, run the
backfill. The source data already exists in the legacy `public.*` schema:

The source data already exists in the legacy `public.*` schema:

- `public.college_majors` — **184,800** IPEDS program-completion rows → `094` backfills `institution_programs`
- `public.college_rankings` — **748** rows (QS 628, NIRF 120) → `096` backfills `institution_rankings`
- `public.colleges_comprehensive` — 8,330 rows; `canonical.institution_identity_map` — 8,329 (the id bridge)

**Unblock (one operational step, no scraping, no fabrication):**

```bash
cd backend && npm run migrate   # applies un-applied files incl. 094–102, in order
```

The driver only runs files not already in the `migrations` table, and the migrations
are idempotent (`ON CONFLICT DO NOTHING`), so this is safe to run **even if they were
already applied** — it is a no-op in that case.

- `094` programs ← IPEDS (`college_majors`)
- `095` major ontology
- `096` rankings ← QS/NIRF (`college_rankings`)
- `097` demographics, `098` campus_life
- `099` recompute all 8 completeness domains + `REFRESH MATERIALIZED VIEW canonical.mv_college_cards`
- `100` outcomes enrich, `101` financials enrich (from legacy)
- `102` data-quality engine (`canonical.data_quality_snapshots`)

Migrations are idempotent (`ON CONFLICT DO NOTHING`, `CREATE … IF NOT EXISTS`) and
additive (no deletes/overwrites). The driver (`backend/src/config/database.js`)
applies only un-executed files, in sorted order.

## Still requires scrapers (no legacy source in this dump)

- `institution_deadlines` — no backfill migration; populated by the deadline scrapers.
- `institution_requirements` — no backfill migration; populated by the requirements scrapers.

Both are gated behind the GitHub Actions approval issue (see CLAUDE.md: workflows
stuck in `action_required` — a repo/org Settings approval gate, not a code/YAML fix).

## Not started (large features, out of scope for a single safe session)

P1 dashboard refactor, P2 add-college pipeline, essays/documents auto-creation,
career prediction model, scholarship linking. These are real build work that should
land as separate, individually verifiable PRs — see the session report.
