# Dead Code & Legacy Purge Report

## Scope
- Repository sweep focused on frontend/backend runtime paths touched by stabilization.
- Preserved active canonical pipeline, active recommendation pipeline, and active scraper workflows.

## Removed Files

### `src/components/NotificationCenter.tsx`
- **Why safe:** no import references across `src/` (`rg "NotificationCenter"` only matched the file itself).
- **Impact:** removes an unreachable duplicate notifications UI path that diverged from the active notifications page.
- **Dependency graph:** no inbound dependencies; zero route usage.

## Consolidated / Hardened Instead of Deleting
- Notification API call flow consolidated around `src/pages/Notifications.tsx` + `src/components/NotificationBadge.tsx`.
- Async route safety centralized via backend `safeAsyncHandler` patching (prevents scattered per-route wrappers).
- View health/refresher behavior centralized in `materializedViewManager`.
- Frontend schema selectors centralized under `src/contracts/collegeContracts.ts`.

## Bundle / Startup Effects
- **Frontend bundle:** removes one unused component module from build graph.
- **Backend startup:** adds deterministic startup checks (schema + materialized view health), reducing crash-at-first-request risk.

## Remaining Candidates (Not Removed in This Pass)
- Legacy scripts and migrations that still have uncertain operational coupling.
- Older recommendation/chancing route variants requiring broader product sign-off before deletion.
