'use strict';

const dbManager = require('../config/database');

function parseLimit(raw, fallback = 20) {
  const value = Number.parseInt(String(raw ?? fallback), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(100, value));
}

async function querySection(tableName, { limit = 20, institutionId, state, city } = {}) {
  const pool = dbManager.getDatabase();
  const params = [];
  const filters = ["COALESCE(i.country_code, 'IN') = 'IN'"];

  if (institutionId) {
    params.push(institutionId);
    filters.push(`t.institution_id = $${params.length}`);
  }
  if (state) {
    params.push(state);
    filters.push(`LOWER(COALESCE(i.state_province, '')) = LOWER($${params.length})`);
  }
  if (city) {
    params.push(city);
    filters.push(`LOWER(COALESCE(i.city, '')) = LOWER($${params.length})`);
  }

  params.push(limit);

  const query = `
    SELECT
      t.id,
      t.institution_id,
      i.canonical_name AS institution_name,
      i.city,
      i.state_province AS state,
      t.source_url,
      t.source_name,
      t.source_confidence,
      t.parser_version,
      t.extraction_timestamp,
      t.raw_payload,
      t.updated_at
    FROM ${tableName} t
    JOIN canonical.institutions i ON i.id = t.institution_id
    WHERE ${filters.join(' AND ')}
    ORDER BY t.extraction_timestamp DESC NULLS LAST, t.updated_at DESC
    LIMIT $${params.length}
  `;

  const { rows } = await pool.query(query, params);
  return rows;
}

async function getDiscovery(filters = {}) {
  const pool = dbManager.getDatabase();
  const limit = parseLimit(filters.limit, 25);
  const params = [];
  const where = ["COALESCE(i.country_code, 'IN') = 'IN'"];

  if (filters.state) {
    params.push(filters.state);
    where.push(`LOWER(COALESCE(i.state_province, '')) = LOWER($${params.length})`);
  }
  if (filters.city) {
    params.push(filters.city);
    where.push(`LOWER(COALESCE(i.city, '')) = LOWER($${params.length})`);
  }

  params.push(limit);

  const { rows } = await pool.query(
    `
    SELECT
      i.id,
      i.canonical_name AS institution_name,
      i.city,
      i.state_province AS state,
      i.website,
      a.raw_payload AS admissions,
      f.raw_payload AS fees,
      p.raw_payload AS placements,
      r.raw_payload AS rankings,
      e.raw_payload AS exam_requirements,
      c.raw_payload AS cutoffs
    FROM canonical.institutions i
    LEFT JOIN LATERAL (
      SELECT raw_payload FROM canonical.indian_admissions ia
      WHERE ia.institution_id = i.id
      ORDER BY ia.extraction_timestamp DESC NULLS LAST
      LIMIT 1
    ) a ON TRUE
    LEFT JOIN LATERAL (
      SELECT raw_payload FROM canonical.indian_fees ife
      WHERE ife.institution_id = i.id
      ORDER BY ife.extraction_timestamp DESC NULLS LAST
      LIMIT 1
    ) f ON TRUE
    LEFT JOIN LATERAL (
      SELECT raw_payload FROM canonical.indian_placements ip
      WHERE ip.institution_id = i.id
      ORDER BY ip.extraction_timestamp DESC NULLS LAST
      LIMIT 1
    ) p ON TRUE
    LEFT JOIN LATERAL (
      SELECT raw_payload FROM canonical.indian_rankings ir
      WHERE ir.institution_id = i.id
      ORDER BY ir.extraction_timestamp DESC NULLS LAST
      LIMIT 1
    ) r ON TRUE
    LEFT JOIN LATERAL (
      SELECT raw_payload FROM canonical.indian_exam_requirements ier
      WHERE ier.institution_id = i.id
      ORDER BY ier.extraction_timestamp DESC NULLS LAST
      LIMIT 1
    ) e ON TRUE
    LEFT JOIN LATERAL (
      SELECT raw_payload FROM canonical.indian_cutoffs ic
      WHERE ic.institution_id = i.id
      ORDER BY ic.extraction_timestamp DESC NULLS LAST
      LIMIT 1
    ) c ON TRUE
    WHERE ${where.join(' AND ')}
    ORDER BY i.updated_at DESC NULLS LAST, i.created_at DESC NULLS LAST
    LIMIT $${params.length}
    `,
    params,
  );

  return rows;
}

module.exports = {
  parseLimit,
  getDiscovery,
  getRankings: (filters) => querySection('canonical.indian_rankings', filters),
  getCutoffs: (filters) => querySection('canonical.indian_cutoffs', filters),
  getPlacements: (filters) => querySection('canonical.indian_placements', filters),
  getFees: (filters) => querySection('canonical.indian_fees', filters),
  getExams: (filters) => querySection('canonical.indian_exam_requirements', filters),
};
