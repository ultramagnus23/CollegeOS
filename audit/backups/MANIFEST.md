# DB Backup Manifest — Phase 6 (2026-07-19)

Dumps live locally in this dir but are gitignored (not committed). Regenerate with the commands below.

| File | Contents | Command | Rows/Size |
|------|----------|---------|-----------|
| schema_20260718.sql | Full schema (public+canonical), no data | `pg_dump --schema-only --schema=public --schema=canonical` | 15,524 lines (committed) |
| colleges_legacy_data.sql | Full data of public.colleges_legacy before archiving | `pg_dump --table=public.colleges_legacy` | 6,207 rows / 3.5 MB (gitignored) |

Full-DB safety net: `supabase_dump.sql` (412 MB) at repo root is a complete pre-Phase-6 dump.

## Applied schema changes
- migration 150: created `archive` schema; moved `public.colleges_legacy` → `archive.colleges_legacy` (reversible; rollback in the migration header).
