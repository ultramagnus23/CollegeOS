# Deadline / Requirement / GPA Seed — Coverage Plan (2026-07-17)

**Status: PLAN ONLY. No seeding has been run.** Per instructions, stopping here for sign-off.

## 0. Re-verified current state (the 07-12 audit doc is stale on this specific data — corrected below)

Live query against production, 2026-07-17:

| Metric | 07-12 audit said | Actual now |
|---|---|---|
| `canonical.institution_deadlines` rows | ~42 | **253** (198 distinct institutions) |
| `canonical.institution_requirements` rows | ~8 | **268** (268 distinct institutions, 1/institution) |
| GPA field, undergrad | `median_gpa_admitted` in `us_admissions_profile`, 0% populated | **That column does not exist.** `us_admissions_profile` has 0 rows and no GPA column at all (only `sat_required`/`sat_range`/`act_required`/`act_range`/`common_app_supported`/`fafsa_required`/`css_profile_required`). The real, already-populated-if-anywhere GPA field is `canonical.institution_admissions.gpa_avg` (+`gpa_25`/`gpa_75`/`gpa_scale`) — **428/8,280 rows (5.2%) already populated.** This plan targets that column, not the nonexistent one. |
| `ml_training_data` | 1 row, out of scope | Confirmed still 1 row, untouched. |
| Institutions with real admissions stats | ~800 | **1,233** with acceptance_rate + a real SAT figure (mostly US, since SAT is a US-specific metric); **1,979 US institutions** have acceptance_rate populated at all (a fairer "has credible data" filter for the US cohort); UK 29, Canada 19 have acceptance_rate populated (SAT doesn't apply to them, so the SAT-inclusive count undercounts them). |

**Also stale/incorrect in the task brief itself** (flagging per deliverable 5 — these aren't a criticism of the brief, just corrections needed before code can be written against them):
- `canonical.institution_requirements` does **not** have a `requirement_category`/`requirement_name`/`requirement_value` EAV shape. The real schema is a flat table with ~50 typed columns (`sat_policy`, `toefl_required`, `essays_required`, `teacher_recommendations_required`, etc.) — one row per institution per cycle/degree_level/applicant_type. This plan follows the real schema (and the existing `usOfficialRequirements.js` adapter that already writes to it), not the category/name/value shape described in the brief.
- Neither `institution_deadlines` nor `institution_requirements` has a `source_attribution` JSONB column. Both use **discrete columns** instead: `source_url`, `source_domain`, `source_type` (CHECK-constrained to `official|common_app|ucas|government|aggregator`), `parser_name`, `parser_version`, `last_verified`, `confidence_score`. This plan populates those real columns (every row still carries a real source URL + verification timestamp — the non-negotiable rule survives, just via existing columns instead of an invented JSONB one).

## 1. Existing infrastructure — do not rebuild, extend

Three working scraper adapters already exist under `backend/src/scrapers/adapters/`, all following the same non-negotiable posture the brief requires (primary source, live fetch, skip-don't-fabricate, full provenance columns):

| Adapter | Target table | Method | Current target list size | Ceiling |
|---|---|---|---|---|
| `usOfficialDeadlines.js` | `institution_deadlines` | Per-school HTML regex on each admissions page | 31 hand-verified schools | Low — one regex per site design, doesn't scale past hand-curated lists |
| `usOfficialRequirements.js` | `institution_requirements` | Same, for requirements signals | 90 hand-verified schools | Low, same reason |
| `commonDataSetDeadlines.js` | `institution_deadlines` (+ ED/EA admit-rate bonus fields) | PDF text extraction on the **Common Data Set** — a standardized annual self-reported survey nearly every US 4-year institution publishes, same question numbering across all of them (C21=ED closing date, C22=EA closing date, C14=RD closing date) | 63 schools (sourced via the College Transitions CDS repository) | **High — one parser generalizes across hundreds of schools instead of one regex per site.** This is the real scale lever. |

**This plan's main mechanism is extending `commonDataSetDeadlines.js`'s `TARGETS` list**, not writing new adapters. The two HTML adapters remain useful as a fallback for schools with no locatable CDS PDF.

**Gap the CDS adapter doesn't cover yet, needs a small extension, not a new adapter:** the CDS's C7/C9/C10 sections publish requirement signals (recommendation letters, essays, test policy) and, at some schools, entering-class GPA — `extractDeadlines`/`extractApplicationRates` in that file only extract deadline dates and ED/EA rates today. Adding `extractRequirements`-equivalent logic to pull from the same already-fetched CDS PDF text (no new fetching) is the efficient path to filling `institution_requirements` and `institution_admissions.gpa_avg` from the same 1,000+ PDFs, rather than running three separate scrapes per school.

## 2. Country-specific sourcing reality

- **US**: Common Data Set is the standardized, scalable primary source (per §1). This is where the bulk of the 1,000–2,000 target should come from.
- **UK**: No CDS equivalent. But UK undergraduate deadlines are **centrally standardized by UCAS** — nearly all UK universities share the same 2–3 fixed deadlines per cycle (mid-January equal-consideration deadline, late-June extra deadline; Oxbridge + most medicine/dentistry/veterinary courses share a mid-October deadline). This means UK deadline coverage is a **small, high-leverage, mostly-one-time lookup** (the handful of UCAS fixed dates + the short list of Oct-15 exception courses/universities), not a 175-school scrape. Requirements (UCAS Personal Statement, references, predicted grades) are similarly standardized across UCAS-member institutions. GPA has no UK equivalent (UK uses A-level/IB predicted grades, not GPA) — leave null, do not force-map.
- **Canada**: No centralized survey. Each institution publishes its own deadlines/requirements (closer to the US HTML-adapter pattern than the CDS pattern). Only 258 CA institutions total, 19 with any admissions stats at all — small, per-school HTML-adapter-style effort, added to the plan at low priority given the small pool.

## 3. Undergrad target list — proposed composition (target: ~1,200–1,500 complete profiles)

Prioritized per the brief's own logic (finish institutions with existing credible data first, then US/UK/CA breadth for the Indian-applicant user base):

1. **~1,000–1,100 US institutions** with existing `acceptance_rate` populated (1,979 candidates identified above) **that have a locatable, parseable CDS PDF.** Sourcing is per-school lookup against the College Transitions CDS repository (same source the existing 63-school list already uses) — this is real, one-at-a-time research work, not automatable in bulk (each entry is a hand-verified Drive file ID or direct URL, per the existing file's own methodology). Realistic sprint throughput needs to be estimated empirically from the first ~100-school batch (see checkpoint plan, §5) before committing to a final count — flagging this uncertainty now rather than promising a number I haven't tested.
2. **~150–250 US institutions** without a locatable/parseable CDS (JS-rendered sites, 403 bot-blocks, non-standard CDS format) via the existing `usOfficialDeadlines.js`/`usOfficialRequirements.js` HTML adapters, extending their `TARGETS` lists the same hand-verified way the existing 31/90 entries were built.
3. **~29 UK institutions** with existing acceptance_rate data get the UCAS fixed-deadline treatment (§2) — likely closer to 1 day of work than a multi-week scrape, given how few distinct deadline values actually exist across the whole UK system.
4. **~19 Canadian institutions** with existing acceptance_rate data via per-school HTML lookup, lowest priority of the four given the small pool size.

This totals **~1,200–1,400** complete undergrad profiles if the CDS-locatability rate on batch 1 holds up — genuinely an estimate pending the first checkpoint, not a promise.

## 4. Masters track

Current state: `canonical.masters_programs` has **510 programs across only 74 distinct institutions** (extremely thin — matches the "greenfield" status already on record in memory). GPA fields (`min_gpa`, `min_gpa_scale`, `avg_gpa`) exist and are ready; only 14/510 rows have `min_gpa` populated today.

**No CDS-equivalent standardized survey exists for graduate admissions** — this is a genuinely harder sourcing problem than undergrad. Per-program (not just per-institution) sourcing is required since deadlines/GPA/GRE requirements vary by department within the same university. Given the current base is only 74 institutions, the realistic scope for this sprint is:
- Deepen the **existing 74 institutions'** MS/MBA program rows first (per the brief's "same institution set" prioritization) — add deadlines/min_gpa to programs that already exist but are missing them, sourced from each program's own official page.
- Do **not** attempt to expand to hundreds of new institutions' masters programs in the same sprint — the per-program (not per-institution) sourcing cost is materially higher than undergrad, and 74→hundreds of new institutions × multiple programs each is a much bigger lift than the brief's framing ("prioritize MS/MBA programs at the same institution set above") suggests it intends. Flagging this scope tension explicitly rather than silently either overpromising or underdelivering.

## 5. Checkpointing (per the brief's own requirement)

After every ~100 institutions seeded: pull a random sample of 5, manually re-fetch the same official source/CDS PDF, and confirm the seeded deadline_date/requirement fields/GPA match. Report the sample in the same message as the batch. First batch's CDS-locatability rate (how many of the first 100 targeted US institutions actually have a findable, parseable CDS) determines whether §3's ~1,200–1,400 estimate needs revising up or down — this will be reported at the first checkpoint, not assumed.

## 6. What I could not verify / open decisions before starting (per deliverable 5)

- **The exact 1,000–2,000 CDS Drive-file lookups are unresearched** — I have not gone and found 1,000 individual CDS PDF URLs. That is the bulk of the actual sprint's manual work, and this plan intentionally stops short of doing it, per the "don't execute unattended" instruction.
- **GPA column decision**: this plan targets `institution_admissions.gpa_avg` (real, existing, partially populated) instead of the brief's named `us_admissions_profile.median_gpa_admitted` (doesn't exist). Confirm this redirect is acceptable before I start writing to it — if the intent was specifically a new `us_admissions_profile` field, that needs a migration first (out of scope for a "no schema changes" data-seed task unless you want to authorize one).
- **UCAS-deadline approach for UK** is a much smaller task than a 175-school scrape — flagging so you can confirm the reduced UK scope is fine rather than assuming more UK-specific work was wanted.
- **Masters scope tension** (§4) — the brief's "same institution set" instruction and the 1,000–2,000 headline target are in tension for the masters track specifically, given only 74 institutions currently exist there. Need your call on which wins.

Awaiting sign-off before running any actual seeding.
