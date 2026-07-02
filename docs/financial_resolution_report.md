# Financial Duplicate Resolution Report

Executed live against production per explicit authorization, using the priority order:
`government_verified > verified > scraped > imported > unknown > deprecated`, tiebreak 1
= row completeness (count of non-null money fields), tiebreak 2 = latest
`last_verified_at`. Never hard-deleted — every losing row is archived in full before
removal from the live table.

## Rows merged (same-institution duplicates, `canonical.institution_financials`)

- **Total duplicate groups found**: 6,016 `(institution_id, data_year)` pairs with >1 row.
- **Auto-resolved**: 6,014 groups. Winner kept in place (unchanged), loser archived + deleted.
- **Archived**: 6,014 rows, in `canonical.institution_financials_merge_archive` (full row
  snapshot, `archived_at`, `archive_reason`, `winning_row_id` for traceability).
- **Deleted from the live table**: 6,014 rows (the losers only — winners were never touched).
- Live `institution_financials` row count: 15,958 → 9,944 immediately after this step
  (later reduced further by the institution-merge conflict resolution below).

## Rows requiring manual review

**2 groups, untouched, both rows still live.** These are genuinely ambiguous: within each
group, every row has the *same* `verification_status` priority, the *same* completeness
score, and the *same* `last_verified_at` (including both `NULL`) — there is no signal in
the data to break the tie without guessing, so per the "never guess" policy they were
left exactly as found rather than resolved arbitrarily.

| institution_id | data_year |
|---|---|
| `f643bd37-a8a3-43f2-991f-c9370c7e7c5d` | 2024 |
| `29a3e100-36b6-4542-9a5f-5fcd6b474f1d` | 2024 |

## Cross-institution conflicts (part of the institution-merge step, same priority rule)

Applying the same resolution to the 42 duplicate-institution pairs' `institution_financials`,
`institution_admissions`, and `institution_rankings` rows (the tables that carry
`verification_status`):

| Table | Conflicting pairs resolved | Non-conflicting rows reassigned to survivor |
|---|---|---|
| `institution_financials` | 42 | (see combined total below) |
| `institution_admissions` | 42 | 0 (no additional non-conflicting admissions rows found) |
| `institution_rankings` | 43 | 0 |

Total additional rows archived from this step: 42 (financials) + 42 (admissions) + 43
(rankings) = 127, all in their respective `_merge_archive` tables with the same
traceability shape.

`institution_completeness` has no `verification_status` column (it's a derived score, not
raw source data) — for each of the 42 pairs, the older institution's completeness row was
archived (not conflict-resolved) and the survivor's own row left as-is, since a completeness
score should be recomputed post-merge rather than picked between two stale values.

## Final live row count

`canonical.institution_financials`: **9,902** (down from the original 15,958 — includes
both the same-institution dedup and the cross-institution merge conflict resolution).

## Verification performed

- Post-run query confirms exactly 2 remaining duplicate groups (matches the "manual
  review" count above — not silently more).
- Archive table row counts checked directly (6,014 + 42 = 6,056 for financials archive)
  and match the operation counts logged during execution.
- `mv_college_cards` refreshed after all changes.

## Not done in this pass

`mv_college_cards` does not yet filter on `deprecated_duplicate_of` — this only affects
the separate institution-merge step below (deprecated institution *rows*, not financial
data), documented in `institution_merge_report.md`.
