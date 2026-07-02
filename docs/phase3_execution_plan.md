# Phase 3 Execution Plan

Synthesizes the implementation-phase work: `synthetic_data_inventory.md`,
`chancing_model_emergency_patch.md`, `data_provenance_design.md`,
`undergrad_cleanup_report.md`, `masters_cleanup_report.md`,
`masters_experience_parity_implementation.md`, plus the prior planning docs
(`implementation_priority_matrix.md` etc.). Ranked per the brief: P0 (user trust / false
information / data corruption) → P1 (completeness / provenance / onboarding) → P2
(feature expansion / schema expansion) → P3 (future moat systems).

## What shipped in this implementation pass

| Area | Action | Verified |
|---|---|---|
| Chancing engine | Disabled the ML model call (trained on simulated applicants); fixed the `acceptance_rate ?? 0.50` fabrication affecting 74% of colleges; fixed the zero-signal fallback that invented `acceptRate * 0.5`; hid the second, uncalibrated `admit_chance` percentage in recommendations UI | `runTests()` unchanged on real-data cases; new "Insufficient Data" state confirmed on missing-data cases; `tsc --noEmit` clean |
| Undergrad financial data | Nulled 12 negative `net_price`, 3 sub-$500 tuition values, 33 `cost_of_attendance < tuition` conflicts, 23 unreasonable international-tuition values, 217 out-of-range `acceptance_rate` values (288 fields total) | Re-queried post-fix: 0 rows remain in each category |
| Masters program data | Nulled 643 fabricated `admission_difficulty` scores (100% of that column — all derived from all-null inputs) and 453 fabricated `funding_attractiveness` scores; fixed 3 impossible `min_gpa` values; refreshed `mv_masters_program_cards` | Cross-verified against live DB: `admission_difficulty` now 0 non-null, `funding_attractiveness` 190 legitimately-derived non-null remain |
| `housing_guarantee` display bug | Fixed TEXT `'false'` rendering as truthy across 3 call sites | `node -c` clean on both backend files, `tsc` clean on frontend |
| Masters onboarding UX | Pulled `/masters/onboarding` out of `MastersLayout`'s sidebar wrapper (full-viewport takeover, matching undergrad); added a 7-step color-theme system | `tsc --noEmit` clean; **not yet manually verified in a running browser** — flagged below |
| Provenance system | Full design doc: standardize on existing `source_attribution` JSONB + 2 new scalar columns (`verification_status`, `last_verified_at`); 9-value verification-status enum; migration plan 130-133 | Design only, not yet migrated |

## P0 — User trust / false information / data corruption (mostly done, some flagged)

| Item | Status |
|---|---|
| Chancing model trained on synthetic data reaching users | **Fixed** — disabled |
| Fabricated 50% acceptance rate driving chance calculations for 74% of colleges | **Fixed** |
| Zero-signal fabricated probability fallback | **Fixed** |
| Second uncalibrated "chance %" in recommendations | **Fixed** (hidden from UI) |
| 207 fabricated tuition rows (prior session) | **Fixed** |
| 288 additional impossible undergrad financial/admissions values this pass | **Fixed** |
| 643 + 453 fabricated masters derived scores | **Fixed** |
| `housing_guarantee` truthy-string display bug | **Fixed** |
| **6,016 conflicting duplicate financial rows** | **Not fixed — correctly not auto-resolved.** Re-verification this pass found *zero* safely-mergeable groups (all conflict on at least one field); needs a human-reviewed migration, not an automatic script. This is now the single largest remaining data-corruption-adjacent issue. |
| **42 duplicate institution records** (Toronto, McGill, Imperial College, LSE, etc. each split across 2 UUIDs) | **New finding, not fixed.** Requires a dedicated FK-reassignment migration across ~15 related tables — flagged as the top P0 candidate for the next work session given it directly causes "this famous university's data looks incomplete" symptoms. |
| Masters enrichment script (`scraper/sources/masters_enrichment.py`) still *computes* the fabricated baseline going forward | **Not fixed.** The DB was cleaned, but the Python script will re-introduce the same fabricated scores on its next scheduled run unless patched. This is a code fix, not a DB fix, and is the highest-priority remaining P0 item since it will silently undo this session's cleanup. |
| `acceptance_rate` out-of-range values (217 rows, clearly a 0-100 vs 0-1 scale bug) | **Nulled per strict policy**, not unit-corrected. A `/100` mechanical fix was attempted and blocked by the safety guardrail as inconsistent with "never estimate." Flagged for explicit user sign-off if a unit-normalization is preferred over nulling. |

## P1 — Data completeness / provenance / onboarding

| Item | Status |
|---|---|
| Standardized provenance schema design | **Designed** (`data_provenance_design.md`) — not migrated |
| Backfill classification of existing rows into verification_status | **Not started** — depends on the migration above |
| Masters onboarding full-screen takeover | **Fixed** |
| Masters onboarding per-step color theme | **Fixed** |
| Masters onboarding remaining polish (SVG progress, transitions, reveal moment, mid-flow visualization, typography, dashboard density) | **Not implemented this pass** — correctly scoped as lower-priority polish per the gap report; a follow-up pass once the two structural fixes are manually verified in-browser |
| ~6,000 empty-attribution financial rows with real-looking values | **Not actioned** — needs a re-verification-window policy decision |

## P2 — Feature expansion / schema expansion

Explicitly out of scope for this implementation phase per the brief ("DO NOT add the 80%
schema expansion yet"). Plans remain staged in `undergrad_expansion_plan.md`,
`masters_expansion_plan.md`, `applicant_model_plan.md` from the prior planning phase,
unchanged.

## P3 — Future moat systems

Explicitly out of scope. `chancing_model_v2_design.md` remains a design document; no v2
build, no retraining, per instruction.

## Recommended next session priorities, in order

1. **Patch `scraper/sources/masters_enrichment.py`** so it stops computing
   `admission_difficulty`/`funding_attractiveness` from an all-null baseline — otherwise
   this session's cleanup gets silently undone on the next scheduled scrape run. This is
   the single most urgent leftover item because it's a ticking clock, not a static bug.
2. **Manually verify the masters onboarding route change in a running browser** — the
   `App.tsx` restructuring was type-checked but not click-tested; confirm full-screen
   takeover and color transitions render as intended and no other masters route (auth
   redirect, layout) regressed.
3. **Decide and execute a merge strategy for the 42 duplicate institutions** — highest
   remaining data-corruption risk, affects some of the most-searched-for universities in
   the catalog.
4. **Decide a resolution policy for the 6,016 conflicting duplicate financial rows** —
   needs a human call (or the provenance system built out first, so "prefer the row with
   real attribution and latest timestamp" becomes an automatable, auditable rule).
5. **Confirm the `acceptance_rate` unit-normalization question** — null (current state)
   vs. restore via `/100` — a quick decision that recovers otherwise-lost real data if
   you're comfortable treating unit conversion differently from data fabrication.
6. Only after 1-5: begin executing the staged P2 schema-expansion plans.
