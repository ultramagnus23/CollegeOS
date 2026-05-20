'use strict';

const dbManager = require('../../config/database');
const { featureVector } = require('./featureEngineeringService');
const { rankCandidates } = require('./ltrInferenceService');
const { diversifyPortfolio } = require('./diversificationService');
const { generateRecommendationExplanation } = require('./explanationService');
const { getInstitutionRankingSignals } = require('../rankings/rankingNormalizationService');
const { buildEmbeddingQueryContext } = require('./embedding/embeddingPipeline');
const { retrieveHybridCandidates } = require('./embedding/hybridRetrieval');
const { crossEncoderRerank } = require('./embedding/rerankingService');
const { evaluateRetrievalBatch } = require('./embedding/retrievalEvaluation');
const { profileUncertainty, confidenceAdjustedScore } = require('./coldstart/uncertaintyModel');
const { inferFromSparseProfile } = require('./coldstart/sparseProfileInference');
const { diversifyForExploration } = require('./coldstart/exploratoryRecommendations');
const { nextClarifyingQuestions } = require('./coldstart/adaptiveQuestioning');
const { buildUserPreferenceModel } = require('../personalization/userPreferenceModel');
const { rerankWithPersonalization } = require('../personalization/dynamicReranking');
const { aggregateInstitutionFeedback } = require('../feedback/feedbackAggregation');
const { predictScholarshipProbability } = require('../financials/scholarshipPrediction');
const { projectRoi } = require('../financials/roiForecasting');
const { evaluateLoanFeasibility } = require('../financials/loanFeasibility');
const { projectAffordability } = require('../financials/affordabilityProjection');
const { assessCurrencyRisk } = require('../financials/currencyRisk');

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
      (features.admissions_fit * 0.45) +
      (features.selectivity_tier_score * 0.15) +
      (features.major_availability * 0.2) +
      (features.country_match * 0.08) +
      (features.subject_ranking_alignment * 0.12)
    )
  );
}

async function fetchCandidateInstitutionRows(institutionIds) {
  if (!institutionIds.length) return [];
  const pool = dbManager.getDatabase();
  const query = `SELECT
       i.id,
       i.canonical_name AS name,
       i.country_code AS country,
       i.city,
       i.institution_type,
       i.description,
       i.research_intensity_score,
       COALESCE(
         ARRAY(
           SELECT jsonb_array_elements_text(
             COALESCE(i.metadata->'tags', '[]'::jsonb)
           )
         ),
         ARRAY[]::text[]
       ) AS semantic_tags,
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
      WHERE i.id = ANY($1::uuid[])`;
  const payload = [institutionIds];
  let rows = [];
  try {
    ({ rows } = await pool.query(query, payload));
  } catch (error) {
    console.error('Recommendation SQL failed', query);
    console.error('Payload:', payload);
    throw error;
  }
  return rows;
}

function normalizeStudentProfile(userProfile = {}) {
  return {
    intendedMajors: Array.isArray(userProfile.intended_majors)
      ? userProfile.intended_majors
      : userProfile.preferences?.intended_major ? [userProfile.preferences.intended_major] : (userProfile.intendedMajors || []),
    preferredCountries: userProfile.preferences?.preferred_countries || userProfile.target_countries || userProfile.preferredCountries || [],
    gpa: userProfile.gpa || userProfile.academic?.gpa || null,
    sat: userProfile.sat_score || userProfile.academic?.sat_score || null,
    act: userProfile.act_score || userProfile.academic?.act_score || null,
    maxBudgetUsd: userProfile.financial?.max_budget_per_year_usd || userProfile.max_budget_per_year_usd || userProfile.maxBudgetUsd || null,
    degreeLevel: userProfile.preferences?.degree_level || userProfile.degree_level || null,
    gpaBand: userProfile.academic?.gpa_band || null,
    satBand: userProfile.academic?.sat_band || null,
    actBand: userProfile.academic?.act_band || null,
    budgetBand: userProfile.financial?.budget_band || null,
    careerGoals: userProfile.career_goals || userProfile.preferences?.career_goals || userProfile.careerGoals || null,
    campusSizePreference: userProfile.preferences?.campus_size || null,
    researchInterest: userProfile.preferences?.research_interest || null,
    urbanPreference: userProfile.preferences?.setting || null,
    usdInrRate: userProfile.financial?.usd_inr_rate || userProfile.usd_inr_rate || 83,
  };
}

