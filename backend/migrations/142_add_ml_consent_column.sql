-- Migration 142: Add missing users.ml_consent column
-- Root cause (found 2026-07-08): applicationController.js and routes/ml.js have read
-- `users.ml_consent` and written to it since at least the last audit, but the column was
-- never added to the live table -- every read/write on it has been silently failing (caught
-- by a try/catch in applicationController.js; would 500 on PUT /api/ml/consent). This is the
-- entire reason the ML outcome-capture loop has captured 0 rows despite the code existing:
-- consent could never actually be set. See docs/SCOPE_OF_WORK_2026-07.md WS7.

ALTER TABLE users ADD COLUMN IF NOT EXISTS ml_consent BOOLEAN NOT NULL DEFAULT false;
