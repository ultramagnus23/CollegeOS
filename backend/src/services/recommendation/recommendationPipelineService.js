'use strict';

const dbManager = require('../../config/database');
const { generateStudentEmbedding, findSimilarInstitutions } = require('./embeddingService');
const { featureVector } = require('./featureEngineeringService');
const { rankCandidates } = require('./ltrInferenceService');
const { diversifyPortfolio } = require('./diversificationService');
const { generateRecommendationExplanation } = require('./explanationService');
const { getInstitutionRankingSignals } = require('../rankings/rankingNormalizationService');

function toCountryName(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const map = { US: 'United States', USA: 'United States', UK: 'United Kingdom', IN: 'India' };
  return map[raw.toUpperCase()] || raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function classifyPortfolioBucket(admitChance) {
  if (admitChance >= 0.68) return 'safety';
  if (admitChance >= 0.38) return 'target';
  return 'reach';
}

function estimateAdmitChance(features) {
  return Math.max(
    0.03,
    Math.min(
      0.97,
      (features.admissions_fit * 0.5) +
      (features.selectivity_tier_score * 0.2) +
      (features.major_availability * 0.2) +
      (features.country_match * 0.1)
    )
  );
}

async function fetchCandidateInstitutionRows(institutionIds) {
  if (!institutionIds.length) return [];
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT
       i.id,
       i.canonical_name AS name,
       i.country_code AS country,
       i.city,
       i.institution_type,
       i.description,
       i.research_intensity_score,
       i.tags,
       p.programs,
       a.acceptance_rate,
       a.sat_75,
       a.act_75,
       a.gpa_75,
       f.tuition_international,
       f.net_cost_usd,
       f.international_aid_available,
       o.median_earnings_6yr,
       o.graduation_rate_6yr,
       pi.popularity_score,
       pi.search_volume_score,
       pi.trending_delta_30d
     FROM canonical.institutions i
     LEFT JOIN canonical.institution_admissions a ON a.institution_id = i.id
     LEFT JOIN canonical.institution_financials f ON f.institution_id = i.id
     LEFT JOIN canonical.institution_outcomes o ON o.institution_id = i.id
     LEFT JOIN canonical.popularity_index pi ON pi.institution_id = i.id
     LEFT JOIN (
       SELECT institution_id, ARRAY_AGG(program_name) AS programs
       FROM canonical.institution_programs
       GROUP BY institution_id
     ) p ON p.institution_id = i.id
     WHERE i.id = ANY($1::uuid[])`,
    [institutionIds]
  );
  return rows;
}

function normalizeStudentProfile(userProfile = {}) {
  return {
    intendedMajors: Array.isArray(userProfile.intended_majors)
      ? userProfile.intended_majors
      : userProfile.preferences?.intended_major ? [userProfile.preferences.intended_major] : [],
    preferredCountries: userProfile.preferences?.preferred_countries || userProfile.target_countries || [],
    gpa: userProfile.gpa || userProfile.academic?.gpa || null,
    sat: userProfile.sat_score || userProfile.academic?.sat_score || null,
    act: userProfile.act_score || userProfile.academic?.act_score || null,
    maxBudgetUsd: userProfile.financial?.max_budget_per_year_usd || userProfile.max_budget_per_year_usd || null,
    degreeLevel: userProfile.preferences?.degree_level || userProfile.degree_level || null,
    gpaBand: userProfile.academic?.gpa_band || null,
    satBand: userProfile.academic?.sat_band || null,
    actBand: userProfile.academic?.act_band || null,
    budgetBand: userProfile.financial?.budget_band || null,
    careerGoals: userProfile.career_goals || userProfile.preferences?.career_goals || null,
    campusSizePreference: userProfile.preferences?.campus_size || null,
    researchInterest: userProfile.preferences?.research_interest || null,
    urbanPreference: userProfile.preferences?.setting || null,
  };
}

async function generateRecommendationsV2(userProfile, options = {}) {
  const normalizedStudent = normalizeStudentProfile(userProfile);
  const studentEmbedding = await generateStudentEmbedding(normalizedStudent);
  const topK = Math.max(100, Math.min(350, Number(options.candidateLimit) || 200));
  const candidateIds = await findSimilarInstitutions(studentEmbedding, topK);
  const candidateRows = await fetchCandidateInstitutionRows(candidateIds.map((c) => c.institution_id));

  const rankedInputs = [];
  for (const row of candidateRows) {
    const rankingSignals = await getInstitutionRankingSignals(row.id);
    const popularitySignals = {
      popularity_score: Number(row.popularity_score) || 0,
      search_volume_score: Number(row.search_volume_score) || 0,
      trending_delta_30d: Number(row.trending_delta_30d) || 0,
    };
    rankedInputs.push({
      institution_id: row.id,
      row,
      features: featureVector(normalizedStudent, row, rankingSignals, popularitySignals),
    });
  }

  const predictions = rankCandidates(rankedInputs.map((r) => ({
    institution_id: r.institution_id,
    features: r.features,
  })));
  const scoreMap = new Map(predictions.map((p) => [p.institution_id, p]));

  const enriched = rankedInputs.map((entry) => {
    const prediction = scoreMap.get(entry.institution_id) || { score: 0, confidence: 0.4, contributions: {} };
    const admitChance = estimateAdmitChance(entry.features);
    const explanation = generateRecommendationExplanation(entry.row, prediction.contributions, prediction.confidence);
    return {
      college_id: entry.row.id,
      college_name: entry.row.name,
      country: toCountryName(entry.row.country),
      city: entry.row.city,
      rankScore: prediction.score,
      confidence: prediction.confidence,
      admitChance,
      bucket: classifyPortfolioBucket(admitChance),
      features: entry.features,
      explanation,
      ranking_score: entry.features.normalized_global_ranking,
      subject_rank_score: entry.features.subject_ranking_alignment,
      popularity_score: entry.features.popularity_score,
      affordability_score: entry.features.affordability_fit,
      financial_fit_score: entry.features.affordability_fit * 0.7 + entry.features.international_aid_match * 0.3,
      recommendation_confidence: prediction.confidence,
    };
  });

  const diversified = diversifyPortfolio(enriched, {
    targetCount: Math.max(10, Math.min(30, Number(options.limit) || 20)),
  });

  return diversified.map((item) => ({
    college_id: item.college_id,
    college_name: item.college_name,
    country: item.country,
    overall_score: Number((item.rankScore * 100).toFixed(2)),
    confidence_score: Number(item.recommendation_confidence.toFixed(4)),
    classification: item.bucket,
    admit_chance: Number((item.admitChance * 100).toFixed(1)),
    score_breakdown: {
      major_fit: Number((item.features.major_availability * 100).toFixed(1)),
      ranking_fit: Number((item.features.normalized_global_ranking * 100).toFixed(1)),
      subject_ranking_fit: Number((item.features.subject_ranking_alignment * 100).toFixed(1)),
      admissions_fit: Number((item.features.admissions_fit * 100).toFixed(1)),
      affordability_fit: Number((item.features.affordability_fit * 100).toFixed(1)),
      outcomes_fit: Number((item.features.outcomes_alignment * 100).toFixed(1)),
      popularity_fit: Number((item.features.popularity_score * 100).toFixed(1)),
      country_fit: Number((item.features.country_match * 100).toFixed(1)),
      financial_fit_score: Number((item.financial_fit_score * 100).toFixed(1)),
    },
    explanation: item.explanation,
    why_values: item.explanation.reasons,
    reasoning: [
      item.explanation.reasoning_summary,
      `Confidence: ${Math.round(item.recommendation_confidence * 100)}%`,
      `Portfolio bucket: ${item.bucket}`,
    ],
  }));
}

module.exports = {
  generateRecommendationsV2,
};
