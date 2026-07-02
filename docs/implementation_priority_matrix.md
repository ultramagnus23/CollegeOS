# Implementation Priority Matrix

Synthesizes: `data_audit_report.md`, `schema_gap_analysis.md`, `undergrad_expansion_plan.md`,
`masters_expansion_plan.md`, `applicant_model_plan.md`, `masters_experience_gap_report.md`,
`chancing_model_v2_design.md`. Ranked by impact / difficulty / engineering cost / data
availability / user value / model value. Nothing below has been implemented except where
marked **[DONE]** — those were fixed directly during this audit because they were actively
showing false data to users right now.

## P0 — Actively showing false/fabricated data today (fix first, mostly deletions not builds)

| Item | Impact | Difficulty | Data availability | Notes |
|---|---|---|---|---|
| 207 `manual_seed` fake tuition/COA rows | High (user-facing, was the original bug report) | Trivial | N/A — nulled | **[DONE]** nulled + MV refreshed this session |
| `housing_guarantee` TEXT('false') rendering as truthy "Yes" | Medium (silently wrong on every college detail page with data) | Trivial | N/A | **[DONE]** fixed in `collegeService.ts`, `collegeService.js`, `CollegeDetails.tsx` |
| Chancing model v1 trained on **simulated** applicants (`backend/src/services/ml/chancingModel.js:9`) — `probability_source: 'model'` shown to users is synthetic-data-trained | **Critical** — directly violates the zero-synthetic-data policy on the single most-trusted number in the app | Medium (disable/gate, not rebuild) | Real outcome data insufficient for a replacement yet | Recommend: disable the ML path immediately, fall back to the rules-based tier system until v2's real-data-gated model exists (see chancing_model_v2_design.md §pathway) |
| Undergrad zero-factor fallback invents `acceptRate * 0.5` instead of declaring low confidence (`consolidatedChancingService.js:518`) | High — fabricates a probability when there's no real signal | Low | N/A | Replace with an explicit "insufficient data" state |
| 3 divergent chance-probability formulas across the codebase (`consolidatedChancingService.js`, `chancingModel.js`, `recommendationPipelineService.js:62-93`) | High — same student/college can show different numbers depending on code path | Medium | N/A | Consolidate to one source of truth before any v2 work |
| Masters enrichment computes `admission_difficulty`/`funding_attractiveness` off a 50-point baseline even when real inputs are null (`scraper/sources/masters_enrichment.py`) | High — near-constant, misleading score currently live for most of the 648 programs | Low | N/A | Null the score when inputs are null instead of defaulting to 50 |
| 6,016 duplicate `institution_financials` rows, 2,193 conflicting | Medium-High — nondeterministic which value a query surfaces | Medium (dedup migration + backfill) | Data exists, just needs a merge rule | See data_audit_report.md remediation plan |
| ~6,000 rows with real-looking values but empty `source_attribution` | Medium | Low-Medium (batch re-tag or null) | Needs re-verification pass or null-by-policy | Decide a re-verification deadline, then null what's left |

## P1 — Schema debt cleanup (must happen before expanding, or expansion multiplies the mess)

| Item | Impact | Difficulty | Notes |
|---|---|---|---|
| Consolidate duplicate undergrad columns from migration 079 vs 127 (`tuition_in_state` vs `tuition_domestic`, `avg_debt` vs `avg_debt_at_graduation`, `median_start_salary` vs `median_salary_1yr`, `club_count` vs `clubs_count`) | High — every new feature built on top inherits the ambiguity | Medium | Migration 130+ per undergrad_expansion_plan.md |
| Consolidate duplicate masters pathway tables (`masters_pathways` vs `masters_program_pathways`, incompatible taxonomies) | High — same problem one layer deeper, actively confusing for pathway scoring | Medium | Pick one taxonomy (masters_expansion_plan.md recommends the newer, better-shaped one), migrate the live data, drop the other |
| Fix provenance-classification query to check nested `h3_financials_enrichment` source key | Low effort, corrects a false "12,259 unknown" narrative down to a real ~6,068 | Trivial | Metadata/tooling only, no data change |

## P2 — Wire up schema that already exists (highest ROI: no new migrations needed)

