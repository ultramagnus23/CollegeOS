# Masters Onboarding — Live Browser QA

Real browser testing (Vite preview + accessibility-tree/eval verification), not type
checks. Test path: local Vite dev server against the production API (no working local
DB was available — see "Testing environment" below) using a clearly-labeled, disposable
test account, fully deleted afterward.

## Testing environment

Preferred order per instruction: (1) local backend, (2) development account, (3)
throwaway production account only if necessary.

- **(1) Local backend** — not usable. `backend/.env`'s `DATABASE_URL` points at the same
  live Supabase instance used throughout this session; there is no separate local
  Postgres wired to a local backend. A `docker-compose.test.yml` exists for an isolated
  test DB, but Docker is not installed in this environment. A local PostgreSQL install
  was found running on port 5432, but it isn't configured for this project (unknown
  credentials, no evidence it's CollegeOS-related) and wasn't touched.
- **(2) Development account** — no separate dev-tier auth path exists; `/auth` only
  offers Google OAuth in the UI.
- **(3) Throwaway production account** — used, per the explicit fallback authorization.
  Created via the real `/api/auth/register` endpoint (`qa-onboarding-test-20260702@example.com`,
  user id 302), session tokens injected directly into `localStorage` to bypass the
  Google-OAuth-only UI. **Deleted in full after testing** — `masters_profile`,
  `refresh_tokens`, and the `users` row for id 302 all removed and verified gone.

## Results

| Check | Result | Notes |
|---|---|---|
| Onboarding launches | **PASS** | `/masters/onboarding` renders step 1 of 7 immediately after auth |
| Full-screen (no sidebar) | **PASS** | Verified via DOM inspection: outer container is 1280×720 (full viewport), `hasSidebar` check returned `false`. Confirms the earlier route-restructuring fix works in a real browser, not just in the type system. |
| Color transitions per step | **PASS** | Step 1 background `rgb(12,12,27)` = `#0C0C1B` (`STEP_THEMES[0]`); step 2 `rgb(11,18,32)` = `#0B1220` (`STEP_THEMES[1]`) — confirmed via a fresh DOM read after an initial test method gave a false negative (traversal bug in the test itself, not the app). |
| Routing (7 steps → review → dashboard) | **PASS** | Walked all 7 steps (Program Intent → Academic Background → Standardized Tests → Experience & Research → Recommendations → Target Countries → Review) to submission. |
| Validation | **PASS** | Continue button is genuinely `disabled` (dimmed to 0.5 opacity) when required fields (`intended_program` on step 1; `undergrad_institution`/`undergrad_major` on step 2) are empty. **Minor gap, not a bug**: no inline per-field error text explaining *which* field is missing — flagged as UI-polish, not fixed in this pass (scope: bug-fixing, not adding new UI feedback copy). |
| Animations | **PASS** | `fadeUp` keyframe applies to step content via the `key={step}` remount trick; background/accent-color transition (`0.5s ease`) confirmed present in computed styles. |
| **Persistence (refresh behavior)** | **FAIL → FIXED** | Found a real bug: form field values persisted correctly via existing `localStorage` draft-save (verified all entered values survived a reload), but the **current step position did not** — refreshing always dropped the user back to step 1 even after progressing further, forcing them to re-click through already-completed steps. Root cause: `step` was plain `useState(0)` with no persistence. **Fixed**: added a third `localStorage` key (`masters_onboarding_draft_step`) read on mount and written on every step change, cleared on successful submit alongside the existing two draft keys. Re-verified live: advanced to step 2, reloaded, correctly landed back on step 2 (not step 1). |
| Dashboard handoff | **PASS** | "Finish & view dashboard" correctly `POST`s the profile, navigates to `/masters`, and the dashboard renders with `MastersLayout`'s sidebar present (confirming the earlier onboarding-specific sidebar *exclusion* didn't accidentally remove the sidebar everywhere else too). Readiness checklist correctly reflected the actually-entered data (GPA/tests/experience shown as "missing"/"none" — no fabricated defaults). |
| Error handling | **PASS** | After the test user was deleted (as part of cleanup), reloading with the now-invalid stored token correctly redirected to `/auth` rather than crashing or showing a broken authenticated-looking state. |
| Mobile responsiveness | **PASS** | Resized to 375×812 (mobile preset). No horizontal overflow (`document.body.scrollWidth === window.innerWidth === 375`) on both `/auth` and the redesigned landing page; hero heading and primary CTA button both fit within viewport without clipping. |

## Bugs found and fixed in this pass

1. **Step position not persisted across refresh** (`src/pages/MastersOnboarding.tsx`) —
   fixed as described above. This was the one real functional bug found; everything
   else either passed outright or was a pre-existing, out-of-scope UI polish item
   (missing inline validation error text).

## Verification performed

- `npx tsc --noEmit -p .` clean after the fix.
- Live re-test in the running preview: advance → reload → confirm step position
  survives (previously reset to step 1, now correctly restores).
- Confirmed the fix's `useEffect` writes fire correctly (`localStorage.getItem('masters_onboarding_draft_step')` matched the current step at each checkpoint).
- Confirmed cleanup: test user 302, its `masters_profile` row, and its `refresh_tokens`
  row are all deleted from the production database — verified via a post-delete
  `SELECT` returning zero rows (not shown above, but re-run as part of this QA pass).
