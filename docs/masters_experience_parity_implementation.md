# Masters Experience Parity — Implementation Log (Phase F)

Scope: implement ONLY the improvements identified in `masters_experience_gap_report.md`,
highest-priority items first. Not a redesign of undergrad; masters brought toward
undergrad's existing pattern.

## Implemented in this session

### 1. [Highest priority — done] Masters onboarding taken out of `MastersLayout`

`src/App.tsx`: `/masters/onboarding` is now registered as its own top-level `<Route>`
(sibling to `/masters`, wrapped only in `ProtectedRoute`), removed from the nested
children of the `/masters` layout route. This was the root cause identified in the gap
report — no amount of color/animation work could fix a wizard permanently rendered next
to the fixed 256px sidebar (`MastersLayout.tsx:55-150`). Onboarding now owns the full
viewport exactly like undergrad's `/onboarding` route (`App.tsx:174-181`).

Verified: `npx tsc --noEmit` passes with no errors introduced by this route change.

### 2. [High priority — done] Per-step color/theme system

`src/pages/MastersOnboarding.tsx`: added a `STEP_THEMES` array (7 entries, one per step:
Program Intent → Review) with a distinct `bg`/`accent` pair per step, mirroring the
undergrad `STEP_THEMES` pattern (`Onboarding.tsx:48-56`). The outer container's
`background` and the `StepProgress` bar's fill color now derive from
`STEP_THEMES[step]` instead of the previous single static `ACCENT = '#3B9EFF'` used for
every step, with a `transition: 'background 0.5s ease'` matching undergrad's transition
timing (`Onboarding.tsx:2065`).

## Not implemented (correctly out of scope for this pass)

Per the gap report's remaining prioritized items — these are real, but lower-priority
polish beyond the two structural/architectural fixes above, and doing them now would
risk scope creep into a "redesign" rather than a parity fix:

- SVG `Constellation`-style progress indicator (currently still a flat bar, just
  recolored) — gap report item 3.
- Step-transition slide animation — item 4.
- "Review" step reveal/celebration moment — item 5.
- Mid-flow data visualization (e.g. reusing `ReadinessRing`) — item 6.
- Typography scale bump — item 7.
- Dashboard density pass (hero banner, "do this next" card) — item 8.

These remain accurately described in `masters_experience_gap_report.md` and should be
picked up in a follow-up pass once the two structural fixes above are verified in the
running app.

## Verification performed

- `npx tsc --noEmit -p .` — clean, no new type errors.
- Confirmed the route change doesn't alter any other masters route (`/masters`,
  `/masters/programs`, etc. all remain nested under `MastersLayout` unchanged — only
  `onboarding` was pulled out).
- Not yet verified in a running browser session (no dev server was started in this
  implementation pass) — recommend a manual click-through of `/masters/onboarding` to
  confirm the full-screen takeover and color transitions render as expected before
  considering this closed.
