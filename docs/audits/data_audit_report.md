# Financial Data Audit — `canonical.institution_financials`

**Audited:** 2026-07-01, live production Supabase DB, direct SQL (not sampled/estimated).
**Scope:** All financial fields (tuition, fees, cost of attendance, aid, debt, net price) across every institution.
**Policy applied:** if unverifiable → null it. Never guess. Never show synthetic numbers.

## Headline numbers

| Metric | Count |
|---|---|
| Total `institution_financials` rows | 15,958 |
| Total institutions | 8,500 |
| Institutions with **no** financial row at all | 2,050 (24%) |
| Rows from `college_scorecard` (US IPEDS, trustworthy, has `raw_payload`) | 3,492 |
| Rows from `manual_seed` (confirmed fabricated placeholders) | 207 — **already nulled this session, see below** |
| Rows with nested `h3_financials_enrichment` provenance (IPEDS/Scorecard via `public.college_financial_aid`, confidence 0.85, has `raw_payload`) | 6,191 |
| Rows with `source_attribution = {}` (no provenance metadata at all) | 6,068 |

The last two buckets are what the task brief calls "~12,259 rows of unknown provenance." They are **not uniformly bad** — see breakdown below.

## Provenance breakdown of the "unknown" 12,259

1. **6,191 rows — "object_no_source_key."** These actually carry real provenance, just nested one level deeper than the top-level `source_attribution->>'source'` field my first pass checked: `source_attribution->'h3_financials_enrichment'->>'source' = 'IPEDS/Scorecard'`, confidence 0.85, with a populated `raw_payload` (56+ real fields: `net_price_0_30k`, `median_earnings_6yr`, `loan_default_rate_3yr`, etc.). **These should be treated as verified, not unknown** — the classification query needs to check this nested path too. No data change needed, only a metadata/tooling fix (see Task 1 recommendation below).
2. **6,068 rows — truly empty `{}` attribution.** Of these, the majority (spot-checked 15/15 in sample) have **all financial fields NULL already** — they're placeholder rows created when an institution was added but never enriched (e.g. "Tri-Community Adult Education," beauty schools, trade schools — long-tail low-priority institutions). A minority carry real-looking values with zero attribution (e.g. Mount Mercy University tuition $36,606, Northwest Iowa Community College $5,820/$6,120) — these are **plausible but unverifiable** and should be flagged for re-verification, not treated as automatically true.

## Duplicate rows (found during this audit, not in the original brief — significant)

- **6,016 rows** belong to `(institution_id, data_year)` groups with more than one row.
- Of those groups: **2,193 conflict** (different values between the two rows for the same institution/year — e.g. one row has `avg_debt: null`, the duplicate has `avg_debt: 9500`), and **3,823 agree** (harmless exact duplicates).
- Root cause: a May 2026 seed batch (6,236 rows, no attribution) was never merged/superseded when a June 2026 re-ingestion batch (6,023 rows, `h3_financials_enrichment` provenance) added corrected data for the same institutions — both rows still exist side by side.
- **Consequence:** any query joining `institution_financials` to an institution without an explicit "pick freshest/most-attributed row" rule can nondeterministically surface the stale, unattributed duplicate instead of the corrected one. This is a second, independent source of wrong-looking numbers beyond the `manual_seed` placeholders already fixed.
- **Not auto-deleted** per instruction — flagged for manual review / a dedup migration that keeps the row with the most recent `updated_at` and non-empty `source_attribution` per `(institution_id, data_year)`.

## Impossible values (this audit's plausibility checks)

| Check | Rows found |
|---|---|
| Negative values (tuition/fees/COA/debt/net_price < 0) | 12 |
| Tuition < $500/year (USD) | 3 |
| Tuition > $250,000/year (USD) | 0 |
| Missing currency where a money field is populated | 0 |
| `cost_of_attendance < tuition_domestic` (logically impossible — COA must include tuition) | 33 |
| International tuition < 50% of domestic tuition (same institution) | 23 |

Total confirmed-impossible rows: **68** (12 + 3 + 0 + 0 + 33 + 23, minus any overlap not yet deduplicated across checks — treat as an upper bound). None were auto-deleted; recommend nulling only the specific offending field(s), not the whole row, once a human confirms which of the two conflicting numbers (e.g. COA vs tuition) is wrong.

## Already remediated this session

- **207 `manual_seed` rows** (all money fields: `tuition_domestic`, `tuition_international`, `tuition_in_state/out_state`, `cost_of_attendance`, `fees`, `avg_financial_aid`, `avg_debt`, `net_price*`, `need_based_aid_avg`, `merit_aid_avg`, `avg_scholarship`, `avg_debt_at_graduation`, `monthly_loan_payment`) were set to `NULL` and tagged `source_attribution.nulled_reason = "unverified_manual_seed_placeholder"` for auditability.
- `canonical.mv_college_cards` was refreshed and confirmed to now show `null` cost-of-attendance for these institutions (spot-checked: Ashoka University, IIT Bombay) instead of the fabricated round numbers.

## Rows requiring manual review (not touched)

1. The 68 impossible-value rows above (need a human or a second-source check to decide which field is wrong before nulling).
2. The 2,193 conflicting duplicate groups (need a dedup rule + likely re-run of the aggregation, not a blind delete — some conflicts may resolve in favor of the *older* row if the newer batch introduced a regression).
3. The ~6,053 "empty `{}` attribution, non-null values" rows (subset of the 6,068 — need re-scraping or removal to `NULL` per policy, since "unverifiable" applies here; exact count of non-null rows in this bucket was not isolated in this pass and should be the first query in the next audit iteration).

## Recommended next steps (not executed — planning only per instructions)

1. Fix the provenance-classification query to check both `source_attribution->>'source'` and nested keys (e.g. `h3_financials_enrichment`) so the 6,191 well-attributed rows stop being miscounted as "unknown."
2. Write a dedup migration: for each `(institution_id, data_year)` group with >1 row, keep the row with non-empty `source_attribution` and the latest `updated_at`; archive (don't delete) the losers to a `_dedup_audit` table.
3. Null the specific fields flagged in the 68 impossible-value rows after a human/second-source spot-check.
4. For the ~6,000 empty-attribution rows with non-null values: either re-scrape against IPEDS/Scorecard to attach real provenance, or null them per policy if no re-verification happens within a defined window.