| Item | Impact | Difficulty | Notes |
|---|---|---|---|
| Populate the 8 undergrad derived-score columns (migration 127 added them, zero populating logic exists) | High — closes a visible "why is this blank" gap | Medium | Formulas specified in undergrad_expansion_plan.md; 2 of 8 (happiness score, campus fit) flagged as **not computable without fabricating data** — leave null with an explicit "no verified source" state, don't build a fake formula |
| Wire ~35% of masters LIST A columns (migration 127) into scrapers/services/`mv_masters_program_cards` | High — schema exists, this is pure plumbing not data collection | Medium-High (scraper work still needed per field) | masters_expansion_plan.md has the field-by-field source mapping |
| Widen `mv_college_cards`/frontend contract beyond current 24 fields (already-computed `v_college_cards_extended` exists as a workaround) | Medium | Low-Medium | Mostly a contract + frontend type update |

## P3 — Masters onboarding UX parity (self-contained, high visible impact)

| Item | Impact | Difficulty | Notes |
|---|---|---|---|
| Move masters onboarding out of `MastersLayout`'s fixed sidebar wrapper so it can own the full viewport (`App.tsx:195-212`, `MastersLayout.tsx:55-59,146`) | High — the core complaint ("dashboard shows up," "not full screen") is a routing structure issue, not a styling one | Medium (route restructuring, verify no regressions to authenticated masters routes) | masters_experience_gap_report.md has the exact route diff needed |
| Add a 7-step `STEP_THEMES`-equivalent color progression to `MastersOnboarding.tsx` (undergrad pattern at `Onboarding.tsx:48-56`) | Medium | Low | Copy the existing undergrad pattern, don't reinvent |
| Bring masters dashboard richness toward undergrad Dashboard parity | Medium | Medium-High | Lower priority than onboarding — onboarding is the first impression and cheapest fix |

## P4 — Chancing model v2 architecture (foundational, but only pays off once P0-P2 land)

| Item | Impact | Difficulty | Notes |
|---|---|---|---|
| Feature-registry + grouped-weighting pipeline (config not hardcoded literals) | High long-term (every new undergrad/masters field becomes usable without redeploying core logic) | High | chancing_model_v2_design.md full design |
| Minimum-sample-size gating before any learned model replaces rules (mirror masters' existing `MIN_SAMPLE=15` pattern) | Critical for policy compliance | Medium | Must be in place *before* re-enabling any ML-based probability |
| Per-pathway masters sub-models (currently `assessPathway` scores GRE/GPA regardless of declared pathway type, ignoring the existing 8-pathway taxonomy) | High for masters product differentiation | High | Depends on P2's masters wiring work being done first |
| Real-outcome calibration loop against `chancing_audit_log` / masters outcome data | High, but gated by data volume | Medium | Don't build until enough real outcomes exist — track volume, don't guess a threshold date |

## P5 — Net-new data collection (highest cost, lowest near-term ROI — do last)

| Item | Impact | Difficulty | Data availability |
|---|---|---|---|
| Fields with no realistic free source at all (employer reputation surveys, research lab counts, PR-pathway granular data, H1B/sponsorship rates) | Medium (nice-to-have breadth) | High | Low — needs new paid/licensed sources or manual curation; flagged explicitly in undergrad/masters expansion plans as "cannot compute without X" rather than proposed with a fake shortcut |
| Masters applicant profile Tier 2/3 structured fields (research project details, SOP feature extraction, faculty-fit matching) | High long-term (this is the actual differentiator/moat per the original brief) | High | Needs new structured-input UI + NLP extraction pipeline, not just scraping | 

## Sequencing rationale

1. **P0 first** because several items are live policy violations (synthetic data shown as real), not just gaps — cost to fix is low relative to the harm of leaving them live.
2. **P1 before P2** because wiring new scrapers into a column set that's about to be renamed/merged is wasted work.
3. **P2 before P4** because a feature-registry chancing model is only as good as the fields it can register — building it against today's sparse, half-wired schema undersells the investment.
4. **P3 runs in parallel** — it's UI/routing work, isolated from the data-layer sequencing above, and it's the most visible unfinished-feeling part of the product today.
5. **P5 last** — genuinely new data acquisition, highest cost, and several fields in this tier have no honest way to populate without either paying for a data source or accepting they stay null indefinitely.
