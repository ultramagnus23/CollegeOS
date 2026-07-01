# Chancing Model v2 — Design Document

Status: design only, no code changes. Scope: architecture that can absorb an
expanding undergrad variable set (~80%+ of an enlarged feature list) and 100-150
collected / 200-400 derived masters variables, without a redeploy per new field
and without fabricating confidence where data is sparse.

---

## 1. Current-state summary

### 1.1 Undergrad — `backend/src/services/consolidatedChancingService.js`

**Algorithm.** A 7-factor weighted composite (academic fit 0.28, selectivity
curve 0.18, holistic profile 0.16, international pool 0.14, application
strategy 0.12, institutional fit 0.08, financial signal 0.04 — lines 129-136),
computed as hand-tuned percentile/sigmoid transforms (`percentileScore`,
lines 25-65) rather than a fitted model. Weights are literal constants
(`f1Weight = 0.28`, etc.), redistributed by ad-hoc rules when a factor is
inapplicable (domestic → F4 weight moves to F1, line 508-510; low-selectivity
schools shift F3 weight into F1, lines 274-276). None of this redistribution
is learned; it is judgment calls encoded directly in control flow.

Three more layers sit on top of the composite:
- **Layer 2 selectivity ceiling** (lines 532-564): hard caps like "never show
  above 2x historical acceptance rate" and "<10% accept schools cap at 30%".
- **Layer 3 final formula** (line 568): `rawComposite × (acceptRate / 0.50)`,
  clamped to the ceiling.
- **Model-first/heuristic-fallback** (lines 576-593): `chancingModel.js`
  produces a logistic-regression probability from 3 standardized features
  (SAT z-score, GPA-centered, logit of acceptance rate) when college
  acceptance-rate + median SAT and student SAT/ACT are all present; otherwise
  the heuristic above is used.

