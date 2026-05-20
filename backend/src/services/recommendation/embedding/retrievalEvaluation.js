'use strict';

const dbManager = require('../../../config/database');

function precisionAtK(candidates = [], relevantIds = new Set(), k = 20) {
  const top = candidates.slice(0, k);
  const hits = top.filter((c) => relevantIds.has(String(c.id || c.institution_id))).length;
  return top.length ? hits / top.length : 0;
}

function recallAtK(candidates = [], relevantIds = new Set(), k = 50) {
  if (!relevantIds.size) return 0;
  const top = candidates.slice(0, k);
  const hits = top.filter((c) => relevantIds.has(String(c.id || c.institution_id))).length;
  return hits / relevantIds.size;
}

function diversity(candidates = []) {
  const countries = new Set(candidates.map((c) => c.country).filter(Boolean));
  const majors = new Set();
  candidates.forEach((c) => (c.programs || []).slice(0, 3).forEach((m) => majors.add(String(m).toLowerCase())));
  return Math.min(1, (countries.size / 12) * 0.4 + (majors.size / 40) * 0.6);
}

async function persistRetrievalEvaluation(benchmarkName, retrievalVersion, metrics, sampleSize) {
  const pool = dbManager.getDatabase();
  await pool.query(
    `INSERT INTO canonical.retrieval_eval_history (benchmark_name, retrieval_version, metrics, sample_size)
     VALUES ($1, $2, $3::jsonb, $4)`,
    [benchmarkName, retrievalVersion, JSON.stringify(metrics), sampleSize]
  );
}

function evaluateRetrievalBatch({ candidates = [], relevantInstitutionIds = [], k = 20 }) {
  const relevant = new Set(relevantInstitutionIds.map((id) => String(id)));
  const metrics = {
    precision_at_k: Number(precisionAtK(candidates, relevant, k).toFixed(6)),
    recall_at_k: Number(recallAtK(candidates, relevant, Math.max(2 * k, 50)).toFixed(6)),
    candidate_recall: Number(recallAtK(candidates, relevant, candidates.length).toFixed(6)),
    diversity: Number(diversity(candidates).toFixed(6)),
  };
  return metrics;
}

module.exports = {
  evaluateRetrievalBatch,
  persistRetrievalEvaluation,
};
