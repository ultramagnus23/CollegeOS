'use strict';

const dbManager = require('../../config/database');

const REQUIRED_CANONICAL_TABLES = [
  'canonical.institutions',
  'canonical.institution_admissions',
  'canonical.institution_financials',
  'canonical.institution_outcomes',
  'canonical.institution_rankings',
  'canonical.popularity_index',
  'canonical.institution_embeddings',
  'canonical.mv_college_cards',
];

function nowMs() {
  return Date.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, nowMs() - Number(startedAt || nowMs()));
}

function extractFailureLocation(err) {
  const stack = String(err?.stack || '');
  const lines = stack.split('\n');
  const frame = lines.find((line) => line.includes('/') && line.includes(':')) || '';
  const match = frame.match(/\(?(.+):(\d+):(\d+)\)?$/);
  if (!match) return { file: null, line: null, column: null };
  return {
    file: match[1] || null,
    line: Number(match[2]) || null,
    column: Number(match[3]) || null,
  };
}

function errorSummary(err) {
  const loc = extractFailureLocation(err);
  return {
    message: err?.message || 'Unknown error',
    stack: err?.stack || null,
    code: err?.code || null,
    file: loc.file,
    line: loc.line,
    column: loc.column,
  };
}

function logStageStart(stage, context = {}) {
  console.log('[STAGE STARTED]', {
    stage,
    ts: new Date().toISOString(),
    ...context,
  });
}

function logStageComplete(stage, startedAt, context = {}) {
  console.log('[STAGE COMPLETED]', {
    stage,
    durationMs: elapsedMs(startedAt),
    ts: new Date().toISOString(),
    ...context,
  });
}

function logStageFailure(stage, err, context = {}) {
  console.error('[STAGE FAILED]', {
    stage,
    durationMs: context.startedAt ? elapsedMs(context.startedAt) : null,
    message: err?.message || null,
    stack: err?.stack || null,
    code: err?.code || null,
    file: errorSummary(err).file,
    line: errorSummary(err).line,
    column: errorSummary(err).column,
    ...context,
  });
}

async function verifyCanonicalInfrastructure(requestId = null) {
  const pool = dbManager.getDatabase();
  const diagnostics = {
    requestId,
    checkedAt: new Date().toISOString(),
    missingTables: [],
    tables: {},
    vector: {
      installed: false,
      embeddingCount: 0,
      minDim: null,
      maxDim: null,
      cosineQueryOk: false,
    },
  };

  for (const tableName of REQUIRED_CANONICAL_TABLES) {
    try {
      const existsResult = await pool.query('SELECT to_regclass($1) AS regclass_name', [tableName]);
      const exists = Boolean(existsResult?.rows?.[0]?.regclass_name);
      diagnostics.tables[tableName] = { exists, rowCount: null };
      if (!exists) {
        diagnostics.missingTables.push(tableName);
        console.error('[CANONICAL TABLE MISSING]', { requestId, tableName });
        continue;
      }

      const { rows } = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${tableName}`);
      diagnostics.tables[tableName].rowCount = Number(rows?.[0]?.count) || 0;
    } catch (err) {
      diagnostics.tables[tableName] = {
        exists: false,
        rowCount: null,
        error: err?.message || 'count_failed',
      };
      diagnostics.missingTables.push(tableName);
      logStageFailure('canonical_table_check', err, { requestId, tableName });
    }
  }

  try {
    const extensionResult = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed"
    );
    diagnostics.vector.installed = Boolean(extensionResult?.rows?.[0]?.installed);
  } catch (err) {
    logStageFailure('vector_extension_check', err, { requestId });
  }

  const embeddingsTableExists = Boolean(diagnostics.tables['canonical.institution_embeddings']?.exists);
  if (embeddingsTableExists && diagnostics.vector.installed) {
    try {
      const { rows } = await pool.query(
        `SELECT
          COUNT(*)::bigint AS count,
          COALESCE(MIN(vector_dims(embedding)), 0) AS min_dim,
          COALESCE(MAX(vector_dims(embedding)), 0) AS max_dim
         FROM canonical.institution_embeddings`
      );
      diagnostics.vector.embeddingCount = Number(rows?.[0]?.count) || 0;
      diagnostics.vector.minDim = Number(rows?.[0]?.min_dim) || 0;
      diagnostics.vector.maxDim = Number(rows?.[0]?.max_dim) || 0;
    } catch (err) {
      logStageFailure('embedding_dimension_check', err, { requestId });
    }

    if (diagnostics.vector.embeddingCount > 0) {
      try {
        await pool.query(
          `SELECT 1 - (ie.embedding <=> ie.embedding) AS self_similarity
           FROM canonical.institution_embeddings ie
           LIMIT 1`
        );
        diagnostics.vector.cosineQueryOk = true;
      } catch (err) {
        diagnostics.vector.cosineQueryOk = false;
        logStageFailure('embedding_cosine_query_check', err, { requestId });
      }
    }
  }

  return diagnostics;
}

function safeFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toSerializable(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toSerializable(item, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out = {};
    for (const [key, val] of Object.entries(value)) out[key] = toSerializable(val, seen);
    return out;
  }
  return value;
}

function assertJsonSerializable(value) {
  const cleaned = toSerializable(value);
  JSON.stringify(cleaned);
  return cleaned;
}

module.exports = {
  REQUIRED_CANONICAL_TABLES,
  assertJsonSerializable,
  elapsedMs,
  errorSummary,
  logStageComplete,
  logStageFailure,
  logStageStart,
  nowMs,
  safeFiniteNumber,
  verifyCanonicalInfrastructure,
};
