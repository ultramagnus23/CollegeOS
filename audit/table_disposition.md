# audit/table_disposition.md — Disposition Matrix (123 app tables)

Columns: table · exact rows (`select count(*)`) · size (`pg_total_relation_size`) · code refs (`rg -c '\b<name>\b' src backend/src scraper ml scripts`, excl. migrations/sql) · verdict · justification.

Verdicts: **KEEP** · **MERGE INTO x** · **ARCHIVE** (move to `archive` schema, empty/dead) · **INVESTIGATE** (populated but 0 JS refs → likely RPC/view consumed, confirm before touching).

> Ref counts are directional: bare-name `rg` over-counts common words (`deadlines`, `applications`, `essays`, `tasks`). Treat as "referenced somewhere" not literal query-site count.

## canonical.* (49)

### KEEP — populated core (frontend read contract + rec pipeline)
| table | rows | size | refs | verdict | why |
|---|--:|--:|--:|---|---|
| institutions | 9,848 | 129 MB | 268 | KEEP | Root entity; `mv_college_cards` source |
| institution_programs | 100,149 | 83 MB | 47 | KEEP | Programs/majors |
| institution_embeddings | 7,712 | 69 MB | 7 | KEEP | Cosine-similarity vectors (no pgvector — in-app) |
| institution_identity_map | 8,329 | 33 MB | 27 | KEEP | Cross-source ID resolution |
| institution_financials | 11,913 | 31 MB | 32 | KEEP | Cost/aid |
| institution_outcomes | 12,251 | 20 MB | 27 | KEEP | Earnings/completion |
| institution_campus_life | 8,236 | 20 MB | 9 | KEEP | Card section |
| institution_admissions | 8,280 | 16 MB | 58 | KEEP | Acceptance/GPA/test |
| institution_quality_scores | 8,500 | 8 MB | 5 | KEEP | Ranking/quality |
| institution_demographics | 11,428 | 7 MB | 4 | KEEP | Card section |
| institution_completeness | 8,500 | 6.5 MB | 3 | KEEP | Data-coverage scoring |
| institution_rankings | 4,720 | 3.6 MB | 30 | KEEP | Rankings |
| popularity_index | 8,236 | 1.2 MB | 3 | KEEP | Sort/discovery |
| masters_programs | 510 | 1.1 MB | 34 | KEEP | Masters track |
| institution_deadlines | 308 | 456 kB | 15 | KEEP | Deadlines (sparse — §4 blockers) |
| institution_requirements | 216 | 368 kB | 7 | KEEP | Requirements |
| institution_placements | 161 | 136 kB | 4 | KEEP | Placement outcomes |
| recommendation_sessions | 377 | 328 kB | 4 | KEEP | Rec telemetry |
| user_recommendation_events | 376 | 320 kB | 9 | KEEP | Rec telemetry |
| masters_program_pathways | 6 | 64 kB | 12 | KEEP | Masters track |
| masters_scrape_log | 10 | 80 kB | 2 | KEEP | Scraper log |
| major_ontology | 37 | 96 kB | 1 | KEEP | Major taxonomy |

### INVESTIGATE — populated, 0 JS refs (RPC/view-consumed or recent seed)
| table | rows | size | refs | verdict | why |
|---|--:|--:|--:|---|---|
| institution_search_index | 8,236 | 26 MB | 0 | INVESTIGATE | Consumed by search RPC, not JS — confirm before touching |
| institution_aliases | 18,633 | 11 MB | 0 | INVESTIGATE | Name-matching; likely RPC/identity use |
| data_quality_snapshots | 45 | 48 kB | 0 | INVESTIGATE | Telemetry; confirm writer |
| india_admissions_profile | 7 | 64 kB | 0 | INVESTIGATE | Recent regional seed |

### ARCHIVE — merge leftovers (0 refs, dedup residue)
| institution_financials_merge_archive | 5,943 | 2 MB | 0 | ARCHIVE | Already an archive of a past merge |
| institution_merge_history | 348 | 256 kB | 0 | ARCHIVE | Merge audit trail → archive schema |
| institution_rankings_merge_archive | 253 | 144 kB | 0 | ARCHIVE | Merge residue |
| institution_admissions_merge_archive | 42 | 72 kB | 0 | ARCHIVE | Merge residue |
| institution_completeness_merge_archive | 42 | 48 kB | 0 | ARCHIVE | Merge residue |

### ARCHIVE / INVESTIGATE — empty scaffolding (0 rows)
- **ARCHIVE (unused, no writer found):** `eu_admissions_profile`, `uk_admissions_profile`, `us_admissions_profile`, `uk_financial_support`, `us_financial_aid`, `india_financial_aid`, `stg_institution_candidates`, `stg_institution_matches`, `source_reliability`, `institution_source_registry`, `experiment_assignments`. (all 0 rows / ≤1 ref)
- **INVESTIGATE (part of in-progress verticals — masters/rec loop/history):** `masters_pathways`, `masters_program_deadlines`, `masters_admission_datapoints`, `recommendation_feedback`, `requirement_history`, `deadline_history`, `retrieval_eval_history`. (0 rows; keep if the owning feature is active)

## public.* (74)

