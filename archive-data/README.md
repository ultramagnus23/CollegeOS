# Archive — Documents, Tasks, Admin Dashboard, Essays Page (2026-08-08)

This branch preserves what was removed from `main` in the 2026-08-08 scope cut,
which narrowed CollegeOS to one product loop: search institutions -> see a
calibrated admission chance -> track real upcoming deadlines.

## What's here

- **Full code snapshot** (this branch, at the commit tagged before the cut) of:
  - `src/pages/AdminDashboard.tsx`, `backend/src/routes/admin.js`,
    `backend/src/services/scraperHealthService.js` — unreachable in production
    (zero users have `role='admin'`; no nav link ever existed).
  - `src/pages/Documents.tsx`, `backend/src/routes/documents.js`
  - `backend/src/routes/tasks.js`, `src/components/dashboard/TodaysTasks.tsx`
  - `src/pages/Essays.tsx` (standalone essay editor page — the essay data
    model and every backend service that reads essay status as a chancing/
    profile-strength signal was KEPT on `main`; only the standalone page
    was removed since essay status is now surfaced inline in
    `ApplicationDetail.tsx`).

- **`documents_tasks_export_2026-08-08.json`** — a full row-level export of
  `public.documents` (42 rows) and `public.tasks` (70 rows) as they existed in
  the live database on 2026-08-08, across all 3 users who had ever written to
  either table:
  - `user_id 401` (`e2e_ml_...@collegeos-test.com`) — synthetic test account
  - `user_id 405` (`uipass...@collegeos-test.com`) — synthetic test account
  - `user_id 247` (real account) — **rows were NOT deleted from the live
    table**; only 401 and 405's rows were purged from `main`'s production
    database. This export captures all three for a complete audit trail, but
    restoring 247's rows from this file is unnecessary — they were never
    removed.

## Restoring

Table schemas for `documents` and `tasks` were never dropped (only rows for
401/405 were deleted) — the tables and their code paths still exist for user
247 on `main`. To bring the removed UI/routes back:

1. `git checkout archive/documents-tasks-admin-essays-2026-08-08 -- src/pages/Documents.tsx backend/src/routes/documents.js ...`
2. Re-wire routes in `src/App.tsx` / `backend/src/app.js`.
3. If 401/405 test rows are needed again (e.g. to re-run an E2E suite), replay
   the relevant rows from `documents_tasks_export_2026-08-08.json` as INSERTs.
