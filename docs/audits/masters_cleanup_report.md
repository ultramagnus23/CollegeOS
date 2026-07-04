# Masters Programs Data Cleanup Report

Date: 2026-07-01
Scope: `canonical.masters_programs` (648 rows) and related tables (`masters_program_pathways`, `masters_pathways`, `masters_program_deadlines`, `masters_admission_datapoints`, `masters_scrape_log`).

## Summary

| Issue | Rows affected | Action |
|---|---|---|
| Synthetic `admission_difficulty` baseline (50.0 with no real inputs) | 643 / 648 | **Nulled** |
| Synthetic `funding_attractiveness` baseline (derived from all-null/false inputs) | 453 / 648 | **Nulled** |
| Impossible `min_gpa` (exceeds `min_gpa_scale`) | 3 | **Nulled** (field only) |
| Duplicate programs (institution + program + degree_type) | 0 | None found |
| Currency/country mismatches | 12 flagged | **Not touched** — reported only |
| Range violations (GRE, GPA, acceptance_rate, GMAT, TOEFL/IELTS, rates, cohort_size, program length, salaries, etc.) | 0 | None found — data was clean on all other checked fields |
| `roi_score`, `career_outcome_score`, `research_fit_score` | all NULL (648/648) | No synthetic values present; not derived yet |

## 1. Key fix: synthetic score nulling (the primary objective)

`scraper/sources/masters_enrichment.py::compute_admission_difficulty()` starts from a hardcoded `score = 50.0` baseline and only adjusts it if `acceptance_rate`, `avg_gpa`, or `avg_gre_quant` are non-null. Verified in the live DB:

- **643 of 648 rows** had `admission_difficulty` non-null, and **100% of those 643** were exactly `50.0` — confirming every single non-null value in this column was the raw, unmodified baseline with zero real signal behind it (all three source inputs were NULL for every one of these rows).
- `compute_funding_attractiveness()` starts from `score = 0.0` and only adds points if `funding_availability`, `ta_available`, `ra_available`, `median_stipend_usd`, or `full_funding_probability` are set. **453 of 648 rows** had `funding_attractiveness` non-null while all five of those inputs were null/false — i.e., a content-free `0.0` masquerading as a real "low funding" signal.

SQL executed:

```sql
UPDATE canonical.masters_programs
SET admission_difficulty = NULL, updated_at = NOW()
WHERE admission_difficulty IS NOT NULL
  AND acceptance_rate IS NULL AND avg_gpa IS NULL AND avg_gre_quant IS NULL;
-- 643 rows updated

UPDATE canonical.masters_programs
SET funding_attractiveness = NULL, updated_at = NOW()
WHERE funding_attractiveness IS NOT NULL
  AND funding_availability IS NULL
  AND (ta_available IS NULL OR ta_available = false)
  AND (ra_available IS NULL OR ra_available = false)
  AND median_stipend_usd IS NULL
  AND full_funding_probability IS NULL;
-- 453 rows updated
```

Post-fix state: `admission_difficulty` non-null count = **0** (all 643 were synthetic; none had any real backing input, so all were cleared). `funding_attractiveness` non-null count = **190** (the remaining 190 rows have at least one real input — e.g. a known `funding_availability` category, `ta_available=true`, or a real stipend figure — and were left untouched since their scores are attributable to actual data, not the pure baseline).

## 2. Impossible `min_gpa` values (nulled)

Found 3 rows where `min_gpa > min_gpa_scale`, which is mathematically impossible (e.g., "60 out of a 10-point scale"):

| Institution | Program | min_gpa | min_gpa_scale |
|---|---|---|---|
| University of Oxford | MSt in Ancient Philosophy / MSt in Philosophy of Physics / DPhil | 60.00 | 10.00 |
| University of Washington | Molecular and Cellular Biology | 20.00 | 10.00 |
| University of Melbourne | Master of Applied Econometrics | 500.00 | 10.00 |

These are almost certainly scraper unit/decimal errors (e.g., a percentage or misplaced decimal captured as a raw GPA). Only `min_gpa` was nulled — `min_gpa_scale` (10.00, a legitimate scale) and all other fields on these rows were left intact.

