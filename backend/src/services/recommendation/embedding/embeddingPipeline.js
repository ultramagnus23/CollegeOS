'use strict';

const { generateStudentEmbedding } = require('../embeddingService');
const { subjectRankingTargets } = require('../../majors/subjectRankingMapper');
const { expandQueryFromProfile } = require('./semanticExpansion');

function vectorToPgLiteral(vector = []) {
  return `[${vector.map((v) => Number(v || 0).toFixed(8)).join(',')}]`;
}

async function buildEmbeddingQueryContext(profile = {}) {
  const studentEmbedding = await generateStudentEmbedding(profile);
  const semanticExpansion = await expandQueryFromProfile(profile);
  const subjectTargets = await subjectRankingTargets(profile.intendedMajors || []);

  return {
    studentEmbedding,
    embeddingLiteral: vectorToPgLiteral(studentEmbedding),
    lexicalTerms: semanticExpansion.lexicalTerms,
    expandedMajors: semanticExpansion.expandedMajors,
    subjectTargets,
  };
}

module.exports = {
  buildEmbeddingQueryContext,
};
