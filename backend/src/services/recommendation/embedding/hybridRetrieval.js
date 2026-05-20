'use strict';

const dbManager = require('../../../config/database');
const { logStageComplete, logStageFailure, logStageStart, nowMs } = require('../pipelineDiagnostics');

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function lexicalMatchScore(terms = [], row = {}) {
  if (!terms.length) return 0;
  const text = [row.name, row.description, ...(row.programs || []), ...(row.semantic_tags || [])]
    .join(' ')
    .toLowerCase();
  const hits = terms.filter((term) => term && text.includes(term.toLowerCase())).length;
  return clamp01(hits / terms.length);
}

function passesMetadataFilters(row = {}, filters = {}) {
  if (filters.country && String(row.country || '').toLowerCase() !== String(filters.country).toLowerCase()) return false;
  if (filters.maxBudgetUsd && Number(row.net_cost_usd || row.tuition_international || Infinity) > Number(filters.maxBudgetUsd)) return false;
  return true;
}

function logRawSql(sql, params) {
  console.log('SQL:', sql);
  console.log('PARAMS:', params);
}

function logRecommendationPipelineError(err, context = {}) {
  console.error('==============================');
  console.error('RECOMMENDATION PIPELINE ERROR');
  console.error('==============================');
  console.error('MESSAGE:', err?.message);
  console.error('STACK:', err?.stack);
  console.error('FULL ERROR:', err);
  if (err?.details) console.error('DETAILS:', err.details);
  if (err?.hint) console.error('HINT:', err.hint);
  if (err?.code) console.error('CODE:', err.code);
  if (Object.keys(context).length > 0) console.error('CONTEXT:', context);
}

async function retrieveHybridCandidates({ embeddingLiteral, terms = [], subjectTargets = [], metadataFilters = {}, limit = 220 }) {
  const stageStartedAt = nowMs();
  logStageStart('candidate_retrieval', { service: 'embedding_retrieval', limit });
  const pool = dbManager.getDatabase();
  const safeLimit = Math.max(50, Math.min(450, Number(limit) || 220));
  const query = `SELECT
       i.id,
       i.canonical_name AS name,
       i.country_code AS country,
       i.description,
       COALESCE(
         ARRAY(
           SELECT jsonb_array_elements_text(
             COALESCE(i.metadata->'tags', '[]'::jsonb)
           )
         ),
         ARRAY[]::text[]
       ) AS semantic_tags,
       p.programs,
       ie.embedding,
       (1 - (ie.embedding <=> $1::vector))::numeric AS embedding_similarity,
       COALESCE(pi.popularity_score, 0)::numeric AS popularity_score,
       COALESCE(pi.search_volume_score, 0)::numeric AS search_volume_score,
       COALESCE(ir.subject_rank, NULL) AS subject_rank,
       COALESCE(f.net_cost_usd, f.tuition_international, NULL) AS net_cost_usd,
       f.tuition_international
     FROM canonical.institution_embeddings ie
     JOIN canonical.institutions i ON i.id = ie.institution_id
     LEFT JOIN canonical.popularity_index pi ON pi.institution_id = i.id
     LEFT JOIN canonical.institution_financials f ON f.institution_id = i.id
     LEFT JOIN (
       SELECT institution_id, MIN(subject_rank) AS subject_rank
       FROM canonical.institution_rankings
       GROUP BY institution_id
     ) ir ON ir.institution_id = i.id
     LEFT JOIN (
       SELECT institution_id, ARRAY_AGG(program_name) AS programs
       FROM canonical.institution_programs
       GROUP BY institution_id
     ) p ON p.institution_id = i.id
     ORDER BY ie.embedding <=> $1::vector
     LIMIT $2`;
  const payload = [embeddingLiteral, safeLimit];
  let rows = [];

  try {
    logRawSql(query, payload);
    ({ rows } = await pool.query(query, payload));
    console.log('QUERY RESULT:', { count: rows?.length || 0, error: null });
    logStageComplete('candidate_retrieval', stageStartedAt, { service: 'embedding_retrieval', rows: rows?.length || 0 });
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
    logRecommendationPipelineError(error, { stage: 'retrieveHybridCandidates' });
    logStageFailure('candidate_retrieval', error, { service: 'embedding_retrieval', startedAt: stageStartedAt });
    return [];
  }

  return rows
    .filter((row) => passesMetadataFilters(row, metadataFilters))
    .map((row) => {
      const lexical = lexicalMatchScore(terms, row);
      const subjectRelevance = subjectTargets.length
        ? lexicalMatchScore(subjectTargets, { ...row, semantic_tags: [...(row.semantic_tags || []), ...(row.programs || [])] })
        : 0;
      const subjectScore = row.subject_rank ? clamp01((300 - Math.min(300, Number(row.subject_rank))) / 300) : 0;
      const hybridScore = clamp01(
        (Number(row.embedding_similarity) || 0) * 0.5 +
        (Number(row.popularity_score) || 0) * 0.15 +
        lexical * 0.2 +
        subjectRelevance * 0.1 +
        subjectScore * 0.05
      );

      return {
        ...row,
        lexical_score: lexical,
        subject_relevance: subjectRelevance,
        subject_rank_score: subjectScore,
        hybrid_score: hybridScore,
      };
    })
    .sort((a, b) => b.hybrid_score - a.hybrid_score);
}

module.exports = {
  retrieveHybridCandidates,
};
