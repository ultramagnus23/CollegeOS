# REQUIREMENT_COVERAGE_REPORT.md

_Verified against `canonical.institution_requirements` on 2026-06-22._

## Coverage

| Metric | Value |
|---|---|
| Rows | **8** |
| Distinct institutions | **8** of 8,244 (**0.1%**) |
| Source | `curated_seed` (MIT, Harvard, etc.) — not scraped live |

The table schema is rich and well-designed (SAT/ACT policy, TOEFL/IELTS/Duolingo, essays, supplemental essay count, transcripts, recommendations, interviews, portfolio, platform support, financial/visa docs). The **schema is ready; the data is essentially absent.**

## Field breakdown (over the 8 seeded rows)

| Field | Populated |
|---|---:|
| `sat_policy` | 8/8 |
| `toefl_required` | 8/8 |
| `ielts_required` | 8/8 |
| `essays_required` | 8/8 |
| `transcript_required` | 8/8 |
| `teacher_recommendations_required` | 8/8 |
| `duolingo_required` | 0/8 |
| `interview_required` | 1/8 |

## Gap

A real student gets requirements for **8 colleges**. For the other 8,236 the Requirements page is empty. This is the second-biggest data gap after deadlines.

## Fill plan

- Build a **requirements adapter** on the working canonical scraper framework (`scraperFramework.js` + `idempotentUpsert`, success-gated), same live-fetch-and-verify pattern as `usOfficialDeadlines.js`: read SAT/ACT policy, English-test requirements, essay/rec/transcript requirements straight from each university's official admissions/requirements page; store `source_url` + `confidence_score`; skip (don't fabricate) pages that don't parse.
- The one live scraper that targeted this table (`scrapers/run_deadline_refresh.py`) is **broken** (expects nonexistent `requirement_category`/`requirement_name` columns) — do not revive it; extend the canonical framework instead.
- Store each field as required / optional / waived per the existing boolean+policy columns.

## Status: NOT YET BUILT

No working live requirements scraper exists today. The 8 rows are a manual seed. This is a primary candidate for the next data-coverage build.
