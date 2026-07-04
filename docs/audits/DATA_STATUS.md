# DATA_STATUS.md

_Verified against live Supabase DB on 2026-06-22. All counts are real query results._

## Canonical table row counts

| Table | Rows | Assessment |
|---|---:|---|
| `canonical.institutions` | 8,244 | OK (broad) |
| `canonical.institution_programs` | 43,613 | OK (~5,024 institutions covered; avg ~8.7 each; only 21 with ≥30) |
| `canonical.institution_rankings` | 335 | SPARSE (QS + NIRF only) |
| `canonical.institution_deadlines` | 4 | **NEAR-EMPTY** (MIT, Notre Dame only) |
| `canonical.institution_requirements` | 8 | **NEAR-EMPTY** (curated seed) |
| `college_admissions_stats` | 5,359 | partial coverage (see below) |
| `scholarships` | 56 | SPARSE |

## Admissions-stat field coverage (`college_admissions_stats`, 5,359 rows)

| Field | Non-null | Coverage |
|---|---:|---|
| `acceptance_rate` | 1,637 | 31% |
| `median_sat` | 809 | 15% |
| `median_act` | 826 | 15% |
| `median_gpa_admitted` | **0** | **0%** |

> Consequence: only ~800 colleges have both acceptance rate + SAT, which is the set the chancing model and major-aware search can fully use. `median_gpa_admitted` being entirely empty is why the chancing model uses a simulated GPA prior.

## Application / user tables

| Table | Rows | Note |
|---|---:|---|
| `users` | 148 | real usage |
| `student_profiles` | 124 | real usage |
| `applications` | 12 | real |
| `application_tasks` | 60 | active task system |
| `tasks` | **0** | **DUPLICATE/orphan** task table — empty; `application_tasks` is the live one |
| `timeline_actions` | **0** | timeline not auto-populated on college add (Phase 1 gap) |

## ML label tables — all empty (no real training data)

| Table | Rows |
|---|---:|
| `ml_training_data` | 0 |
| `prediction_logs` | 0 |
| `admission_outcomes` | 0 |

Outcome **capture** is now fixed (PR #140), so these can begin accumulating; none have yet.

## Legacy / duplicate tables (drift)

| Table | Rows | Issue |
|---|---:|---|
| `colleges` | 5,333 | legacy table, parallel to `canonical.institutions`; still written by `seedColleges`, read by some chancing code |
| `colleges_comprehensive` | — | legacy target of `scraper/pipeline.py`; not read by the canonical frontend contract |

## Biggest data gaps (priority order)

1. **Deadlines** (4 rows) — blocks the core "when to apply" use case.
2. **Requirements** (8 rows) — blocks "what's needed to apply."
3. **Real ML labels** (0) — blocks a validated chancing model.
4. **Admissions stats** (GPA 0%, AR 31%) — limits chancing/search to ~800 colleges.
5. **Rankings** (QS+NIRF only) — limits discovery breadth (commercial sources gated by policy).
