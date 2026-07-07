-- Migration 141: Clear stale scholarship deadlines
-- Root cause: `scholarships` was seeded once (2024 cycle) and never refreshed. 54 of 56
-- rows carry a `deadline` that is now in the past (verified live 2026-07-08). Showing a
-- 2026-07 user an "apply by Sept 2024" deadline is actively misleading -- worse than no
-- deadline at all, and violates the project's no-fabricated/no-stale-presented-as-current
-- data rule. Null the deadline (keep the row -- name/provider/amount/eligibility are still
-- valid reference data) until a verified current-cycle date is scraped/curated (WS2,
-- docs/SCOPE_OF_WORK_2026-07.md). last_verified_at is also cleared so the data-quality
-- surfaces correctly flag these as needing re-verification.

UPDATE scholarships
SET deadline = NULL,
    last_verified_at = NULL
WHERE deadline IS NOT NULL
  AND deadline < CURRENT_DATE;
