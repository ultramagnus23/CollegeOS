# COLLEGE_DATA_GAPS.md

_Verified against `canonical.mv_college_cards` (8,244 institutions) + `college_admissions_stats` on 2026-06-22. Counts are real._

## Field coverage on `canonical.mv_college_cards` (of 8,244)

| Field | Non-null | Coverage | Gap |
|---|---:|---:|---|
| `popularity_score` | 8,244 | 100% | ⚠️ present but **all 0** (no real signal) |
| `median_start_salary` | 5,136 | 62% | moderate |
| `cost_of_attendance` | 3,137 | 38% | large gap |
| `acceptance_rate` | 1,945 | 24% | **large gap** |
| `tuition_international` | 1,571 | 19% | large gap |
| `sat_50` | 1,109 | 13% | **large gap** |
| `act_50` | 943 | 11% | **large gap** |
| `global_rank` | 298 | 4% | **severe gap** |
| `median_gpa_admitted` (stats table) | 0 | 0% | **absent — no source** |

## What this blocks

- **Chancing** needs `acceptance_rate` + a test median → only ~800–1,100 colleges are fully model-eligible; the rest fall back to the heuristic or can't be chanced well.
- **Affordability filtering / financial fit** is partial (cost 38%, intl tuition 19%).
- **Rankings discovery** is thin (`global_rank` 4%); selectivity is used as a proxy.
- **GPA-based fit** is impossible from data (0%); the model uses a simulated GPA prior.

## Fill plan (primary + open sources only)

| Gap | Source | Method | Notes |
|---|---|---|---|
| acceptance_rate, SAT/ACT, cost, salary, completion | College Scorecard API | `refreshScorecard.js --batch=1000` daily (rolling) | ✅ working; key present; ~6,200 US schools refresh in ~a week |
| `popularity_score` | engagement/derived | `backend/scripts/rankings/backfillPopularityScore.js` | makes the column a real signal (currently all 0) |
| `median_gpa_admitted` | none open | — | **No open source.** Keep simulated GPA prior + disclose. Do not invent. |
| global_rank (non-commercial) | NIRF (India), ARWU (open) | adapter | commercial (QS/THE/US News) excluded by policy |
| international tuition / non-US stats | university pages / open feeds | per-region adapters | slower, primary-source |

## Honest limit

GPA medians and most international (non-US) admissions stats have **no open bulk source**. Scorecard fills the US gaps well; non-US coverage requires per-institution primary scraping (slow) and will stay partial. We will not fabricate any of these values.