**Critical gap — the "model" isn't real.** `backend/src/services/ml/chancingModel.js`
line 9 states outright: *"the model was fit on applicants simulated from real
per-college stats, not on real admission outcomes."* So the `probability_source:
'model'` path shown to users today is a logistic fit over synthetic applicants
layered onto real per-college percentiles — it is not calibrated against actual
outcomes. This is the single biggest limitation to fix in v2, and it directly
intersects the project's zero-tolerance-for-synthetic-data policy: the artifact
itself was trained on synthetic applicants, even though its inputs are real.

**Other limitations:**
- **No true uncertainty interval.** `probabilityRange` (line 613-617) is
  `probability ± rangeHalfWidth`, where `rangeHalfWidth = 0.06 × varianceMultiplier`
  (line 264) — a fixed heuristic band tied to selectivity tier, not a
  statistically derived confidence interval from data volume or model variance.
- **Confidence is a point count, not a variance estimate.** Lines 640-652 award
  `confPoints` for which fields are present (SAT+bands: 3, GPA+bands: 3, ECs: 2,
  etc.) and threshold into High/Medium/Low. This measures *input completeness*,
  not *prediction reliability* — a student could have every field filled in but
  the model could still be poorly calibrated for their segment (e.g. an
  unusual country/major combination), and this scheme would still report "High".
- **Hardcoded factor weights never adapt.** The 7 weights are constants; there
  is no mechanism to re-weight factors as new variables are added, and no path
  for a newly-added variable to enter the composite without editing this file's
  `rawFactors` array and re-deploying.
- **Audit log exists but is unused for calibration.** Migration 070
  (`backend/migrations/070_chancing_audit_log.sql`) creates
  `chancing_audit_log(user_id, college_id, raw_probability, displayed_chance,
  ceiling_applied, created_at)`, and the service writes to it on every call
  (lines 619-638, fire-and-forget via `setImmediate`). But it captures
  *predictions*, not *outcomes* — there's no `actual_decision` column, so
  today it can only audit "what did we show," never "were we right."
- **A third, independent admit-probability formula exists in the
  recommendation pipeline.** `backend/src/services/recommendation/
  recommendationPipelineService.js` lines 62-93 (`classifyPortfolioBucket`,
  `classifyBySelectivity`, `estimateAdmitChance`) reimplements a *different*
  weighted composite (`admissions_fit × 0.45 + selectivity_tier_score × 0.15 +
  major_availability × 0.2 + country_match × 0.08 + subject_ranking_alignment
  × 0.12`) purely for portfolio bucketing (reach/target/safety), sourced from
  `featureEngineeringService.js`'s simpler `admissionsFit`/`majorMatchScore`
  functions — not from `consolidatedChancingService`. Two chancing-shaped
  numbers can disagree for the same student/college pair depending on which
  code path renders them. v2 must consolidate to one probability engine.

### 1.2 Masters — `backend/src/services/masters/mastersChancingService.js`

**Algorithm.** Pure, DB-free functions (explicitly documented as such, line 13)
that assess a student against each applicable admission *pathway*
(`pathwayApplies`, lines 88-105), using two signal sources in priority order:
1. **Published minimum GPA** (`assessPathway` lines 120-127) — hardest signal,
   a `BELOW`/`WITHIN` classification vs the program's stated `min_gpa`.
2. **Self-reported percentile bands** from `masters_admission_datapoints`
   (GradCafe + our own users), but *only* when `N >= MIN_SAMPLE` (15,
   line 16) — below that threshold the field is simply excluded, not
   estimated (`bandsFromDatapoints`, lines 60-69, returns `null` under
   threshold).

Overall program band = best band among applicable pathways (an applicant
only needs one path to admit — lines 204-209), output as one of `below_typical
/ within_typical / above_typical / insufficient_data` (never a probability).

**Why bands, not probability — documented rationale.** The file's own header
(lines 5-12) and `docs/MASTERS_TRACK_PLAN.md` §8 ("Phase 5 — Masters chancing
(rules-based bands, not a probability)", line 347) state the decision
explicitly: masters admissions has no public acceptance-rate-equivalent
denominator, weighs unobservable factors (SOP, LOR strength, interviews,
research/advisor fit — line 9, restated as `CHANCING_DISCLOSURES` shown
in-product at lines 33-37), and self-reported samples are small and
self-selected. This is a considered product decision, not a shortcut, and v2
must not silently override it.

**Where it falls short (by design, acknowledged in-product):**
- No probability at all, by design — but also no severity/margin signal
  within a band (e.g. "just below p25" vs "far below p25" both render as
  `below_typical`).
- `assessPathway` only ever compares against `gre_quant`, `gre_verbal`,
  `gmat_total`, and GPA (lines 141-154) — it has no path today for research
  output, work-experience quality, or SOP/LOR signals to move a band, even
  though `masters_profile` (migration 120) already has columns for
  `publication_count`, `research_experience`, `work_experience_desc`, `sop_status`.
  These are collected but not yet scored.
- `masters_admission_datapoints` (migration 120 §6) has an `our_user` source
  type and `masters_applications.decision_outcome` (migration 120 §7) — both
  explicitly captured "so a future v2 model" can use real outcomes (comment,
  migration 120 lines 202-204, 231-232). Today nothing reads
  `decision_outcome` back into the band computation — the outcome-capture
  loop is wired at the schema level but not yet closed at the service level.
- Pathway taxonomy (`scraper/masters/normalizers/pathway_taxonomy.py`) is
  richer than what `assessPathway` uses: it classifies 8 pathway types
  (`standard_test_based`, `test_waived_holistic`, `work_experience_substitution`,
  `portfolio_based`, `bridge_certificate`, `conditional_admission`,
  `executive_part_time`, `direct_entry_no_test` — lines 22-31) with a
  per-pathway `weighted_fields` map (lines 35-44) and a scrape-time
  `confidence` score (lines 165-169, 153-162). `assessPathway` in the service
  only actually *scores* GRE/GMAT/GPA fields regardless of pathway (lines
  141-154) — e.g. `work_experience_substitution`'s weighted fields include
  `work_experience_years`/`work_experience_desc`, but the service never scores
  those fields at all. The taxonomy is more expressive than the scoring logic
  that consumes it.

### 1.3 Reusable infrastructure in the recommendation pipeline

`backend/src/services/recommendation/`:
- `coldstart/uncertaintyModel.js` — `profileUncertainty()` (missing-field
  ratio → 0-1 uncertainty) and `confidenceAdjustedScore()` (penalizes a score
  by uncertainty). Conceptually the right shape for v2's confidence layer,
  but currently a blunt fraction-missing count, same class of problem as
  `consolidatedChancingService`'s `confPoints`. Worth generalizing rather
  than reusing as-is.
- `featureEngineeringService.js` — normalizes raw student/college fields into
  0-1 sub-scores (`admissionsFit`, `majorMatchScore`, `affordabilityFit`,
  `countryMatch`). This is close to what a v2 "feature pipeline" needs, but it
  is currently private to the recommendation ranking path, not chancing.
- `ltrInferenceService.js` (learning-to-rank inference) and `embedding/` —
  real ML infra (embeddings, cross-encoder reranking, hybrid retrieval) exists
  for *college discovery/ranking*, not for admit-probability estimation. It
  demonstrates the team already has an ML-serving pattern (load an artifact,
  fall back gracefully when absent) that `chancingModel.js` mirrors — that
  fallback pattern is reusable, but the underlying models solve a different
  problem (relevance ranking, not calibrated probability) and cannot be
  repurposed directly for chancing.
- `pipelineDiagnostics.js` — `logStageStart/Complete/Failure`,
  `assertJsonSerializable`, `verifyCanonicalInfrastructure`. Useful,
  low-risk pattern to adopt for a staged v2 chancing pipeline (feature
  extraction → scoring → calibration → explanation as named, logged stages).

**Conclusion:** there is no reusable *calibrated probability* infrastructure
today — only reusable *shape* (feature normalization, staged pipeline logging,
graceful ML-artifact-fallback, uncertainty-as-missingness). v2 for undergrad
should reuse these patterns but must build calibration from scratch because a
real outcomes-based artifact does not exist yet.

---

## 2. Proposed v2 architecture

### 2.1 Feature pipeline — plug in new variables without redeploying core logic

Replace the current pattern (each factor hand-computed inline in one ~1000-line
function, weights as literals) with a **declarative feature registry**:

- Each variable is registered as `{ key, extractor(profile, college, application),
  type: 'continuous'|'ordinal'|'categorical'|'boolean', scale, missingPolicy }`.
  The registry is data, not code — new undergrad/masters variables from the
  parallel scoping effort get added as registry entries, not as new `if`
  branches in `calculateChance`.
- A **feature-group** layer (mirrors today's 7 factors / masters pathway
  `weighted_fields`) maps 1-N raw features into a named group with a
  *default* weight, but the weight is a prior, not a hardcoded final value
  (see §2.2). Grouping matters because with 80-400 raw variables, a flat
  weighted sum invites both overfitting and unreadable explanations; grouping
  keeps the explanation surface at "academic fit / extracurricular strength /
  research fit / financial fit" even as the underlying variable count grows.
- Each extractor returns `{ value, present: bool }`. Missingness is tracked
  per-variable (extending today's `missingDataFields` array, lines 174/245/246/329)
  so the confidence layer (§2.3) can reason about *which* group has thin data
  rather than one global completeness count.
- Concretely, this is an evolution of `featureEngineeringService.js`'s
  pattern (normalize-to-0-1 functions) generalized into a registry so
  `consolidatedChancingService`, `mastersChancingService`, and the
  recommendation pipeline's `estimateAdmitChance` (currently a fourth,
  divergent implementation) can converge on one feature-extraction layer.
  This directly resolves the "two chancing numbers can disagree" problem in
  §1.1.

### 2.2 Weighting approach — data-driven where possible, rules as a floor

Given the current state (a synthetic-data logistic model plus fully
hand-tuned heuristic weights, and *zero* real outcome-labeled undergrad data
in production yet), v2 should NOT jump straight to a fully learned model. The
concrete risk: with `chancing_audit_log` currently storing zero real
admit/reject outcomes, any model "trained" today would either (a) reuse
synthetic data again (repeating the exact problem flagged in
`chancingModel.js` line 9), or (b) overfit instantly to a handful of real
labels once they start trickying in, producing a superficially "data-driven"
number that is actually noise.

Recommended staged approach:
1. **v2.0 (ships without real outcome data):** Keep the rules-based composite
   as the production defaults, but move weights out of code into a
   versioned, reviewable config (`chancing_weights.json` analog to
   `ml/chancing_model.json`), so weight *values* can be revised without a
   code deploy, while the weight *schema* (which groups exist) stays
   code-reviewed. This alone unlocks "80% of a bigger variable set" — new
   variables slot into existing groups by config edit, and genuinely new
   groups (e.g. "research fit") are additive schema changes reviewed like any
   other PR, not silent weight-literal edits buried in a 1000-line function.
2. **v2.1 (gated on real labeled outcomes accumulating):** Once
   `chancing_audit_log` (extended, see §2.4) has enough real
   admit/reject/waitlist labels *per selectivity band* (a minimum-N gate,
   mirroring the masters `MIN_SAMPLE = 15` pattern — reuse that exact
   pattern for undergrad rather than inventing a new one), fit a regularized
   logistic regression (L2-penalized, few dozen coefficients, not a deep
   model) per selectivity tier, using the feature groups from §2.1 as inputs
   and real outcomes as labels. Regularization + per-tier fitting (not one
   global model) is the overfitting guard given N will stay small for years —
   this mirrors why `chancingModel.js` already scoped itself to 3 features
   for the same reason.
3. At every stage, the model only ever emits a probability for feature groups
   with sufficient support; groups below the sample-size gate are excluded
   from the composite exactly like today's "no holistic data → excluded, not
   penalized" logic (lines 319-329) — this behavior generalizes cleanly and
   should be kept as a first-class rule in v2, not an implementation detail.

### 2.3 Confidence / uncertainty estimation

This is the section where v2 must be most disciplined, per the project's
zero-tolerance-for-synthetic-numbers policy.

- **Do not report a numeric confidence interval derived from a heuristic
  constant** (today's `rangeHalfWidth = 0.06 × varianceMultiplier`, line 264,
  and masters' complete absence of any interval) once new variable groups are
  in play, unless the interval is actually derived from (a) real
  bootstrap/cross-validated variance once §2.2 stage 2 fits a real model, or
  (b) an explicit, labeled heuristic band clearly presented as a
  *judgment-based range*, not a statistical CI. v1's current `probabilityRange`
  is already borderline on this — it is a heuristic wearing the shape of a
  CI. v2 should either earn a real CI or rename/relabel the field so the UI
  cannot present it as more rigorous than it is.
- **Confidence must be two-dimensional**, not the current 1-D point count
  (lines 640-652): (1) *data completeness* per feature group (extend
  `missingDataFields` from §2.1), and (2) *model support* — how much labeled
  outcome data exists for this student's segment (selectivity tier ×
  domestic/international × major cluster). A student with a fully-filled
  profile applying to a segment with zero real outcome labels should show
  Low/Medium confidence even though every field is present — the current
  scheme cannot express this because it only counts presence, not
  segment-level label support.
- **Masters must keep `insufficient_data` as a first-class output**, never
  silently converted into a number. `mastersChancingService`'s
  `BAND.INSUFFICIENT` (line 22) and the `MIN_SAMPLE` gate (line 16, `N >= 15`)
  are exactly the right pattern — v2 for undergrad should adopt the same
  explicit "insufficient data" state (today undergrad has no equivalent; when
  `activeFactors.length === 0` it falls back to `acceptRate * 0.5` clamped
  (line 518) — an *invented* number rather than a declared "insufficient data"
  state). **This is the concrete place v1 already risks the exact synthetic-
  number problem the project prohibits, and v2 must close it**: replace that
  fallback with an explicit `tier: 'Insufficient Data'` / `probability: null`
  response, matching how the outer catch block already does it (lines
  751-765) for hard errors.

### 2.4 Explainability

`consolidatedChancingService` already returns a good foundation:
`factorScores` (per-factor score/weight/contribution/detail, e.g. lines
249-254) and `explanation.summary/recommendedActions` (lines 664-723). v2
should keep this exact contract shape and extend it mechanically as the
feature registry (§2.1) grows:
- Each *feature group* (not each raw variable) gets one `factorScores` entry
  with `contribution` — this keeps the explanation readable at 80-400
  underlying variables by construction, since groups, not raw variables, are
  the explanation unit.
- `recommendedActions` should stay derived from real counterfactuals already
  computed (the ED-bonus counterfactual pattern at lines 677-690 — computing
  the *actual* realized delta rather than an advertised one — is exactly
  right and should be the template for every new "what would change my
  chances" action, e.g. "add a research publication" should only appear with
  a stated delta once §2.2 stage 2 model exists to compute one; before that,
  keep it qualitative ("would strengthen X factor") rather than inventing a
  percentage-point number, same principle as §2.3.
- Masters explainability should extend `perField` (line 118 of
  `mastersChancingService.js`, already per-field band classification) plus
  surface `basis` (`published_minimum` vs `self_reported_band`, lines
  159-173) directly to the user — this is already a good "why" trail, just
  needs a UI surface, not a service change.

### 2.5 Calibration strategy

- **Extend `chancing_audit_log`** (migration 070) with an outcome-capture
  path: add `actual_decision TEXT CHECK (... IN ('admit','reject','waitlist',
  'deferred','withdrawn'))` and `decision_recorded_at`, populated when a
  student marks their application result (mirrors exactly how masters
  already captures this via `masters_applications.decision_outcome`,
  migration 120 §7, and `masters_admission_datapoints.source = 'our_user'`,
  migration 120 §6 — undergrad has no equivalent today and should adopt the
  identical pattern rather than a new one).
- **Calibration curve, not just accuracy.** Once real outcomes accumulate,
  validate by reliability diagram (binned predicted probability vs observed
  admit rate) per selectivity tier — not a single global metric — since
  `chancingModel.js` already shows the team is aware model behavior varies
  sharply by selectivity band (`varianceMultiplier` per tier, lines 73-78).
  Do not publish a calibrated probability for a tier/segment until it clears
  the same minimum-N gate as §2.2/§2.3 (reuse masters' `MIN_SAMPLE` pattern
  and value as the starting default, 15, subject to revision once real
  variance is observed).
- **Masters calibration is explicitly NOT probability calibration** — masters
  v1's rationale (§8 of MASTERS_TRACK_PLAN.md, lines 347-368) is a product
  decision that a probability cannot exist for most programs (opaque
  denominators, unobservable factors). What *can* be calibrated is the band
  boundary itself: are `above_typical`-banded applicants actually admitted
  more often than `below_typical` ones, using `masters_applications
  .decision_outcome` once it accumulates? That is a monotonicity check, not
  a probability-calibration exercise, and should be reported/tracked as such
  (e.g. "applicants we band ABOVE_TYPICAL are admitted at 2.3x the rate of
  those banded BELOW_TYPICAL, N=214" — a comparative statistic, never
  rendered back to an individual applicant as their personal probability).

### 2.6 Pathway-specific sub-models for masters

The pathway taxonomy already defined in
`scraper/masters/normalizers/pathway_taxonomy.py` (8 `PATHWAY_TYPES`, lines
22-31, each with its own `WEIGHTED_FIELDS`, lines 35-44) should become 8
explicit scoring sub-models in `mastersChancingService.js`, replacing the
current one-size-fits-all `assessPathway` (which only ever scores
GRE/GMAT/GPA regardless of pathway, per the gap noted in §1.2):

| Pathway | v2 scoring inputs (already collected, currently unused) |
|---|---|
| `work_experience_substitution` / `executive_part_time` | `work_experience_years`, `work_experience_desc` (qualitative — keyword/seniority signal, not a fabricated score), `undergrad_gpa` |
| `test_waived_holistic` | `undergrad_gpa`, `research_experience`, `work_experience_years` — no GRE/GMAT comparison at all (currently the service still silently allows GRE bands to leak in as `weighted_fields` filters, line 130-134 — but only if the pathway's `weighted_fields` doesn't include them, so this is *mostly* correct today; v2 should add an explicit test asserting waived pathways never surface a GRE/GMAT `perField` entry) |
| `portfolio_based` | `research_experience`, `undergrad_gpa` — portfolio quality itself is unscoreable without human/file review; v2 should represent it as a checklist item ("portfolio required — not assessed"), never a synthetic score |
| `bridge_certificate` / `conditional_admission` / `direct_entry_no_test` | `undergrad_gpa` only, per taxonomy — keep narrow, do not over-fit additional fields where the taxonomy itself says GPA is the only signal |
| `standard_test_based` | current logic (GRE/GMAT/GPA vs published min + self-reported bands) — unchanged |

Each sub-model still routes through the same `BAND` enum and `MIN_SAMPLE`
gate; the only change is which fields feed `perField`/`fieldBands` per
pathway, matching `weighted_fields` from the taxonomy exactly instead of the
current fixed GRE/GMAT/GPA set. `pathway.confidence` (the scrape-time
detection confidence, taxonomy lines 165-169) should also be surfaced
alongside the band, since a `work_experience_substitution` pathway detected
at confidence 0.5 (one weak phrase match) deserves a visibly lower-trust
band than one detected at 0.95 (multiple explicit phrases) — this is
currently captured at scrape time but dropped before it reaches the student.

### 2.7 Migration path v1 → v2 (must not break "masters = bands, not probability")

1. **Undergrad, additive first:** Introduce the feature registry (§2.1) and
   move weights to config (§2.2 stage 1) as a refactor with identical
   outputs — no behavior change, verified by re-running `runTests()`
   (lines 773-815) with unchanged expected tiers. This is a pure
   maintainability change and ships independently of any new variables.
2. **Undergrad, new variables:** As the parallel variable-scoping effort
   delivers new undergrad fields, add them as registry entries inside
   existing feature groups (or new groups, reviewed) with `missingPolicy:
   'exclude'` by default (matching the existing "exclude, don't penalize"
   philosophy at lines 319-329) until each new group has real usage data to
   set a sensible weight prior.
3. **Undergrad, outcome capture:** Ship the `chancing_audit_log` schema
   extension (§2.5) and a UI prompt for students to record decisions. This
   can ship independently and immediately — it's additive schema, zero risk,
   and is the prerequisite for stage 4.
4. **Undergrad, real model (gated):** Only once §2.5's minimum-N gate is
   cleared for at least one selectivity tier, introduce the regularized
   per-tier logistic model (§2.2 stage 2) as an *additional* candidate
   probability source alongside the existing heuristic — following the exact
   existing pattern at lines 576-593 (try model, fall back to heuristic on
   any failure/insufficient-support), except now the model is fit on real
   outcomes instead of simulated ones, and the code should assert this
   distinction is documented in the new model's metadata file the same way
   `chancingModel.js` line 9 documents the current one's synthetic origin —
   this prevents an unlabeled repeat of today's issue.
5. **Masters, additive only:** Ship pathway-specific sub-models (§2.6) and
   confidence-labeled `pathway.confidence` surfacing as an additive change to
   `assessPathway`/`assessProgram` — output shape (`{ overall: { band, label
   }, pathways, checklist, sampleSize, disclosures }`) is unchanged, so
   nothing downstream breaks.
6. **Masters, band-to-probability question is explicitly out of scope for
   v2** unless a future signal appears: specifically, if
   `masters_applications.decision_outcome` volume ever reaches a point where
   band-vs-outcome monotonicity is strong AND consistent across programs
   (the comparative statistic from §2.5), that would be the trigger to revisit
   the probability-vs-band product decision — but that is a deliberate,
   separate product decision for a human to make (as it was made the first
   time, per MASTERS_TRACK_PLAN.md §8), not something v2's architecture
   should pre-empt by quietly starting to compute or display a percentage.
   The `CHANCING_DISCLOSURES` array (lines 33-37) stays in place until that
   decision is explicitly revisited.

---

## Summary of what v2 must NOT do

- Must not fit or ship a "calibrated" model on synthetic/simulated applicants
  again (the exact problem in `chancingModel.js` today).
- Must not report a numeric probability range/CI that isn't either a real
  statistical estimate or clearly labeled as heuristic, not statistical.
- Must not let the undergrad "zero active factors" path fall back to an
  invented number (`acceptRate * 0.5`, line 518) — must return an explicit
  insufficient-data state instead.
- Must not compute or surface a masters admit probability under any
  v2 architectural change, absent an explicit, separate product decision.
