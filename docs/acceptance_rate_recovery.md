# Acceptance Rate Recovery — 217 Nulled Rows

**This document supersedes an earlier draft that reached the wrong conclusion for 204
of the 217 rows. The correction and its evidence are documented below rather than
silently overwritten, since the mistake and the fix are both worth keeping visible.**

## Original (incorrect) classification

The first pass classified the 217 nulled rows as:
- 12 rows: Case A (real value in `raw_payload`, corrupted at the column level) — restored.
- 1 row: Case B (unrecoverable, no value anywhere).
- **204 rows: Case B ("fabricated," leave null)** — because they were tagged
  `source: 'manual_seed'`, the same label used by the actually-fabricated 207
  `institution_financials` tuition rows nulled in an earlier session.

**This 204-row classification was wrong.** `'manual_seed'` is being reused in this
codebase for two unrelated things, and the first pass conflated them.

## The correction

Cross-referencing the 204 rows' institution names directly against
`backend/migrations/129_seed_global_enrichment.sql` showed they are **real,
differentiated, hand-curated acceptance rates** for actual named institutions (e.g. real
IIT/UK-university/ANU-tier rates), written by that migration in a 0-100 scale — not
placeholder values. Evidence:

1. **Exact institution-name matches** against migration 129's `VALUES` tuples (e.g.
   `('Cardiff University','GB',80.0,...)`, `('Indian Institute of Technology Bombay','IN',1.0,...)`).
2. **Differentiated, non-round values** (1.0, 1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 2.0, 2.5...
   for IITs; 70, 72, 74, 76, 78, 80 for UK universities) — real per-institution variation,
   not a uniform placeholder like the $12,000-for-everyone tuition fabrication pattern.
3. **A distinct, consistent fingerprint**: all 204 rows carry `confidence: 0.9` exactly,
   matching migration 129's hardcoded literal `'{"source":"manual_seed","confidence":0.9}'`.
   The earlier, genuinely-fabricated `institution_financials` rows carried `confidence:
   0.85` — a different number, confirming these are two unrelated uses of the same
   generic `'manual_seed'` label, not the same incident.
4. Migration 129's own header comment states: *"Data is real (QS 2024 ranks, official
   tuition, real acceptance rates)."*

## Corrected action taken (with explicit user sign-off)

Given this was a correction of a previous conclusion, and a blanket `/100` transform on
this data had already been blocked once earlier in this session as inconsistent with
"never estimate," I presented the new evidence to the user before acting rather than
re-attempting the blocked operation unilaterally. The user approved restoration given
the concrete proof.

Restored via a **name+country cross-reference against the actual migration source file**
(not a blind `/100` on the stored value, since the value itself had already been nulled
and had nothing left to divide) — parsed all 166 `(name, country, acceptance_rate)`
tuples out of `129_seed_global_enrichment.sql`'s admissions `VALUES` block, matched each
against `canonical.institutions` by exact `canonical_name` + `country_code`, and set
`acceptance_rate = migration_value / 100.0` only on rows still carrying this session's
`cleanup_reason` tag and still `NULL`.

```
parsed tuples from migration 129: 166
restored_rows: 204
tuples_with_no_matching_nulled_row: 4
still_null_after_restore: 1
```

166 tuples restored 204 rows because several of these institutions are among the **42
duplicate institutions** found in `institution_merge_plan.md` (e.g. Cardiff University,
University of Glasgow) — each duplicate UUID had its own nulled admissions row, and the
name+country join correctly matched and restored both. 4 tuples had no corresponding
nulled row (likely institutions whose value happened to already fall in-range or weren't
in the flagged set for another reason). **1 row remains genuinely unrecoverable** (the
same one identified in the original pass — no value anywhere to restore).

`source_attribution` on the restored rows now carries `restored_from: "migration_129_source_reparse"`
plus a full `restore_reason` for auditability. `mv_college_cards` refreshed. Total valid
(0-1 range) `acceptance_rate` rows in `institution_admissions`: **4,044**.

## A related boundary-case bug found (NOT fixed — flagged for your decision)

While verifying the restore, found that **2 rows were never part of the flagged 217 in
the first place** and still hold their original, wrong value: `Indian Institute of
Technology Bombay` and `Peking University` both have `acceptance_rate = 1.0` in the live
DB right now. Migration 129 intended `1.0` to mean **1.0%** (i.e., `0.01` as a fraction —
consistent with IIT Bombay's real ~1% acceptance rate) — but `1.0` also happens to be a
syntactically "valid" 0-1 fraction (100%), so the original out-of-range detection
(`acceptance_rate > 1`) didn't catch it, since `1.0` is not greater than `1`. This is a
**pre-existing bug that predates this session's cleanup and was never introduced by it**
— just newly discovered while verifying the fix above.

**Update 2026-07-02: fixed, with explicit authorization.** Both rows corrected to `0.01`
using the identical migration-129 cross-reference method, tagged
`restored_from: "migration_129_boundary_case_reparse"`. Verified live:
`Indian Institute of Technology Bombay` and `Peking University` both now show
`acceptance_rate = 0.010`. `mv_college_cards` refreshed.

## Lesson

`'manual_seed'` is an overloaded provenance label in this codebase covering both (a)
genuinely fabricated placeholder data and (b) real hand-curated data that happens to be
in the wrong unit scale. Per `data_provenance_design.md`'s recommendation, once the
`verification_status` scalar column is populated going forward, these two situations
should get distinct values (e.g. `estimated`/`deprecated` for (a) vs. `user_supplied` or
a real `scraped`-adjacent status for (b)) so a future audit doesn't have to re-derive
this distinction by hand from migration source code again.
