'use strict';

const DEFAULT_THRESHOLD_MS = 500;

function sanitizeSql(sql) {
  if (typeof sql !== 'string') return '';
  return sql.replace(/\s+/g, ' ').trim().slice(0, 1200);
}

function estimateParamCount(values) {
  return Array.isArray(values) ? values.length : 0;
}

function enableQueryProfiling(pool, logger = console, options = {}) {
  if (!pool || typeof pool.query !== 'function') return pool;
  if (pool.__queryProfilerEnabled) return pool;

  const thresholdMs = Number(options.thresholdMs) > 0 ? Number(options.thresholdMs) : DEFAULT_THRESHOLD_MS;
  const originalQuery = pool.query.bind(pool);

  pool.query = async function profiledQuery(text, values) {
    const startedAt = Date.now();
    try {
      const result = await originalQuery(text, values);
      const durationMs = Date.now() - startedAt;
      if (durationMs >= thresholdMs) {
        logger.warn('slow_query_detected', {
          durationMs,
          thresholdMs,
          rowCount: result?.rowCount ?? null,
          paramCount: estimateParamCount(values),
          sql: sanitizeSql(text),
        });
      }
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      logger.error('failed_query', {
        durationMs,
        paramCount: estimateParamCount(values),
        sql: sanitizeSql(text),
        code: error?.code || null,
        message: error?.message || 'query_failed',
      });
      throw error;
    }
  };

  pool.__queryProfilerEnabled = true;
  return pool;
}

module.exports = {
  DEFAULT_THRESHOLD_MS,
  enableQueryProfiling,
  sanitizeSql,
};
