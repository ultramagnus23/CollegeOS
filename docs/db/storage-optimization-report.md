# Database Storage Optimization Report

## Current Findings

1. **Materialized view health risk reduced**
   - `canonical.mv_college_cards` now monitored for staleness and refreshed through service logic.

2. **High-write notification table growth**
   - `notifications` table is append-heavy and should use retention/partitioning for scale.

3. **JSON payload bloat hotspots**
   - Canonical metadata payloads (`institutions.metadata`, domain table raw/source payload fields) are primary growth vectors.

4. **Legacy/public dual-schema footprint**
   - Multiple legacy/public relations remain alongside canonical and should be archived only after dependency audit.

## Safe Optimization Actions

- Add scheduled retention job for operational/event tables:
  - `notifications`
  - `scraper_run_logs`
  - transient diagnostics tables
- Compress or archive old JSON-heavy rows in staging/log tables.
- Ensure only actively queried indexes remain on large write tables.
- Use narrow projections in APIs to avoid full JSON column scans.

## Archive Candidates (Require Cross-Team Sign-Off)
- Legacy non-canonical college mirrors not referenced by active endpoints/workflows.
- Deprecated intermediate ETL staging outputs that are not consumed by canonical jobs.

## Expected Reduction (Directional)
- Notification + diagnostics retention policy: **10–25%** operational table footprint reduction.
- JSON archival for stale staging logs: **15–35%** reduction in staging/log storage.
- Index pruning on inactive legacy tables: lower write amplification and improved autovacuum performance.

## Guardrails
- Do **not** archive canonical intelligence tables used by recommendations/discovery.
- Do **not** remove data required by active workflows or startup schema contracts.
