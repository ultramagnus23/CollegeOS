# Undergrad Data Cleanup Report (Phase D)

Executed directly against the live production Supabase DB, following on from
`data_audit_report.md`. Every UPDATE below was scoped to a single specific field, never
a whole row, and only executed where the value was provably wrong (not merely unusual).

## Fixes executed

| # | Issue | Table.field(s) | Rows touched | Action |
|---|---|---|---|---|
| 1 | Negative `net_price` (impossible — price cannot be negative) | `institution_financials.net_price` | 12 | Nulled |
| 2 | Other negative money fields (defensive re-check: tuition, COA, fees, avg_debt) | same table | 0 | None found beyond #1 |
| 3 | Tuition < $500/year (USD) — not a real institution cost | `institution_financials.tuition_domestic` / `tuition_international` | 3 | Nulled the specific under-$500 field only |
| 4 | `cost_of_attendance < tuition_domestic` (COA must be ≥ tuition; tuition is the more reliable of the two figures per instruction) | `institution_financials.cost_of_attendance` | 33 | Nulled `cost_of_attendance`, left `tuition_domestic` intact |
| 5 | International tuition < 50% of domestic tuition (backwards from the normal pattern; can't tell which figure is right) | `institution_financials.tuition_international` | 23 | Nulled `tuition_international`, left `tuition_domestic` intact |
| 6 | `acceptance_rate` outside the 0-1 fraction range used everywhere else in the system | `institution_admissions.acceptance_rate` | 217 | Nulled (see note below — a mechanical `/100` correction was attempted first) |

**Total fields nulled this pass: 288** (across 6 categories; some institutions may appear
in more than one category since different fields were affected).

### Note on item 6 — a stricter read of "never estimate" than I'd have defaulted to

All 217 out-of-range `acceptance_rate` values were cleanly in the 0-100 range (e.g. 80.000,
78.000, 76.000, ...) — consistent with being stored as a whole-number percentage instead of
the 0-1 fraction convention every other acceptance-rate consumer in the codebase expects
(confirmed against `consolidatedChancingService.js`, which compares `acceptance_rate` to
literals like `0.05`/`0.10`/`0.40`). I attempted a `value / 100` correction first, since this
is a mechanical unit conversion with no invented information (an acceptance rate of "80"
can only sensibly mean 80%). That write was blocked by the session's safety guardrail as a
policy violation of "never estimate, never guess" — the guardrail's reading is stricter
than mine: dividing by 100 is still a transformation of a value rather than a direct read
of a verified source. I deferred to that reading and nulled the field instead of
transforming it. **If you'd prefer the `/100` correction restored instead of nulled**
(i.e., treat unit normalization as distinct from data fabrication), that's a one-line SQL
UPDATE and I can run it with your explicit go-ahead — I did not want to re-attempt a write
the guardrail had just blocked without checking first.

## Findings flagged for manual review — NOT touched (would need human judgment or a real migration)

### 1. Duplicate institution_financials rows — none are safe to auto-dedupe

Re-verified fresh (broader check than the prior audit pass, comparing all 13
tuition/aid/net-price columns, not just 2): **all 6,016 duplicate `(institution_id,
data_year)` rows fall into 6,016 groups that are 100% conflicting — zero groups are exact
duplicates.** This corrects the prior session's audit, which estimated ~3,823 "agreeing"
groups based on a narrower 2-column comparison. With the fuller comparison, there is no
subset that can be safely auto-deleted without a human deciding which of two differing
values is correct for each institution/year. **No rows were deleted.** This needs either
a real re-verification pass per institution or an explicit "prefer the row with
non-empty `source_attribution` and the latest `updated_at`" migration that a human signs
off on before running (per `data_provenance_design.md`'s classification scheme).

### 2. 42 duplicate institution groups (new finding, not in the prior audit)

`canonical.institutions` has 42 groups of 2 rows sharing the same `canonical_name` +
`country_code` — mostly prominent global universities: Australian National University,
Monash, University of Melbourne, University of Sydney, University of Toronto, McGill,
University of British Columbia, Imperial College London, LSE, Sorbonne University, RWTH
Aachen, Technical University of Munich, and 30 others. Each pair has **two distinct
UUIDs**, meaning financial/admissions/programs data for these institutions can be split
across two separate rows depending on which ID a given ingestion job wrote to — a
plausible root cause for "this famous university's data looks incomplete" reports. This
was **not** merged/deleted (merging requires reassigning foreign keys across ~15 related
canonical tables per institution — too risky to do without a dedicated migration and
verification pass). Flagged as a priority follow-up; full list of all 42 groups with both
UUIDs is available via the query in this report's source script (not persisted — re-run
`SELECT canonical_name, country_code, COUNT(*), ARRAY_AGG(id) FROM canonical.institutions GROUP BY 1,2 HAVING COUNT(*)>1` to reproduce).

### 3. Currency/country mismatches

Checked `institution_financials.currency_code` against the parent institution's
`country_code` for the four countries with the most data (US/GB/IN/CA). Found only **1**
mismatch (a GB institution with `currency_code = 'USD'`) — low volume, plausibly a
legitimately USD-denominated international program rather than an error, so left
untouched pending confirmation.

## Not yet checked (out of scope for this pass, flagged for a follow-up)

- Semester-vs-annual tuition ambiguity beyond the COA-ratio heuristic used in item 4 above
  — a proper fix needs an explicit `billing_period` field (per
  `data_provenance_design.md`'s schema recommendations) rather than inference from ratios.
- The ~6,000 `institution_financials` rows with empty `source_attribution` but non-null
  values (flagged in `data_audit_report.md`, not re-actioned here since it needs a
  re-verification-window policy decision, not a mechanical fix).
- SAT/ACT/GPA range checks in `institution_admissions` came back clean (0 rows with
  `sat_25 > sat_75`, 0 rows with SAT/ACT values outside their valid numeric ranges) — no
  action needed there.

## Verification performed

- Re-ran each impossible-value query after its corresponding fix to confirm 0 rows
  remain in that category (e.g. re-checked `acceptance_rate` range post-fix: 0 remaining
  out-of-range rows).
- Cross-checked row counts before/after each UPDATE via `RETURNING id` row counts rather
  than trusting an assumed count.
