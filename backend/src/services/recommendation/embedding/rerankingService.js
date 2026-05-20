'use strict';

function overlapScore(queryTerms = [], text = '') {
  const lower = String(text || '').toLowerCase();
  let hits = 0;
  for (const term of queryTerms) {
    if (term && lower.includes(String(term).toLowerCase())) hits += 1;
  }
  if (!queryTerms.length) return 0;
  return Math.max(0, Math.min(1, hits / queryTerms.length));
}

function crossEncoderRerank(candidates = [], queryTerms = []) {
  return candidates
    .map((candidate) => {
      const text = [candidate.name, candidate.description, ...(candidate.programs || [])].join(' ');
      const semanticMatch = overlapScore(queryTerms, text);
      const blended =
        (Number(candidate.hybrid_score) || 0) * 0.7 +
        semanticMatch * 0.2 +
        (Number(candidate.subject_relevance) || 0) * 0.1;
      return {
        ...candidate,
        cross_encoder_score: semanticMatch,
        rerank_score: Math.max(0, Math.min(1, blended)),
      };
    })
    .sort((a, b) => b.rerank_score - a.rerank_score);
}

module.exports = {
  crossEncoderRerank,
};