### KEEP — live app / user-data tables
| table | rows | size | refs | why |
|---|--:|--:|--:|---|
| users | 433 | 488 kB | 90 | Auth/users |
| student_profiles | 389 | 616 kB | 82 | Onboarding profile |
| applications | 12 | 112 kB | 312 | App tracker |
| application_tasks | 42 | 48 kB | 8 | App tracker |
| tasks | 50 | 160 kB | 224 | Task engine |
| timeline_actions | 80 | 128 kB | 4 | Timeline |
| documents | 30 | 112 kB | 174 | Uploads |
| essays | 0 | 40 kB | 178 | Live feature, no user data yet — **not dead** |
| notifications | 0 | 48 kB | 59 | Live feature, no data yet |
| scholarships | 108 | 528 kB | 367 | Scholarships |
| grants | 64 | 168 kB | 58 | Aid |
| government_loans | 31 | 112 kB | 5 | Aid |
| private_loans | 28 | 112 kB | 8 | Aid |
| financing_options | 16 | 152 kB | 9 | Aid |
| currency_rates | 19 | 112 kB | 14 | FX |
| recommenders | 1 | 48 kB | 81 | Recommenders |
| refresh_tokens | 637 | 1.2 MB | 4 | Auth sessions |
| chancing_audit_log | 9,708 | 1.4 MB | 3 | Chancing audit — **fix RLS (enabled, 0 policies)** |
| user_signals | 6 | 56 kB | 4 | Signals |
| scraper_run_logs | 16 | 80 kB | 23 | Pipeline log |
| migrations | 122 | 80 kB | 19 | Migration ledger (system) |
| masters_applications | 1 | 80 kB | 6 | Masters track |
| masters_application_documents | 1 | 48 kB | 4 | Masters track |
| masters_application_recommenders | 1 | 80 kB | 4 | Masters track |
| masters_profile | 3 | 64 kB | 8 | Masters track |
| majors | 37 | 184 kB | 124 | Lookup (confirm vs canonical.major_ontology → possible MERGE) |
| deadlines | 42 | 112 kB | 603 | INVESTIGATE: user/app deadlines vs canonical.institution_deadlines |

### MERGE INTO canonical — legacy college data model (⚠️ gated on backend code migration)
Backend still reads `public.colleges` at runtime (`College.js`, `Application.js`, `deadlines.js`, `signals.js`, `mlService.js`, `deadlineScrapingScheduler.js`). **Migrate readers to `canonical` FIRST, then merge/archive.**
| table | rows | size | refs | target |
|---|--:|--:|--:|---|
| colleges | 5,336 | 9 MB | 582 | canonical.institutions |
| colleges_comprehensive | 8,330 | 27 MB | 52 | canonical.institutions |
| college_admissions | 6,327 | 5 MB | 24 | canonical.institution_admissions |
| college_financial_data | 6,327 | 4.3 MB | 3 | canonical.institution_financials |
| college_financial_aid | 6,000 | 1.2 MB | 2 | canonical.institution_financials |
| cost_of_attendance | 6,317 | 2 MB | 50 | canonical.institution_financials |
| academic_details | 6,327 | 2.4 MB | 6 | canonical.institution_admissions |
| campus_life | 8,552 | 2.4 MB | 18 | canonical.institution_campus_life |
| student_demographics | 6,323 | 2 MB | 4 | canonical.institution_demographics |
| college_rankings | 688 | 144 kB | 2 | canonical.institution_rankings |
| college_admissions_stats | 5,359 | 928 kB | 2 | canonical.institution_admissions |

### ARCHIVE — legacy dead (0 live rows or 0 refs)
| colleges_legacy | 6,207 | 5 MB | 0 | ARCHIVE (explicit legacy, no refs) |
| college_majors | 0 live (184,800 dead) | 35 MB | 21 | ARCHIVE (all dead tuples; superseded by institution_programs) |
| college_programs | 0 live (19,049 dead) | 4.7 MB | 9 | ARCHIVE |
| academic_outcomes | 6,000 | 784 kB | 0 | ARCHIVE (0 refs; superseded by institution_outcomes) |
| career_outcomes_detail | 8,330 | 1.7 MB | 0 | ARCHIVE (0 refs) |

### ARCHIVE — empty public scaffolding (0 rows, unused)
`admission_outcomes`, `application_deadlines`, `chance_me_posts`, `chancing_predictions`, `college_data_contributions`, `college_deadlines`, `college_insights`, `college_requirements`, `deadline_alerts`, `deadline_history`, `login_attempts`, `ml_metadata`, `ml_training_data` (1), `model_training_history`, `prediction_audit_log`, `prediction_logs`, `recommendation_requests`, `requested_colleges`, `scraped_applicants`, `scraped_results`, `scraper_logs`, `student_activities`, `student_awards`, `student_coursework`, `user_deadlines`, `user_financial_profiles`, `user_ml_stats`, `user_outcome_contributions`, `user_profiles`, `user_scholarships`, `user_suggestions` (2). — all 0–2 rows; confirm no active feature owns them (some belong to unbuilt ML/contribution features → INVESTIGATE if that vertical is planned).

## Tally
- **KEEP:** ~22 canonical + ~27 public ≈ **49 tables** → meets the <50 target.
- **ARCHIVE:** ~5 canonical merge-residue + ~11 canonical empty + ~5 public legacy-dead + ~31 public empty ≈ **52 tables** (near-zero bytes except college_majors 35 MB dead + colleges_legacy 5 MB).
- **MERGE:** 11 legacy public.college* (gated on backend migration).
- **INVESTIGATE:** ~11.

**<50 KEEP is reachable**, but only after the backend is migrated off `public.college*`. Archiving the ~42 empty tables is trivial and reversible and can happen immediately in Phase 6.
