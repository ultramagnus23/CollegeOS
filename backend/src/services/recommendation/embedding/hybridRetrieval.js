'use strict';

const dbManager = require('../../../config/database');

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function lexicalMatchScore(terms = [], row = {}) {
  if (!terms.length) return 0;
  const text = [row.name, row.description, ...(row.programs || []), ...(row.tags || [])]
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

async function retrieveHybridCandidates({ embeddingLiteral, terms = [], subjectTargets = [], metadataFilters = {}, limit = 220 }) {
  const pool = dbManager.getDatabase();
  const safeLimit = Math.max(50, Math.min(450, Number(limit) || 220));

  const { rows } = await pool.query(
    `SELECT
       i.id,
       i.canonical_name AS name,
       i.country_code AS country,
       i.description,
       i.tags,
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
     LIMIT $2`,
    [embeddingLiteral, safeLimit]
  );

  return rows
    .filter((row) => passesMetadataFilters(row, metadataFilters))
    .map((row) => {
      const lexical = lexicalMatchScore(terms, row);
      const subjectRelevance = subjectTargets.length
        ? lexicalMatchScore(subjectTargets, { ...row, tags: [...(row.tags || []), ...(row.programs || [])] })
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
