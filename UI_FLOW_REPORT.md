# UI_FLOW_REPORT.md

_Method: static audit (route map in `src/App.tsx` + each page's API calls) cross-referenced with **verified live row counts** (2026-06-22). This predicts which pages render real content vs empty/degraded. It is **not** a live click-through — a real browser run is the remaining Phase-14 verification (a full boot runs migrations against prod, so it's deferred to a controlled environment)._

## Page-by-page (all routed in App.tsx; no dead pages)

| Page | Route | Data dependency | Predicted state |
|---|---|---|---|
| Landing | `/` | static | ✅ works |
| Auth | login | auth API | ✅ works |
| Onboarding | flow | writes profile; calls `/api/chances/predict` | ✅ persists profile; ⚠️ chances come from **DB fallback** (HuggingFace `HF_SPACE_URL` unset) |
| Dashboard | `/dashboard` | profile + applications + timeline | ⚠️ mostly works; **timeline widget empty** (`timeline_actions`=0) |
| Colleges | `/colleges` | search RPC over 8,244 | ✅ works (search relevance fixed in #141) |
| CollegeDetails | `/colleges/:id` | per-college canonical data | ⚠️ core works; **Deadlines/Requirements sections near-empty** (4 / 8 institutions) |
| Applications | `/applications` | `applications` (12), `application_tasks` (60) | ✅ works for users with applications |
| Requirements | `/requirements` | `institution_requirements` (8) | ❌ **near-empty** (0.1% coverage) |
| Deadlines | `/deadlines` | `institution_deadlines` (4) | ❌ **near-empty** (2 institutions) |
| Timeline | `/timeline` | `timeline_actions` (0) | ❌ **empty** — not auto-populated on college add |
| Essays | `/essays` | essay prompts (no table) / AI generation | ⚠️ no stored prompts; depends on AI generation working |
| Scholarships | `/scholarships` | `scholarships` (56) | ⚠️ works but sparse |
| Rankings | `/rankings` | rankings (335) / global_rank (298) | ⚠️ works but thin (QS+NIRF) |
| Chancing | `/chancing` | `/api/chancing` → JS model+heuristic | ✅ works (the live engine) |
| Recommendations | `/recommendations`, `/recommenders` | recommendation pipeline | ✅ works (filtered/ranked; not semantic) |
| CollegeRecommendations | `/college-recommendations` | recs | ✅ works |
| SuggestedColleges | `/suggested-colleges` | `/api/chances` → DB fallback | ⚠️ shows fallback list, not ML |
| Documents | `/documents` | documents API | ✅ works |
| FinancialAid | `/financial-aid` | redirect (`<Navigate>`) | ✅ redirect only |
| Notifications | `/notifications` | notifications API | ✅ works |
| Settings / Profile | `/settings`, `/profile` | profile | ✅ works |
| AdminDashboard | `/admin` | admin/health API | ✅ admin-gated |
| NotFound | `*` | static | ✅ works |

## The pages that will disappoint a real user (data-gap-driven, not code bugs)

1. **Deadlines** — 2 institutions. Core feature, effectively empty.
2. **Requirements** — 8 institutions. Effectively empty.
3. **Timeline** — empty; not generated automatically (Phase 1 wiring gap).
4. **SuggestedColleges/Onboarding chances** — silently using a DB fallback because the HuggingFace ML service isn't configured.

## Code-level risks to verify in a live run (Phase 14)

- Loading/empty/error states on the near-empty pages (do they show a friendly empty state or an infinite spinner?).
- `Essays` page behavior when no prompts exist.
- Onboarding → does the `db_fallback` chances path surface gracefully (not as an error)?

## Status

This is a **predicted** flow map from verified data + code. Marking the full UI flow "verified working" requires an actual browser run-through (Phase 14) — not yet performed. The data-gap findings above are real regardless of the live run.
