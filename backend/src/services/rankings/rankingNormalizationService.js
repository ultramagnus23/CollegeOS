'use strict';

const dbManager = require('../../config/database');

const BODY_WEIGHTS = {
  qs: 1.0,
  the: 0.95,
  'us news': 0.9,
  us_news: 0.9,
  nirf: 0.8,
  arwu: 0.9,
};

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function rankToScore(rank, cap) {
  if (!Number.isFinite(rank) || rank <= 0) return 0;
  return clamp01((cap - Math.min(rank, cap)) / cap);
}

function normalizeRankingRow(row) {
  const body = String(row.ranking_body || '').trim().toLowerCase();
  const bodyWeight = BODY_WEIGHTS[body] ?? 0.75;
  const globalScore = rankToScore(Number(row.global_rank), 1000);
  const nationalScore = rankToScore(Number(row.national_rank), 500);
  const subjectScore = rankToScore(Number(row.subject_rank), 300);
  const providedScore = Number(row.ranking_score);
  const explicitScore = Number.isFinite(providedScore) ? clamp01(providedScore / 100) : null;

  const normalizedRankScore = clamp01(
    (explicitScore ?? (globalScore * 0.65 + nationalScore * 0.35)) * bodyWeight
  );
  const normalizedSubjectRankScore = clamp01(subjectScore * bodyWeight);
  const confidence = clamp01(
    (row.global_rank ? 0.45 : 0) +
    (row.national_rank ? 0.2 : 0) +
    (row.subject_rank ? 0.25 : 0) +
    (row.ranking_score ? 0.1 : 0)
  );

  return {
    rankingBody: row.ranking_body || null,
    rankingYear: row.ranking_year || null,
    normalizedRankScore,
    subjectRankScore: normalizedSubjectRankScore,
    rankingConfidence: confidence,
  };
}

async function getInstitutionRankingSignals(institutionId) {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT ranking_body, ranking_year, global_rank, national_rank, subject_rank, ranking_score
       FROM canonical.institution_rankings
      WHERE institution_id = $1`,
    [institutionId]
  );

  if (!rows.length) {
    return {
      normalized_rank_score: 0,
      subject_rank_score: 0,
      ranking_confidence: 0,
      sources: [],
    };
  }

  const normalized = rows.map(normalizeRankingRow);
  const divisor = normalized.length || 1;
  const aggregate = normalized.reduce((acc, row) => {
    acc.rank += row.normalizedRankScore;
    acc.subject += row.subjectRankScore;
    acc.conf += row.rankingConfidence;
    return acc;
  }, { rank: 0, subject: 0, conf: 0 });

  return {
    normalized_rank_score: Number((aggregate.rank / divisor).toFixed(6)),
    subject_rank_score: Number((aggregate.subject / divisor).toFixed(6)),
    ranking_confidence: Number((aggregate.conf / divisor).toFixed(6)),
    sources: normalized,
  };
}

module.exports = {
  getInstitutionRankingSignals,
  normalizeRankingRow,
};
