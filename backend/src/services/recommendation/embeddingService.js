'use strict';

const dbManager = require('../../config/database');
const logger = require('../../utils/logger');

const EMBEDDING_DIM = 768;
const EMBEDDING_MODEL = 'collegeos-text-hash-768';
const EMBEDDING_VERSION = 'v1';

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function hashToken(token) {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function l2Normalize(vector) {
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + (v * v), 0));
  if (!norm) return vector;
  return vector.map((v) => v / norm);
}

function textToEmbedding(text) {
  const vec = new Array(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) return vec;

  for (const token of tokens) {
    const base = hashToken(token);
    for (let i = 0; i < 3; i += 1) {
      const idx = (base + i * 9973) % EMBEDDING_DIM;
      vec[idx] += 1 / (i + 1);
    }
  }
  return l2Normalize(vec);
}

function institutionTextPayload(institution) {
  const programs = Array.isArray(institution.programs) ? institution.programs.join(' ') : '';
  const metadata = institution && typeof institution.metadata === 'object' ? institution.metadata : {};
  const semanticTags = Array.isArray(metadata.tags) ? metadata.tags.join(' ') : '';
  const demographics = Array.isArray(institution.demographics) ? institution.demographics.join(' ') : '';
  return [
    institution.name,
    institution.country,
    institution.institution_type,
    institution.selectivity_tier,
    institution.research_intensity,
    institution.affordability_tier,
    institution.description,
    institution.outcomes_summary,
    institution.rankings_summary,
    programs,
    semanticTags,
    demographics,
  ].filter(Boolean).join(' | ');
}

function studentTextPayload(studentProfile = {}) {
  const majors = Array.isArray(studentProfile.intendedMajors) ? studentProfile.intendedMajors.join(' ') : '';
  const countries = Array.isArray(studentProfile.preferredCountries) ? studentProfile.preferredCountries.join(' ') : '';
  return [
    majors,
    studentProfile.degreeLevel,
    studentProfile.gpaBand,
    studentProfile.satBand,
    studentProfile.actBand,
    studentProfile.budgetBand,
    studentProfile.careerGoals,
    studentProfile.campusSizePreference,
    studentProfile.researchInterest,
    studentProfile.urbanPreference,
    countries,
  ].filter(Boolean).join(' | ');
}

function vectorToPgLiteral(vector) {
  return `[${vector.map((v) => Number(v).toFixed(8)).join(',')}]`;
}

async function generateInstitutionEmbedding(institution) {
  return textToEmbedding(institutionTextPayload(institution));
}

async function upsertInstitutionEmbedding(institution) {
  const pool = dbManager.getDatabase();
  const embedding = await generateInstitutionEmbedding(institution);
  await pool.query(
    `INSERT INTO canonical.institution_embeddings
      (institution_id, embedding, embedding_model, embedding_version, updated_at)
     VALUES ($1, $2::vector, $3, $4, NOW())
     ON CONFLICT (institution_id)
     DO UPDATE SET
       embedding = EXCLUDED.embedding,
       embedding_model = EXCLUDED.embedding_model,
       embedding_version = EXCLUDED.embedding_version,
       updated_at = NOW()`,
    [institution.id, vectorToPgLiteral(embedding), EMBEDDING_MODEL, EMBEDDING_VERSION]
  );
}

async function generateStudentEmbedding(studentProfile) {
  return textToEmbedding(studentTextPayload(studentProfile));
}

async function findSimilarInstitutions(studentEmbedding, limit = 200) {
  const pool = dbManager.getDatabase();
  const safeLimit = Math.max(25, Math.min(400, Number(limit) || 200));
  const vectorLiteral = vectorToPgLiteral(studentEmbedding);

  try {
    const { rows } = await pool.query(
      `SELECT
         ie.institution_id,
         1 - (ie.embedding <=> $1::vector) AS similarity
       FROM canonical.institution_embeddings ie
       ORDER BY ie.embedding <=> $1::vector
       LIMIT $2`,
      [vectorLiteral, safeLimit]
    );
    return rows.map((r) => ({
      institution_id: r.institution_id,
      similarity: Number(r.similarity) || 0,
    }));
  } catch (error) {
    logger.warn('findSimilarInstitutions fallback activated', { error: error.message });
    const { rows } = await pool.query(
      `SELECT id AS institution_id, 0.5::numeric AS similarity
         FROM canonical.institutions
        ORDER BY id
        LIMIT $1`,
      [safeLimit]
    );
    return rows.map((r) => ({
      institution_id: r.institution_id,
      similarity: Number(r.similarity),
    }));
  }
}

module.exports = {
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  EMBEDDING_VERSION,
  generateInstitutionEmbedding,
  generateStudentEmbedding,
  findSimilarInstitutions,
  upsertInstitutionEmbedding,
};
