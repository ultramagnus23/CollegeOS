'use strict';

const DEFAULT_STALE_MS = 1000 * 60 * 60 * 24;

class MaterializedViewManager {
  constructor({ pool, logger = console, staleMs = DEFAULT_STALE_MS } = {}) {
    this.pool = pool;
    this.logger = logger;
    this.staleMs = staleMs;
  }

  async viewExists(schema, name) {
    const { rows } = await this.pool.query(
      `
        SELECT 1
        FROM pg_matviews
        WHERE schemaname = $1
          AND matviewname = $2
      `,
      [schema, name]
    );
    return rows.length > 0;
  }

  async validateDependencies() {
    const required = [
      'canonical.institutions',
      'canonical.popularity_index',
      'canonical.institution_rankings',
      'canonical.institution_admissions',
      'canonical.institution_financials',
      'canonical.institution_outcomes',
      'canonical.mv_college_cards',
    ];
    const missing = [];
    for (const rel of required) {
      const { rows } = await this.pool.query('SELECT to_regclass($1) AS rel', [rel]);
      if (!rows?.[0]?.rel) missing.push(rel);
    }
    if (missing.length > 0) {
      const error = new Error(`Materialized view dependencies missing: ${missing.join(', ')}`);
      error.code = 'MV_DEPENDENCY_MISSING';
      error.missing = missing;
      throw error;
    }
    return { ok: true, missing: [] };
  }

  async estimateStaleAgeMs(schema, name) {
    const rel = `${schema}.${name}`;
    const { rows } = await this.pool.query(
      `
        SELECT
          EXTRACT(EPOCH FROM (NOW() - GREATEST(
            COALESCE(MAX(updated_at), to_timestamp(0)),
            NOW() - INTERVAL '365 days'
          ))) * 1000 AS stale_ms
        FROM ${rel}
      `
    );
    return Number(rows?.[0]?.stale_ms || 0);
  }

  async isStale(schema, name) {
    const staleAgeMs = await this.estimateStaleAgeMs(schema, name);
    return staleAgeMs > this.staleMs;
  }

  async refresh(schema, name, { concurrent = true } = {}) {
    const rel = `${schema}.${name}`;
    const exists = await this.viewExists(schema, name);
    if (!exists) {
      const error = new Error(`Materialized view not found: ${rel}`);
      error.code = 'MV_NOT_FOUND';
      throw error;
    }
    const startedAt = Date.now();
    const stmt = concurrent
      ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${rel}`
      : `REFRESH MATERIALIZED VIEW ${rel}`;
    await this.pool.query(stmt);
    const durationMs = Date.now() - startedAt;
    this.logger.info('materialized_view_refreshed', { view: rel, concurrent, durationMs });
    return { view: rel, concurrent, durationMs };
  }

  async ensureHealthy() {
    await this.validateDependencies();
    const view = { schema: 'canonical', name: 'mv_college_cards' };
    const stale = await this.isStale(view.schema, view.name);
    if (stale) {
      await this.refresh(view.schema, view.name, { concurrent: true });
    }
    return { ok: true, staleRefreshed: stale };
  }
}

module.exports = {
  DEFAULT_STALE_MS,
  MaterializedViewManager,
};