```sql
UPDATE canonical.masters_programs
SET min_gpa = NULL, updated_at = NOW()
WHERE min_gpa IS NOT NULL AND min_gpa_scale IS NOT NULL AND min_gpa > min_gpa_scale;
-- 3 rows updated
```

## 3. Duplicate check

Grouped by `(institution_name, program_name, degree_type)` — **no duplicates found**. All 648 rows are unique on this key. No deletions performed.

## 4. Currency / unit consistency — flagged, not touched

Checked `tuition_currency` vs `institution_country` for all rows with both fields populated:

- All EU/UK/India/Singapore/Austria rows use the expected native currency (EUR, GBP, INR, SGD) **except one**:
  - **Sciences Po**, `institution_country = 'GB'`, `tuition_currency = 'EUR'`, tuition_total = 23000. Sciences Po is a French institution (Paris) — the `institution_country` value of `GB` appears to be a data error (should be `FR`), while the `EUR` currency is actually correct for a French school. **Not fixed in this pass** — correcting `institution_country` is an identity/geography fix outside the scope of a currency-consistency cleanup and needs owner confirmation before altering location data used elsewhere (rankings, filters, contract fields).
- 3 Australian programs and 2 Canadian programs list `tuition_currency = 'USD'` instead of the local currency (AUD/CAD). This is not necessarily wrong — many international programs quote costs in USD for prospective foreign students — so these were **left untouched** and are flagged for manual review only.
- No evidence of per-semester-vs-per-year tuition confusion: a self-join checking for identical `tuition_total` values across rows at the same institution with differing `program_length_months` returned **zero matches**, so no affirmative "wrong multiplier" cases were found to null.

## 5. Range/validity checks that came back clean (no action needed)

Checked and found **zero violations** for: negative tuition/stipend/grant/earnings/debt/salary values, GRE Q/V outside 130–170 (and outside 200–800 old scale), GRE AWA outside 0–6, GMAT outside 200–800, `avg_gpa` outside 0–4, `acceptance_rate`/`yield_rate`/`graduation_rate`/`attrition_rate`/`placement_rate`/`funding_probability`/`full_funding_probability`/`h1b_sponsorship_rate` outside 0–1, `phd_placement_pct`/`faculty_placement_pct`/`startup_outcomes_pct` outside 0–100, `cohort_size` ≤ 0, `program_length_months`/`time_to_degree_months` ≤ 0, `salary_25th > salary_75th`, `min_toefl`/`min_ielts` out of range, negative `avg_work_exp_years`/`avg_publications`/`avg_research_years`/`lor_count`, and derived scores (`admission_difficulty`, `funding_attractiveness`, `career_outcome_score`, `research_fit_score`, `roi_score`) outside 0–100.

`roi_score`, `career_outcome_score`, and `research_fit_score` are **100% NULL (0/648)** across the table — they are defined columns but not yet populated by any pipeline; no synthetic-data issue exists there because nothing has been written to them.

## 6. Materialized view refresh

`REFRESH MATERIALIZED VIEW CONCURRENTLY canonical.mv_masters_program_cards` was run after all UPDATEs above so the corrected (now-NULL) `admission_difficulty`/`funding_attractiveness`/`min_gpa` values propagate to the API-facing view.

## 7. Remaining / follow-up work (out of scope for this pass)

1. **Fix `scraper/sources/masters_enrichment.py` itself.** `compute_admission_difficulty()` and `compute_funding_attractiveness()` must return `None` (not a baseline number) when all real inputs are null, instead of starting from a hardcoded `50.0` / `0.0` baseline. Otherwise the next scrape run will regenerate the exact same synthetic values this cleanup just removed. This is a code change, not a DB cleanup, and was intentionally left out of scope here.
2. **Sciences Po `institution_country` mismatch** (GB vs the correct FR) needs a decision from a data owner before correcting, since it may affect country-based filters/rankings elsewhere in the app.
3. **AU/CA USD-denominated tuition rows** (5 total) should be manually verified against source pages to confirm whether USD is an intentional international-student price or a currency-tagging bug.
4. `roi_score`, `career_outcome_score`, and `research_fit_score` remain fully unpopulated (648/648 NULL) — migration 127 added these columns but no pipeline currently computes them.
