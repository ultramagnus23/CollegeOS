# Data Guardrails — `verified_data_guards.ts`

Regression-prevention module built after this session's data-integrity cleanup. Goal:
make it structurally harder for fabricated data to silently re-enter the database the
way it did before (chancing model trained on simulated applicants, a fabricated 50%
default acceptance rate, 207 fake tuition rows, 1096+ fabricated masters derived-scores).

**Two independent implementations exist, one per runtime, since the backend and
frontend are different languages:**

- **`backend/src/utils/verifiedDataGuards.js`** (CommonJS) — the canonical, enforced
  implementation. The backend (`backend/src/`) is plain Node/Express CommonJS with no
  `tsconfig.json` and no TS build step, and the real write paths this module must guard
  (`consolidatedChancingService.js`, `College.js`) live there — so the primary
  implementation belongs where it can actually be `require()`'d by those files without a
  build step. 14/14 Jest tests pass (`backend/tests/unit/verifiedDataGuards.test.js`).
- **`src/lib/verified_data_guards.ts`** (TypeScript) — a parallel implementation for the
  frontend, used to validate API *responses* client-side (e.g. flagging low-confidence
  data before rendering it). This is a **separate, independently-written implementation
  of the same spec, not a re-export** of the backend module — the two must be updated
  together by hand whenever the fabricated-value reference list changes, since there is
  no shared build step between a CommonJS backend and a Vite/TS frontend that would let
  one `import` the other. 7/7 inline tests pass (run via
  `npx tsx -e "require('./src/lib/verified_data_guards.ts').runInlineTests()"`).

**Neither implementation is wired into an actual write path yet** — as of this writeup,
grepping the backend for `validateBeforeWrite` outside the module's own file returns no
call sites. Both are ready-to-use, tested reference implementations; wiring them into
`consolidatedChancingService.js`'s writes, `College.js`, and a Python port for
`masters_enrichment.py` remains follow-up work (see "Where this is NOT yet wired in").

## What it does

`validateBeforeWrite(record, fieldName, config?) → { decision: 'allow'|'reject'|'flag', reasons: string[] }`

Checks, in order:

1. **Reject** if `source` (read from `record.source_attribution.source`,
   `record._provenance.source`, or a flat `record.source`) is null, undefined, or an
   empty string.
2. **Reject** if `verification_status` is `'unknown'`, or if no provenance object is
   present at all (treated as equivalent to unknown).
3. **Flag** (not reject) if `confidence` is a number below `confidenceThreshold`
   (default `0.5`, configurable).
4. **Reject** if the value exactly matches a known-fabricated baseline from
   `KNOWN_FABRICATED_BASELINES` (seeded with the real incidents this session:
   `acceptance_rate: [0.5]`, `admission_difficulty: [50.0]`,
   `funding_attractiveness: [0.0]`) **and** `source` is missing. If a source IS present,
   this downgrades to a **flag** instead of a reject — a genuine, independently-sourced
   value that happens to equal a common baseline (a real college really can have a 50%
   acceptance rate) is not itself proof of fabrication; the null-source check is the
   real teeth here.
5. **Flag** (soft signal only, never reject on this alone) if a money-like field
   (tuition, cost_of_attendance, stipend, salary, fee, price, debt, funding — configurable
   via `moneyLikeFieldHints`) has a suspiciously round value (exact multiple of 500, no
   cents). Real tuition/stipend values are sometimes genuinely round, so this can never
   be an automatic rejection by itself.

## Honest limitations

- **The exact-match baseline list only catches values identical to a known past
  incident.** It will not catch a *new* fabrication pattern with a different constant.
  Extend `KNOWN_FABRICATED_BASELINES` (or pass a `fabricatedBaselines` override in
  `GuardConfig`) whenever a new fabrication incident is found — treat this list as a
  living record of past incidents, not a general fabrication detector.
- **The round-number heuristic is a signal, not a verdict.** A $30,000 real tuition
  value is round and legitimate; this only ever flags for review, never auto-rejects.
- **The `acceptance_rate: [0.5]` check cannot distinguish "genuinely 50%" from
  "someone defaulted to 0.5"** from the value alone — this is stated explicitly rather
  than overclaimed. The actual enforcement mechanism is upstream of the value: **every
  write must carry a non-null `source`**, which check #1 enforces unconditionally
  regardless of what the value is. The baseline-matching in check #4 is a secondary,
  weaker signal for cases where a source string exists but is itself suspect (e.g. a
  `source: 'manual_seed'` tag, which this module does not yet special-case — see below).
- **This module does not (yet) special-case `source: 'manual_seed'` itself as an
  automatic reject**, even though every prior fabrication incident this session used
  exactly that tag. This is a deliberate scope choice: `'manual_seed'` was this
  session's placeholder-data label, not a permanent schema concept, so hardcoding a
  reject on that literal string would be brittle. If seed/placeholder data is a
  recurring, intentional category going forward (e.g. for local dev fixtures), it should
  get its own `verification_status` value or a `source_type: 'placeholder'` convention
  instead of being caught by string-matching `source`.

## Where this is NOT yet wired in (real gaps, not resolved by this file alone)

| Write path | File | Status |
|---|---|---|
| Chancing calculation (audit log insert) | `backend/src/services/consolidatedChancingService.js:644` (`INSERT INTO chancing_audit_log`) | **Not wired.** This writes `raw_probability`/`displayed_chance`, not a provenance-bearing field directly, so the guard's `source`/`verification_status` checks don't map cleanly onto it as-is. |
| College model reads (not writes) | `backend/src/models/College.js` | N/A — this file only reads, doesn't write institution data. |
| Masters enrichment | `scraper/sources/masters_enrichment.py` | **Not wired** (different language entirely — Python cannot import a `.ts` module). The equivalent protection for this file is the direct code fix already applied in this session (`compute_admission_difficulty`/`compute_funding_attractiveness` now return `None` on empty input instead of a fabricated baseline — see `docs/masters_enrichment_audit.md`). A Python port of this same guard logic (or a shared JSON-Schema-style spec both languages validate against) is the real fix if Python-side writes need the identical protection, and is flagged here as unfinished work, not silently assumed to be covered. |

**Bottom line: this module is ready to use, has passing tests, and is correctly scoped
as a spec-plus-reference-implementation for the frontend/TypeScript surface — but
extending its actual enforcement to the Node backend and Python scraper write paths is
follow-up work, not something this file accomplishes by existing.** The most concrete
next step would be a small CommonJS `.js` twin (or a compiled build step) so
`consolidatedChancingService.js` and any future backend write path can `require()` it
directly, plus a Python port of the same rule set for scraper-side enforcement.

## How to run the tests

```
npx tsx -e "require('./src/lib/verified_data_guards.ts').runInlineTests()"
```

7 inline test cases, all passing as of this write-up: reject-null-source,
reject-fabricated-0.5-no-source, allow-real-value-with-full-provenance,
flag-low-confidence, reject-admission_difficulty-baseline,
reject-funding_attractiveness-baseline, flag-round-tuition-with-real-source.

## Extending the fabricated-value reference list

When a new fabrication incident is found (the same way the three seeded entries were
found — a suspiciously uniform or exact value across many rows, traced back to a
hardcoded default in code), add it to `KNOWN_FABRICATED_BASELINES` in
`src/lib/verified_data_guards.ts` with a comment citing the file:line where the
fabrication originated, matching the existing three entries' documentation style.
