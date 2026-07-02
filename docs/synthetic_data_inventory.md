# Synthetic Data Inventory

Full audit of every place the application generates, infers, simulates, estimates, or
fabricates a value rather than displaying a verified one. Cross-references
`chancing_model_v2_design.md`, `data_audit_report.md`, and `implementation_priority_matrix.md`.
Actions marked **[DONE]** were fixed directly during this session; everything else is
inventoried for follow-up per the priority matrix.

| # | Location (file:line) | Endpoint / surface | Variable | Source of fabrication | Confidence shown to user | Action | Status |
|---|---|---|---|---|---|---|---|
| 1 | `backend/src/services/consolidatedChancingService.js:171` | `/api/fit/:collegeId`, `/api/fit/batch`, recommendation pipeline (via `calculateChance`) | `acceptRate` | Missing `college.acceptance_rate` silently defaulted to `0.50` ("moderately selective"), feeding selectivity ceiling, tier, and displayed probability for **6,319 of 8,500 colleges (74%)** that have no real acceptance rate | None — shown as a normal percentage indistinguishable from real data | **Replace with verified data / return null** | **[DONE]** — now returns `tier: "Insufficient Data"`, `probability: null` when `acceptance_rate` is missing |
| 2 | `backend/src/services/consolidatedChancingService.js:516-518` (pre-fix) | same as above | `rawComposite` zero-factor fallback | `acceptRate * 0.5` invented whenever literally zero student/profile factors matched | None | **Remove / replace with verified data** | **[DONE]** — folded into the same insufficient-data gate above |
| 3 | `backend/src/services/ml/chancingModel.js` (whole module) | `consolidatedChancingService.js:582` call site | `probability` (`probability_source: 'model'`) | Model coefficients fit on **simulated applicants**, not real admission decisions (file's own header comment, line 8-9) | Presented identically to the heuristic path — user cannot tell it's model-derived vs. rule-derived, let alone that the model is synthetic-trained | **Disable** | **[DONE]** — call site commented out with a dated rationale; module left in place (not deleted) so the artifact/tests still exist for future re-training work, but nothing reaches users |
| 4 | `backend/src/services/recommendation/recommendationPipelineService.js:81-93` (`estimateAdmitChance`) + call sites at lines 307, 618 | `/api/recommendations` → `src/pages/Colleges.tsx` | `admit_chance` (rendered as "X% chance") | Hardcoded linear weighting of 5 features (`admissions_fit`, `selectivity_tier_score`, `major_availability`, `country_match`, `subject_ranking_alignment`) with no calibration against real outcomes — a **second, independent chance formula** that can (and does) disagree with `consolidatedChancingService.js`'s number for the same student+college | None — rendered as a plain "62% chance" style label | **Hide the numeric percentage; keep the qualitative bucket** | **[DONE]** — `src/pages/Colleges.tsx` no longer renders `{rec.admit_chance}%`; the reach/target/safety `tier` label (still derived from the college's real `acceptance_rate` where present) is kept |
| 5 | `scraper/sources/masters_enrichment.py` (`admission_difficulty`, `funding_attractiveness` computation) | `canonical.masters_programs` → masters program cards | `admission_difficulty`, `funding_attractiveness` | Computed off a hardcoded 50-point baseline even when real inputs (`acceptance_rate`, `avg_gpa`, `avg_gre_quant`) are `NULL` for that program | None — shown as a normal score | **Null when inputs are null** | Not yet fixed — flagged in `masters_expansion_plan.md`; requires a Python-side change plus a re-run of the enrichment script, scoped for Phase E |
| 6 | `canonical.institution_financials` — 207 rows, `source_attribution.source = 'manual_seed'` | `mv_college_cards` → college detail/list pages | `tuition_domestic`, `tuition_international`, `cost_of_attendance`, `fees`, and 8 other money fields | Manually seeded round-number placeholders (e.g. Ashoka University tuition shown as $12,000) with an inflated `confidence: 0.85` and empty `raw_payload` | False confidence score of 0.85 | **Remove (null)** | **[DONE]** in the prior session — all 207 rows nulled, tagged `nulled_reason`, MV refreshed |
| 7 | `canonical.institution_financials` — ~6,000 rows, `source_attribution = {}` with non-null money values | same as above | tuition/COA fields for a long tail of institutions | No provenance recorded at all for a real-looking number (can't distinguish a genuine scrape from a stale guess) | None | **Gate behind re-verification / null on a deadline** | Not yet actioned — flagged in `data_audit_report.md`, needs a policy decision on the re-verification window (Phase D/E) |
| 8 | `canonical.institution_financials` — 6,016 duplicate `(institution_id, data_year)` rows, 2,193 conflicting | same as above | any money field | Old (May 2026) and new (June 2026) ingestion batches both present; a query without an explicit freshness rule can nondeterministically surface the stale value | None — user has no way to know two different numbers exist for "the same" fact | **Dedup migration (keep freshest attributed row)** | Not yet actioned — scoped in `data_audit_report.md` and Phase D |
| 9 | `backend/migrations/127_expanded_data_variables.sql` — 8 undergrad derived-score columns (`prestige_score`, `admission_difficulty`, `financial_difficulty`, `academic_difficulty`, `career_roi`, `campus_fit_score`, `happiness_score`, `risk_score`) | `mv_college_cards` / college detail contract (columns exist, currently all `NULL` since nothing populates them) | all 8 | No population logic exists anywhere in the repo — columns are schema-only | N/A (currently null, correctly) | **No action needed yet** — correctly `NULL` today; flagged so future population logic doesn't invent values for `happiness_score`/`campus_fit_score`, which `undergrad_expansion_plan.md` explicitly marks as **not computable without fabricating data** (no real student-survey source exists) | Monitoring only |

## Fields explicitly flagged as "cannot be verified — do not attempt to compute"

Per `undergrad_expansion_plan.md` and `masters_expansion_plan.md`, these should stay `NULL`
indefinitely rather than get a synthetic formula, because no real public/free data source
exists for them today:

- Undergrad **happiness score** (no real student-survey data source integrated)
- Undergrad **campus fit score** (inherently per-user/subjective, not a single institutional constant)
- Employer reputation, research lab counts, PR-pathway granular immigration data (masters) — no realistic free source identified

## Summary

- **4 of 9** inventoried issues are fixed directly in this session (rows 1, 2, 3, 4 — the
  ones actively producing a fabricated *probability* shown to users right now).
- **1 of 9** (row 6) was already fixed in the prior audit session.
- **4 remain open**, all scoped with a concrete next step in the priority matrix (masters
  enrichment baseline, empty-attribution financial rows, duplicate financial rows, and
  ongoing monitoring of the correctly-null derived-score columns).
