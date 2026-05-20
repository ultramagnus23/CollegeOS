'use strict';

const dbManager = require('../../config/database');

const DEFAULT_SOURCE_WEIGHTS = {
  qs: 1,
  'us news': 0.95,
  'the': 0.92,
  arwu: 0.9,
  nirf: 0.84,
  default: 0.78,
};

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeRank(rank, cap) {
  const value = Number(rank);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp01((cap - Math.min(cap, value)) / cap);
}

async function sourceTrustWeight(sourceKey) {
  const pool = dbManager.getDatabase();
  const source = String(sourceKey || '').toLowerCase();
  const { rows } = await pool.query(
    `SELECT trust_score, extraction_accuracy, freshness_score
       FROM canonical.source_reliability
      WHERE source_key = $1`,
    [source]
  );
  if (!rows.length) return DEFAULT_SOURCE_WEIGHTS[source] ?? DEFAULT_SOURCE_WEIGHTS.default;
  const row = rows[0];
  const trust = Number(row.trust_score) || 0;
  const accuracy = Number(row.extraction_accuracy) || 0;
  const freshness = Number(row.freshness_score) || 0;
  return clamp01((trust * 0.5) + (accuracy * 0.35) + (freshness * 0.15));
}

async function calibrateRankingRows(rows = []) {
  const calibrated = [];
  for (const row of rows) {
    const source = String(row.ranking_body || '').toLowerCase();
    const weight = await sourceTrustWeight(source);
    const globalScore = normalizeRank(row.global_rank, 1000);
    const nationalScore = normalizeRank(row.national_rank, 500);
    const subjectScore = normalizeRank(row.subject_rank, 300);
    calibrated.push({
      ranking_body: row.ranking_body,
      ranking_year: row.ranking_year,
      source_weight: weight,
      global_score: globalScore,
      national_score: nationalScore,
      subject_score: subjectScore,
      weighted_score: clamp01((globalScore * 0.45 + nationalScore * 0.2 + subjectScore * 0.35) * weight),
    });
  }
  return calibrated;
}

module.exports = {
  calibrateRankingRows,
};