async function assembleCandidates(normalizedStudent, options) {
  const sparseInference = inferFromSparseProfile(normalizedStudent);
  const mergedProfile = { ...normalizedStudent, ...sparseInference };
  const queryContext = await buildEmbeddingQueryContext(mergedProfile);
  const hybridCandidates = await retrieveHybridCandidates({
    embeddingLiteral: queryContext.embeddingLiteral,
    terms: queryContext.lexicalTerms,
    subjectTargets: queryContext.subjectTargets,
    metadataFilters: {
      maxBudgetUsd: mergedProfile.maxBudgetUsd,
      country: options.countryFilter || null,
    },
    limit: Math.max(100, Math.min(350, Number(options.candidateLimit) || 220)),
  });
  const reranked = crossEncoderRerank(hybridCandidates, queryContext.lexicalTerms);

  return {
    mergedProfile,
    queryContext,
    retrievalCandidates: reranked,
  };
}

async function generateRecommendationsV2(userProfile, options = {}) {
  const normalizedStudent = normalizeStudentProfile(userProfile);
  const uncertainty = profileUncertainty(normalizedStudent);
  const { mergedProfile, queryContext, retrievalCandidates } = await assembleCandidates(normalizedStudent, options);
  const candidateRows = await fetchCandidateInstitutionRows(retrievalCandidates.map((c) => c.id));

  const rankedInputs = [];
  for (const row of candidateRows) {
    const retrievalRow = retrievalCandidates.find((c) => c.id === row.id) || {};
    const rankingSignals = await getInstitutionRankingSignals(row.id, {
      subjectMatch: retrievalRow.subject_relevance,
      country: toCountryName(row.country),
    });
    const popularitySignals = {
      popularity_score: Number(row.popularity_score) || 0,
      search_volume_score: Number(row.search_volume_score) || 0,
      trending_delta_30d: Number(row.trending_delta_30d) || 0,
    };
    rankedInputs.push({
      institution_id: row.id,
      row,
      retrieval: retrievalRow,
      features: featureVector(mergedProfile, row, rankingSignals, popularitySignals),
    });
  }

  const predictions = rankCandidates(rankedInputs.map((r) => ({
    institution_id: r.institution_id,
    features: r.features,
  })));
  const scoreMap = new Map(predictions.map((p) => [p.institution_id, p]));

  const enriched = [];
  for (const entry of rankedInputs) {
    const prediction = scoreMap.get(entry.institution_id) || { score: 0, confidence: 0.4, contributions: {} };
    const adjustedScore = confidenceAdjustedScore(prediction.score, uncertainty);
    const admitChance = estimateAdmitChance(entry.features);
    const explanation = generateRecommendationExplanation(entry.row, prediction.contributions, prediction.confidence);
    const feedbackSignals = await aggregateInstitutionFeedback(entry.row.id);
    const scholarship = predictScholarshipProbability({ profile: mergedProfile, institution: entry.row });
    const roi = projectRoi({
      tuitionTotalUsd: (Number(entry.row.net_cost_usd || entry.row.tuition_international) || 0) * 4,
      expectedSalaryUsd: Number(entry.row.median_earnings_6yr) || 0,
    });
    const loan = evaluateLoanFeasibility({
      institution: { ...entry.row, country: toCountryName(entry.row.country) },
      amountUsd: Number(entry.row.net_cost_usd || entry.row.tuition_international) || 0,
      hasCollateral: Boolean(userProfile.financial?.has_collateral),
      profile: mergedProfile,
    });
    const affordability = projectAffordability({
      annualCostUsd: Number(entry.row.net_cost_usd || entry.row.tuition_international) || 0,
      annualBudgetUsd: Number(mergedProfile.maxBudgetUsd) || 0,
      scholarshipProbability: scholarship.probability,
      expectedAidUsd: (Number(entry.row.tuition_international) || 0) * 0.1,
    });
    const currencyRisk = assessCurrencyRisk({
      annualCostUsd: Number(entry.row.net_cost_usd || entry.row.tuition_international) || 0,
      usdInrRate: Number(mergedProfile.usdInrRate) || 83,
      usdInrVolatility: 0.08,
    });

    enriched.push({
      college_id: entry.row.id,
      college_name: entry.row.name,
      country: toCountryName(entry.row.country),
      city: entry.row.city,
      semantic_tags: Array.isArray(entry.row.semantic_tags) ? entry.row.semantic_tags : [],
      rankScore: adjustedScore,
      confidence: Math.max(0.25, prediction.confidence * (1 - uncertainty * 0.2)),
      admitChance,
      bucket: classifyPortfolioBucket(admitChance),
      features: entry.features,
      explanation,
      ranking_score: entry.features.normalized_global_ranking,
      subject_rank_score: entry.features.subject_ranking_alignment,
      popularity_score: entry.features.popularity_score,
      affordability_score: entry.features.affordability_fit,
      retrieval_score: Number(entry.retrieval.hybrid_score) || 0,
      rerank_score: Number(entry.retrieval.rerank_score) || 0,
      feedback_score: feedbackSignals.implicit_score,
      scholarship,
      roi,
      loan,
      affordability,
      currencyRisk,
    });
  }

  const preferenceModel = options.userId ? await buildUserPreferenceModel(options.userId) : { preferredCountries: [], preferredTags: [], implicitAffinity: 0 };
  const personalized = rerankWithPersonalization(enriched, preferenceModel);
  const exploratory = diversifyForExploration(personalized, uncertainty);

  const diversified = diversifyPortfolio(exploratory, {
    targetCount: Math.max(10, Math.min(30, Number(options.limit) || 20)),
  });

  const retrievalEval = evaluateRetrievalBatch({
    candidates: retrievalCandidates,
    relevantInstitutionIds: diversified.slice(0, 20).map((i) => i.college_id),
    k: 20,
  });

  return diversified.map((item) => ({
    college_id: item.college_id,
    college_name: item.college_name,
    country: item.country,
    overall_score: Number((item.rankScore * 100).toFixed(2)),
    confidence_score: Number(item.confidence.toFixed(4)),
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
      retrieval_fit: Number((item.retrieval_score * 100).toFixed(1)),
      rerank_fit: Number((item.rerank_score * 100).toFixed(1)),
      feedback_fit: Number(((item.feedback_score + 1) * 50).toFixed(1)),
    },
    explanation: item.explanation,
    why_values: item.explanation.reasons,
    reasoning: [
      item.explanation.reasoning_summary,
      `Confidence: ${Math.round(item.confidence * 100)}%`,
      `Portfolio bucket: ${item.bucket}`,
      `Scholarship likelihood: ${Math.round(item.scholarship.probability * 100)}%`,
      `INR FX risk: ${Math.round(item.currencyRisk.inr_fx_risk_score * 100)}%`,
    ],
    financial_intelligence: {
      scholarship_probability: item.scholarship.probability,
      scholarship_confidence: item.scholarship.confidence,
      roi_score: item.roi.roi_score,
      break_even_years: item.roi.break_even_years,
      loan_feasibility_score: item.loan.feasibility_score,
      loan_confidence: item.loan.confidence,
      affordability_score: item.affordability.affordability_score,
      affordability_confidence: item.affordability.confidence,
      inr_fx_risk_score: item.currencyRisk.inr_fx_risk_score,
      currency_confidence: item.currencyRisk.confidence,
      sbi_eligible: item.loan.sbi_eligible,
      credila_compatible: item.loan.credila_compatible,
      collateral_required: item.loan.collateral_required,
    },
    uncertainty: {
      profile_uncertainty: Number(uncertainty.toFixed(6)),
      clarifying_questions: nextClarifyingQuestions(mergedProfile),
    },
    retrieval_quality: retrievalEval,
  }));
}

module.exports = {
  generateRecommendationsV2,
};
