'use strict';

const dbManager = require('../../config/database');
const { calibrateRankingRows } = require('./rankingCalibration');
const { computeSubjectWeight } = require('./subjectWeighting');
const { wilsonLikeConfidence } = require('./rankingConfidence');
const { interpolateMissingRank } = require('./rankingInterpolation');
const { applyRegionalScaling } = require('./regionalNormalization');

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function daysSince(dateLike) {
  if (!dateLike) return 730;
  const ms = Date.now() - new Date(dateLike).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.round(ms / 86400000);
}

function variance(values = []) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / values.length;
}

async function fetchRankingRows(institutionId) {
  const pool = dbManager.getDatabase();
  const sql = `SELECT ranking_body, ranking_year, global_rank, national_rank, subject_rank, ranking_score, updated_at
       FROM canonical.institution_rankings
      WHERE institution_id = $1`;
  const params = [institutionId];
  try {
    console.log('SQL:', sql);
    console.log('PARAMS:', params);
    const { rows } = await pool.query(sql, params);
    console.log('QUERY RESULT:', { count: rows?.length || 0, error: null });
    return rows;
  } catch (error) {
    console.log('QUERY RESULT:', {
      count: null,
      error: {
        message: error?.message || null,
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
      },
    });
    console.error('==============================');
    console.error('RECOMMENDATION PIPELINE ERROR');
    console.error('==============================');
    console.error('MESSAGE:', error?.message);
    console.error('STACK:', error?.stack);
    console.error('FULL ERROR:', error);
    if (error?.details) console.error('DETAILS:', error.details);
    if (error?.hint) console.error('HINT:', error.hint);
    if (error?.code) console.error('CODE:', error.code);
    return [];
  }
}

function buildSubjectSignalMap(rows = []) {
  const map = {};
  for (const row of rows) {
    const key = String(row.ranking_body || 'general').toLowerCase();
    map[key] = Math.max(map[key] || 0, Number(row.subject_score) || 0);
  }
  return map;
}

async function getInstitutionRankingSignals(institutionId, options = {}) {
  const rows = await fetchRankingRows(institutionId);

  if (!rows.length) {
    return {
      normalized_rank_score: 0,
      subject_rank_score: 0,
      ranking_confidence: 0,
      subject_weight: 0.35,
      calibrated_score: 0,
      sources: [],
      subject_signal_map: {},
    };
  }

  const calibrated = await calibrateRankingRows(rows);
  const weightedScores = calibrated.map((r) => r.weighted_score);
  const agg = calibrated.reduce((acc, row) => {
    acc.global += row.global_score;
    acc.national += row.national_score;
    acc.subject += row.subject_score;
    acc.weighted += row.weighted_score;
    return acc;
  }, { global: 0, national: 0, subject: 0, weighted: 0 });

  const divisor = calibrated.length || 1;
  const avgGlobal = agg.global / divisor;
  const avgNational = agg.national / divisor;
  const avgSubject = agg.subject / divisor;
  const avgWeighted = agg.weighted / divisor;
  const recencyDays = Math.min(...rows.map((r) => daysSince(r.updated_at || r.ranking_year)));
  const confidence = wilsonLikeConfidence({
    sourceCount: calibrated.length,
    variancePenalty: variance(weightedScores),
    recencyDays,
  });

  const interpolatedSubject = interpolateMissingRank({
    globalScore: avgGlobal,
    nationalScore: avgNational,
    subjectScore: avgSubject,
    confidence,
  });

  const subjectWeight = computeSubjectWeight({
    subjectMatch: Number(options.subjectMatch) || 0,
    rankingConfidence: confidence,
    hasSubjectRank: avgSubject > 0,
  });

  const calibratedScore = clamp01((interpolatedSubject * subjectWeight) + (avgWeighted * (1 - subjectWeight)));

  return {
    normalized_rank_score: Number(applyRegionalScaling(avgWeighted, options.country).toFixed(6)),
    subject_rank_score: Number(applyRegionalScaling(interpolatedSubject, options.country).toFixed(6)),
    ranking_confidence: Number(confidence.toFixed(6)),
    subject_weight: Number(subjectWeight.toFixed(6)),
    calibrated_score: Number(calibratedScore.toFixed(6)),
    sources: calibrated,
    subject_signal_map: buildSubjectSignalMap(calibrated),
  };
}

module.exports = {
  getInstitutionRankingSignals,
};
