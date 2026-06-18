# Production Readiness Audit — 2026-06-18

Row counts below are from a **live read-only query** against the production Supabase
DB (2026-06-18T10:07Z), which supersedes `supabase_dump.sql` — that dump (captured
14:08) predates the `094–102` backfills and is stale. Nothing here is estimated or
fabricated. Repo at branch `docs/repo-audit-and-tasks`.

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

## Dataset audit — LIVE canonical row counts

Verified by a read-only query against the live Supabase DB
(`aws-1-ap-northeast-2.pooler.supabase.com`, server time 2026-06-18T10:07Z).
The `supabase_dump.sql` snapshot is **stale** — it began at 14:08:41, ~20 min
before migrations `094–102` were authored (14:25–14:33). The backfills HAVE since
been applied (all 9 present in the live `migrations` table).

| Table | Dump (stale) | **Live** | Status |
|-------|------|------|--------|
| `institutions` | 8,236 | **8,236** | ✅ exceeds 5,000 target |
| `institution_admissions` | 6,236 | **6,236** | ~76% |
| `institution_financials` | 6,236 | **6,236** | ~76% |
| `institution_outcomes` | 6,061 | **6,061** | ~74% |
| `institution_programs` | 0 | **43,613** | ✅ backfilled (094) |
| `institution_demographics` | 0 | **6,232** | ✅ backfilled (097) |
| `institution_campus_life` | 0 | **8,236** | ✅ backfilled (098) |
| `institution_completeness` | 8,236 | **8,236** | row per institution |
| `mv_college_cards` | n/a | **8,236** | ✅ refreshed (099) |
| `institution_rankings` | 0 | **335** | ⚠️ only 329 insts ranked |
| `institution_deadlines` | 0 | **0** | ❌ needs scrapers |
| `institution_requirements` | 0 | **0** | ❌ needs scrapers |
| `institution_quality_scores` | 0 | **0** | ❌ never populated |

Detail pages now **load** (no crash) and render programs / demographics / campus-life
for most colleges. Three real gaps remain (below).

## Coverage / quality reality (live)

- **Programs:** 5,024 / 8,236 institutions have ≥1 program. Distribution: **3,212
  have ZERO**, 2,944 have 1–9, 2,059 have 10–29, and only **21 meet the "30+ majors"
  target**. The 094 backfill is IPEDS-only, so non-US institutions mostly have none.
- **Rankings:** only **329 institutions ranked** (QS 304 + NIRF 31) vs the 5,000+
  target. `mv_college_cards.global_rank` is non-null for just **298** rows. The
  legacy source (`public.college_rankings`) only had 748 rows — QS + NIRF — so US
  News / THE / Niche / CWUR are simply absent and need ingestion.
- **Completeness:** average `overall_score` = **33.2%**; only **104** institutions
  ≥80%, **6,078** below 50%. "No incomplete cards" is far from met — most cards are
  thin because deadlines/requirements/quality are empty and rankings/programs are sparse.
- **Quality engine:** `102` is applied but only *defines* `fn_data_quality_issues()`,
  `v_data_quality_summary`, and `fn_snapshot_data_quality()` — it never invokes them.
  `data_quality_snapshots` = 0 and `institution_quality_scores` = 0. Run
  `SELECT canonical.fn_snapshot_data_quality();` to take the first snapshot;
  `institution_quality_scores` needs a separate populator (it is not written by 102).

## Still requires scrapers (no legacy source exists)

- `institution_deadlines` (0) — no backfill migration; deadline scrapers.
- `institution_requirements` (0) — no backfill migration; requirements scrapers.
  This is the hard blocker for the P2 add-college pipeline's non-fallback mode and
  for per-institution essay/document required-flags.

Both are gated behind the GitHub Actions approval issue (see CLAUDE.md: workflows
stuck in `action_required` — a repo/org Settings approval gate, not a code/YAML fix).

## Not started (large features, out of scope for a single safe session)

P1 dashboard refactor, P2 add-college pipeline, essays/documents auto-creation,
career prediction model, scholarship linking. These are real build work that should
land as separate, individually verifiable PRs — see the session report.
