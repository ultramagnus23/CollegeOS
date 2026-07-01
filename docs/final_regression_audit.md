# Final Regression Audit

Honest accounting of what was actually live-tested in a running browser/API vs.
code-reviewed only, given the time available in this pass. Where a claim says "verified
live," it was exercised in the running Vite preview against the real production API
(via a throwaway test account, fully deleted afterward — see
`masters_onboarding_qa.md`). Where it says "code-reviewed," the route/component exists
and was read, but not click-tested end-to-end in this pass.

## Bugs found and fixed in this audit

### 1. Country filter crash on the Colleges search page (real, live bug — FIXED)

**Found live**: navigating to `/colleges` (public, no auth needed) threw
`TypeError: countryData.map is not a function` in the browser console, and the country
filter dropdown silently failed to populate.

**Root cause, traced to source**:
- `backend/src/controllers/collegeController.js`'s `getCountries` called
  `College.getCountryFilters()` — an `async` method — **without `await`**. The
  resulting bare `Promise` object was passed straight into `res.json({ data: ... })`;
  `JSON.stringify` on a `Promise` produces `{}` (no enumerable own properties), so the
  API returned `{"success":true,"data":{}}` instead of an array. Confirmed via direct
  `curl` against the live production endpoint.
- Even once awaited, `getCountryFilters()` (`backend/src/models/College.js`) returned a
  **hardcoded 4-region list** (US/India/UK/"Europe" as one lumped bucket) that predates
  the global institution expansion (migrations 128/129) — Canada, Australia, Singapore,
  Germany, etc. were either miscategorized into "Europe" or omitted, directly
  contradicting the new landing page's global-coverage claims.

**Fixed**: added the missing `await`; replaced the hardcoded region list with a real
`GROUP BY country_code` query against `canonical.mv_college_cards`. Verified locally:
now returns 20 real distinct countries with actual counts (US: 6,237, IN: 492, DE: 375,
KR: 318, FR: 272, ...). **This fix requires deployment to the production Render
backend to take effect live** — verified against the same production database locally,
but not yet deployed.

### 2. Masters onboarding step-position not persisted across refresh (found + fixed — see `masters_onboarding_qa.md`)

Already documented in full there; summarized here for completeness. Form data
persisted correctly; step position did not, forcing users to re-click through
already-completed steps after any refresh. Fixed with a third `localStorage` key.

## Discovered, not fixed (flagged for follow-up)

- **`wikidata_enrich.py` creates empty `institution_demographics` rows purely to
  inflate a completeness score** (see the code comment added during the provenance
  rollout in this pass). Not itself a false *value* — no field is populated — but an
  empty row counting toward a "70% complete" score is a borderline practice worth a
  product decision, not a mechanical fix.
- **`getCountByRegion`** in `College.js` is now unlikely to have any real caller (the
  only call site, `getCountryFilters`, was just rewritten to not use it) — left in
  place rather than deleted, since a broader grep across dynamic `require` usage wasn't
  exhaustively verified; flagged as probable dead code for a future cleanup pass rather
  than removed under time pressure.
- **No inline per-field validation error text** in masters onboarding (disabled-button
  state works, but doesn't say *why* — UI polish, not a bug).

## Coverage: what was live-tested vs. code-reviewed only

| Area | Live-tested | Code-reviewed only | Notes |
|---|---|---|---|
| **Auth** — signup | ✅ Live | | Real account created via `/api/auth/register`, then fully deleted |
| **Auth** — login/session persistence | ✅ Live | | Verified via injected JWT tokens read correctly by `AuthContext`; verified a deleted-user's stale token correctly redirects to `/auth` rather than crashing |
| **Auth** — logout | | Code-reviewed | Logout button present in `MastersLayout`; not clicked live in this pass |
| **Masters onboarding** (all 7 steps, validation, persistence, theme, dashboard handoff) | ✅ Live, full flow | | Full detail in `masters_onboarding_qa.md` |
| **Masters dashboard** | ✅ Live (initial render only) | | Confirmed correct post-onboarding render with real (non-fabricated) readiness data; did not click through every dashboard widget/link |
| **Undergrad onboarding** | | Code-reviewed | Not re-tested in this pass (browser-verified in an earlier session per prior context); no new changes made to it in this pass |
| **Undergrad dashboard, recommendations, college details, favorites, profile updates** | | Code-reviewed | Routes/components exist and were read for the earlier planning-phase audits; not click-tested live in this pass |
| **Colleges search (public)** | ✅ Live | | Found and fixed the country-filter crash above |
| **College detail pages** | Partial (console errors observed) | | Stale "College not found" console errors were observed during navigation but traced to leftover state from earlier stray clicks in this session, not a newly-introduced bug — not independently re-verified as clean beyond that |
| **Financial features** (tuition, scholarships, cost calculations) | | Code-reviewed | No live click-through in this pass; financial data correctness was extensively covered by the DB-level audits in `data_audit_report.md`/`undergrad_cleanup_report.md` |
| **Navigation — desktop** | ✅ Live | | Landing page, `/colleges`, `/auth`, `/masters/onboarding`, `/masters` all navigated successfully |
| **Navigation — mobile** | ✅ Live (partial) | | 375×812 viewport checked on `/auth` and `/` (landing) — no overflow, correct responsive scaling. Not checked on every page. |
| **Data rendering — no fabricated values, null states, loading states, error states** | ✅ Live (spot-checked) | | Masters dashboard showed "Funding unknown" honestly rather than a fabricated number; deleted-user session showed a clean redirect rather than a broken authenticated-looking state |

## Why coverage is partial, stated plainly

A full literal click-through of every listed flow (undergrad onboarding, dashboard,
recommendations, favorites, profile updates, financial calculators, every navigation
edge case) was not completed in this pass. Given the time available, priority was given
to (a) the two flows explicitly named as previously *untested* (masters onboarding) or
*newly built* (the landing page), and (b) following up on any real error surfaced
incidentally during that testing (which is exactly how the country-filter bug was
found). Claiming full coverage of everything listed in the original task brief would
itself be a fabricated-confidence claim, which this session's own policy exists to
prevent — so this table states plainly what was and wasn't exercised.
