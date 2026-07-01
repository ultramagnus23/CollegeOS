# Chancing Model — Emergency Patch

Scope: Phase B of the implementation-phase brief. No retraining. No v2 build. Only:
disable unsupported probability display, replace with honest states, document the
remediation. Full v2 architecture remains in `chancing_model_v2_design.md` (design only,
not built).

## 1. Audit of the admissions engine — every place a probability reaches a user

| Surface | File | Real inputs required | Fabrication risk found | Status after patch |
|---|---|---|---|---|
| Main undergrad chancing (`/api/fit/:collegeId`, `/api/fit/batch`, `/api/fit/:collegeId/explain`) | `backend/src/services/consolidatedChancingService.js` | student SAT/ACT/GPA/profile, college `acceptance_rate`, SAT band | Two fabrications found and patched (see §2) | **Patched** |
| ML "calibrated" model overlay | `backend/src/services/ml/chancingModel.js` | same, plus a trained artifact | Entire model trained on **simulated** applicants (file header, line 8-9) — every output was synthetic-data-derived regardless of how real the *inputs* were | **Disabled** (call site commented out in consolidatedChancingService.js, module left intact for future re-training) |
| Recommendation portfolio bucketing (`/api/recommendations`) | `backend/src/services/recommendation/recommendationPipelineService.js` (`estimateAdmitChance`, lines 81-93, 307, 618) | 5 engineered features, no calibration | A second, independent, uncalibrated "chance %" shown alongside/instead of the main engine's number for the same student+college — could disagree with it | **Numeric percentage hidden from UI** (`src/pages/Colleges.tsx`); qualitative reach/target/safety bucket retained since it's still derived from the college's real acceptance rate where present |
| Masters competitiveness bands (`/api/masters/chances`) | `backend/src/services/masters/mastersChancingService.js` | GRE/GPA/work-exp/research inputs, per-pathway | Already correctly implemented as **bands, never a probability**, per an explicit prior product decision (documented in `docs/MASTERS_TRACK_PLAN.md`) — audited, no change needed | **No change — already compliant** |

## 2. Two fabrications found and fixed in `consolidatedChancingService.js`

### 2a. Missing acceptance rate silently defaulted to 50%

```js
// BEFORE (line 171):
const acceptRate = clamp(col.acceptance_rate ?? 0.50, 0.001, 0.999);
```

`college.acceptance_rate` is the single most load-bearing real input in the entire
formula — it sets the selectivity ceiling, the reach/target/safety label, and (via the
`scaledProbability = rawComposite * (acceptRate / 0.50)` step) directly scales the
displayed number. When the field was missing, the code silently assumed a "moderately
selective, 50% accept rate" college and produced a normal-looking percentage.

**Verified against the live DB: 6,319 of 8,500 institutions (74%) have no real
`acceptance_rate` in `canonical.mv_college_cards`.** This means the large majority of
chancing calculations shown to users were built on an invented number, indistinguishable
from a real one.

**Fix:** added an explicit `hasRealAcceptRate` check. When false, the function now
short-circuits to an honest "Insufficient Data" result (see §3) instead of computing
anything downstream of the fabricated rate.

### 2b. Zero-signal fallback invented a number instead of admitting uncertainty

```js
// BEFORE (line 516-518):
if (activeFactors.length === 0) {
  rawComposite = clamp(acceptRate * 0.5, 0.01, 0.75); // "Absolute fallback"
}
```

When literally no student/profile factor could be scored, the code still produced a
composite score (half of whatever acceptance rate it had, real or fabricated) rather than
declining to answer. In practice this rarely fired in isolation because §2a's fake 0.50
rate propagated into `rawSelectivity` (always non-null, 0.18 weight) — but it's the same
category of error and is folded into the same fix.

**Fix:** both conditions now feed one `insufficientData` flag; when true, the function
returns the honest state in §3 instead of any numeric probability.

## 3. Replacement state for "cannot compute" cases

Per the brief's instruction to replace unsupported probabilities with confidence
intervals, explainability, feature comparisons, profile strength analysis, and
uncertainty warnings, the function now returns, when data is insufficient:

```json
{
  "tier": "Insufficient Data",
  "category": "unknown",
  "probability": null,
  "chance_percentage": null,
  "chance_label": "Insufficient Data",
  "confidence": "Low",
  "probability_source": "none",
  "explanation": {
    "summary": "Not enough profile data to estimate admission chances for this school. Add your test scores, GPA, or extracurriculars to see an estimate.",
    "recommendedActions": ["Complete your academic profile (SAT/ACT, GPA) to unlock chancing for this school."]
  }
}
```

This is a real behavior change for any college missing `acceptance_rate` (74% of the
catalog) — those colleges will now show "Insufficient Data" instead of a percentage until
real acceptance-rate data is scraped in for them. **This is the correct, policy-compliant
behavior**, but it is also a large visible change in how much of the catalog shows a chance
number at all; flagging this explicitly as the single biggest behavioral consequence of
this patch, in case product wants to prioritize backfilling `acceptance_rate` coverage
before this ships broadly.

For colleges that **do** have a real acceptance rate but still fail specific student-side
checks, the existing `explanation.factors`, `probabilityRange` (low/high band), and
`recommendedActions` (already implemented, unchanged by this patch) continue to serve as
the explainability/confidence-interval/profile-strength-analysis layer the brief asks for.

## 4. What was intentionally NOT done (per explicit instruction)

- **No retraining.** `chancingModel.js` and its artifact are untouched; only the call site
  that fed its output to users is disabled.
- **No rebuild of the heuristic engine.** The 7-factor weighting in
  `consolidatedChancingService.js` is otherwise unchanged — it's a deterministic formula
  over real inputs when those inputs exist, which is a materially different risk category
  than a synthetic-trained model or a defaulted-to-fake-value calculation.
- **No masters chancing changes.** Already policy-compliant (bands, not probabilities).
- **No v2 architecture built.** Design only, in `chancing_model_v2_design.md`.

## 5. Verification performed

- Ran `consolidatedChancingService.runTests()` before and after the patch — all 3 existing
  test cases (real SAT/GPA/acceptance-rate inputs) produce **identical output**, confirming
  the fix only changes behavior on the missing-data path.
- Ran `chancingModel.test.js` (6/6 pass) — module itself untouched, tests unaffected.
- Manually verified the new insufficient-data path against a college with no
  `acceptance_rate` and an empty student profile: correctly returns `probability: null`,
  `tier: "Insufficient Data"`.
- Confirmed via direct query that 6,319/8,500 institutions lack `acceptance_rate`, so this
  patch has broad real-world reach, not just an edge case.
