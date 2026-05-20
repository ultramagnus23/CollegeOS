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

function logRawSql(sql, params) {
  console.log('SQL:', sql);
  console.log('PARAMS:', params);
}

function logQueryResult(data, error) {
  console.log('QUERY RESULT:', {
    count: Array.isArray(data) ? data.length : null,
    error: error ? {
      message: error?.message || null,
      code: error?.code || null,
      details: error?.details || null,
      hint: error?.hint || null,
    } : null,
  });
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

function fallbackPrediction(features = {}) {
  const safeFeatures = features && typeof features === 'object' ? features : {};
  const score =
    (Number(safeFeatures.major_availability) || 0) * 0.28 +
    (Number(safeFeatures.admissions_fit) || 0) * 0.24 +
    (Number(safeFeatures.normalized_global_ranking) || 0) * 0.2 +
    (Number(safeFeatures.affordability_fit) || 0) * 0.18 +
    (Number(safeFeatures.country_match) || 0) * 0.1;
  return {
    score: Math.max(0, Math.min(1, score)),
    confidence: 0.55,
    contributions: {
      major_availability: Number(safeFeatures.major_availability) || 0,
      admissions_fit: Number(safeFeatures.admissions_fit) || 0,
      normalized_global_ranking: Number(safeFeatures.normalized_global_ranking) || 0,
      affordability_fit: Number(safeFeatures.affordability_fit) || 0,
      country_match: Number(safeFeatures.country_match) || 0,
    },
  };
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
    logRawSql(query, payload);
    ({ rows } = await pool.query(query, payload));
    logQueryResult(rows, null);
  } catch (error) {
    logQueryResult(null, error);
    logRecommendationPipelineError(error, { stage: 'fetchCandidateInstitutionRows' });
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

async function generateDeterministicFallbackRecommendations(normalizedStudent = {}, options = {}, cause = null) {
  const pool = dbManager.getDatabase();
  const safeLimit = Math.max(10, Math.min(30, Number(options.limit) || 20));
  const query = `SELECT
      i.id,
      i.canonical_name AS name,
      i.country_code AS country,
      i.city,
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
      a.acceptance_rate,
      a.sat_75,
      a.act_75,
      a.gpa_75,
      f.tuition_international,
      f.net_cost_usd,
      f.international_aid_available,
      o.median_earnings_6yr,
      o.graduation_rate_6yr,
      (
        SELECT MIN(r.global_rank)
        FROM canonical.institution_rankings r
        WHERE r.institution_id = i.id
      ) AS ranking
    FROM canonical.institutions i
    LEFT JOIN canonical.institution_admissions a ON a.institution_id = i.id
    LEFT JOIN canonical.institution_financials f ON f.institution_id = i.id
    LEFT JOIN canonical.institution_outcomes o ON o.institution_id = i.id
    LEFT JOIN (
      SELECT institution_id, ARRAY_AGG(program_name) AS programs
      FROM canonical.institution_programs
      GROUP BY institution_id
    ) p ON p.institution_id = i.id
    LIMIT $1`;
  const payload = [Math.max(60, safeLimit * 5)];
  try {
    logRawSql(query, payload);
    const { rows } = await pool.query(query, payload);
    logQueryResult(rows, null);
    const scored = (Array.isArray(rows) ? rows : []).map((row) => {
      const features = featureVector(normalizedStudent || {}, row || {}, {}, {
        popularity_score: 0,
        search_volume_score: 0,
      });
      const prediction = fallbackPrediction(features);
      const admitChance = estimateAdmitChance(features);
      return {
        college_id: row?.id || null,
        college_name: row?.name || 'Unknown institution',
        country: toCountryName(row?.country) || 'Unknown',
        overall_score: Number((prediction.score * 100).toFixed(2)),
        confidence_score: Number((prediction.confidence || 0.55).toFixed(4)),
        classification: classifyPortfolioBucket(admitChance),
        admit_chance: Number((admitChance * 100).toFixed(1)),
        score_breakdown: {
          major_fit: Number((features.major_availability * 100).toFixed(1)),
          ranking_fit: Number((features.normalized_global_ranking * 100).toFixed(1)),
          subject_ranking_fit: Number((features.subject_ranking_alignment * 100).toFixed(1)),
          admissions_fit: Number((features.admissions_fit * 100).toFixed(1)),
          affordability_fit: Number((features.affordability_fit * 100).toFixed(1)),
          outcomes_fit: Number((features.outcomes_alignment * 100).toFixed(1)),
          popularity_fit: 0,
          country_fit: Number((features.country_match * 100).toFixed(1)),
          retrieval_fit: 0,
          rerank_fit: 0,
          feedback_fit: 50,
        },
        explanation: {
          confidence_score: 0.55,
          confidence_label: 'medium',
          feature_importance: [],
          reasoning_summary: 'Fallback recommendation generated due to transient ranking pipeline issue.',
          reasons: ['deterministic fallback', 'admissions fit', 'major fit', 'ranking fit'],
        },
        why_values: ['deterministic fallback', 'admissions fit', 'major fit', 'ranking fit'],
        reasoning: [
          'Fallback recommendation generated from deterministic scoring.',
          `Confidence: ${Math.round((prediction.confidence || 0.55) * 100)}%`,
          `Portfolio bucket: ${classifyPortfolioBucket(admitChance)}`,
        ],
        financial_intelligence: {
          scholarship_probability: 0,
          scholarship_confidence: 0,
          roi_score: 0,
          break_even_years: null,
          loan_feasibility_score: 0,
          loan_confidence: 0,
          affordability_score: Number(features.affordability_fit.toFixed(6)),
          affordability_confidence: 0.5,
          inr_fx_risk_score: 0,
          currency_confidence: 0,
          sbi_eligible: false,
          credila_compatible: false,
          collateral_required: null,
        },
        uncertainty: {
          profile_uncertainty: 0,
          clarifying_questions: nextClarifyingQuestions(normalizedStudent || {}),
        },
        retrieval_quality: {},
      };
    })
      .filter((r) => r.college_id)
      .sort((a, b) => b.overall_score - a.overall_score)
      .slice(0, safeLimit);

    return {
      recommendations: scored,
      metadata: {
        pipeline: 'v3-fallback',
        fallbackUsed: true,
        fallbackStrategy: 'deterministic-scoring',
      },
      diagnostics: {
        stage: 'fallback',
        fallback: true,
        reason: cause?.message || 'primary pipeline failure',
      },
    };
  } catch (fallbackError) {
    logQueryResult(null, fallbackError);
    logRecommendationPipelineError(fallbackError, { stage: 'deterministic_fallback' });
    return {
      recommendations: [],
      metadata: {
        pipeline: 'v3-fallback-empty',
        fallbackUsed: true,
        fallbackStrategy: 'empty-safe',
      },
      diagnostics: {
        stage: 'fallback',
        fallback: true,
        reason: cause?.message || 'primary pipeline failure',
        fallbackError: fallbackError?.message || 'fallback failed',
      },
    };
  }
}

async function generateRecommendationsV2(userProfile, options = {}) {
  const pipelineStartedAt = Date.now();
  const stageTimings = {};
  let currentStage = '[1] Loading student profile';
  let normalizedStudent = normalizeStudentProfile(userProfile || {});

  try {
    console.log('[1] Loading student profile');
    const stage1Start = Date.now();
    normalizedStudent = normalizeStudentProfile(userProfile || {});
    stageTimings.loading_student_profile_ms = Date.now() - stage1Start;

    currentStage = '[2] Candidate retrieval';
    console.log('[2] Candidate retrieval');
    const stage2Start = Date.now();
    const uncertainty = profileUncertainty(normalizedStudent);
    const sparseInference = inferFromSparseProfile(normalizedStudent || {});
    const mergedProfile = { ...(normalizedStudent || {}), ...(sparseInference || {}) };
    stageTimings.candidate_retrieval_ms = Date.now() - stage2Start;

    currentStage = '[3] Embedding search';
    console.log('[3] Embedding search');
    const stage3Start = Date.now();
    const queryContext = await buildEmbeddingQueryContext(mergedProfile);
    const hybridCandidates = await retrieveHybridCandidates({
      embeddingLiteral: queryContext?.embeddingLiteral,
      terms: Array.isArray(queryContext?.lexicalTerms) ? queryContext.lexicalTerms : [],
      subjectTargets: Array.isArray(queryContext?.subjectTargets) ? queryContext.subjectTargets : [],
      metadataFilters: {
        maxBudgetUsd: mergedProfile?.maxBudgetUsd,
        country: options?.countryFilter || null,
      },
      limit: Math.max(100, Math.min(350, Number(options?.candidateLimit) || 220)),
    });
    const retrievalCandidates = crossEncoderRerank(
      Array.isArray(hybridCandidates) ? hybridCandidates : [],
      Array.isArray(queryContext?.lexicalTerms) ? queryContext.lexicalTerms : []
    );
    stageTimings.embedding_search_ms = Date.now() - stage3Start;

    currentStage = '[4] Ranking feature engineering';
    console.log('[4] Ranking feature engineering');
    const stage4Start = Date.now();
    const candidateIds = (Array.isArray(retrievalCandidates) ? retrievalCandidates : [])
      .map((c) => c?.id)
      .filter(Boolean);
    const candidateRows = await fetchCandidateInstitutionRows(candidateIds);
    const rankedInputs = [];
    for (const row of (Array.isArray(candidateRows) ? candidateRows : [])) {
      const retrievalRow = (Array.isArray(retrievalCandidates) ? retrievalCandidates : []).find((c) => c?.id === row?.id) || {};
      let rankingSignals = {
        normalized_rank_score: 0,
        subject_rank_score: 0,
        ranking_confidence: 0,
        subject_weight: 0.35,
        calibrated_score: 0,
      };
      try {
        rankingSignals = await getInstitutionRankingSignals(row?.id, {
          subjectMatch: retrievalRow?.subject_relevance,
          country: toCountryName(row?.country),
        });
      } catch (rankingError) {
        logRecommendationPipelineError(rankingError, { stage: 'ranking_signals', institutionId: row?.id });
      }
      const popularitySignals = {
        popularity_score: Number(row?.popularity_score) || 0,
        search_volume_score: Number(row?.search_volume_score) || 0,
        trending_delta_30d: Number(row?.trending_delta_30d) || 0,
      };
      rankedInputs.push({
        institution_id: row?.id || null,
        row: row || {},
        retrieval: retrievalRow || {},
        features: featureVector(mergedProfile || {}, row || {}, rankingSignals || {}, popularitySignals || {}),
      });
    }
    stageTimings.feature_engineering_ms = Date.now() - stage4Start;

    currentStage = '[5] LTR scoring';
    console.log('[5] LTR scoring');
    const stage5Start = Date.now();
    let predictions = [];
    try {
      predictions = rankCandidates(rankedInputs.map((r) => ({
        institution_id: r?.institution_id,
        features: r?.features || {},
      })));
    } catch (rankError) {
      logRecommendationPipelineError(rankError, { stage: 'ltr_scoring' });
      predictions = rankedInputs.map((r) => ({
        institution_id: r?.institution_id,
        ...fallbackPrediction(r?.features || {}),
      }));
    }
    const scoreMap = new Map((Array.isArray(predictions) ? predictions : []).map((p) => [p?.institution_id, p]));
    stageTimings.ltr_scoring_ms = Date.now() - stage5Start;

    const enriched = [];
    for (const entry of rankedInputs) {
      if (!entry?.institution_id) continue;
      try {
        const prediction = scoreMap.get(entry.institution_id) || { score: 0, confidence: 0.4, contributions: {} };
        const adjustedScore = confidenceAdjustedScore(prediction?.score || 0, uncertainty);
        const admitChance = estimateAdmitChance(entry?.features || {});
        const explanation = generateRecommendationExplanation(entry?.row || {}, prediction?.contributions || {}, prediction?.confidence || 0.4);
        let feedbackSignals = { implicit_score: 0, explicit_rating: null, fit_rating: null, affordability_rating: null };
        try {
          feedbackSignals = await aggregateInstitutionFeedback(entry?.row?.id);
        } catch (feedbackError) {
          logRecommendationPipelineError(feedbackError, { stage: 'feedback_aggregation', institutionId: entry?.row?.id });
        }
        const scholarship = predictScholarshipProbability({ profile: mergedProfile || {}, institution: entry?.row || {} });
        const roi = projectRoi({
          tuitionTotalUsd: (Number(entry?.row?.net_cost_usd || entry?.row?.tuition_international) || 0) * 4,
          expectedSalaryUsd: Number(entry?.row?.median_earnings_6yr) || 0,
        });
        const loan = evaluateLoanFeasibility({
          institution: { ...(entry?.row || {}), country: toCountryName(entry?.row?.country) },
          amountUsd: Number(entry?.row?.net_cost_usd || entry?.row?.tuition_international) || 0,
          hasCollateral: Boolean(userProfile?.financial?.has_collateral),
          profile: mergedProfile || {},
        });
        const affordability = projectAffordability({
          annualCostUsd: Number(entry?.row?.net_cost_usd || entry?.row?.tuition_international) || 0,
          annualBudgetUsd: Number(mergedProfile?.maxBudgetUsd) || 0,
          scholarshipProbability: Number(scholarship?.probability) || 0,
          expectedAidUsd: (Number(entry?.row?.tuition_international) || 0) * 0.1,
        });
        const currencyRisk = assessCurrencyRisk({
          annualCostUsd: Number(entry?.row?.net_cost_usd || entry?.row?.tuition_international) || 0,
          usdInrRate: Number(mergedProfile?.usdInrRate) || 83,
          usdInrVolatility: 0.08,
        });

        enriched.push({
          college_id: entry?.row?.id || null,
          college_name: entry?.row?.name || 'Unknown institution',
          country: toCountryName(entry?.row?.country) || 'Unknown',
          city: entry?.row?.city || null,
          semantic_tags: Array.isArray(entry?.row?.semantic_tags) ? entry.row.semantic_tags : [],
          rankScore: adjustedScore,
          confidence: Math.max(0.25, (prediction?.confidence || 0.4) * (1 - uncertainty * 0.2)),
          admitChance,
          bucket: classifyPortfolioBucket(admitChance),
          features: entry?.features || {},
          explanation: explanation || { reasons: [], reasoning_summary: '' },
          ranking_score: entry?.features?.normalized_global_ranking || 0,
          subject_rank_score: entry?.features?.subject_ranking_alignment || 0,
          popularity_score: entry?.features?.popularity_score || 0,
          affordability_score: entry?.features?.affordability_fit || 0,
          retrieval_score: Number(entry?.retrieval?.hybrid_score) || 0,
          rerank_score: Number(entry?.retrieval?.rerank_score) || 0,
          feedback_score: Number(feedbackSignals?.implicit_score) || 0,
          scholarship: scholarship || { probability: 0, confidence: 0 },
          roi: roi || { roi_score: 0, break_even_years: null },
          loan: loan || { feasibility_score: 0, confidence: 0, sbi_eligible: false, credila_compatible: false, collateral_required: null },
          affordability: affordability || { affordability_score: 0, confidence: 0 },
          currencyRisk: currencyRisk || { inr_fx_risk_score: 0, confidence: 0 },
        });
      } catch (enrichmentError) {
        logRecommendationPipelineError(enrichmentError, { stage: 'candidate_enrichment', institutionId: entry?.institution_id });
      }
    }

    currentStage = '[6] Portfolio diversification';
    console.log('[6] Portfolio diversification');
    const stage6Start = Date.now();
    let preferenceModel = { preferredCountries: [], preferredTags: [], implicitAffinity: 0 };
    if (options?.userId) {
      try {
        preferenceModel = await buildUserPreferenceModel(options.userId);
      } catch (preferenceError) {
        logRecommendationPipelineError(preferenceError, { stage: 'personalization_model', userId: options.userId });
      }
    }
    const personalized = rerankWithPersonalization(enriched, preferenceModel || {});
    const exploratory = diversifyForExploration(personalized, uncertainty);
    const diversified = diversifyPortfolio(exploratory, {
      targetCount: Math.max(10, Math.min(30, Number(options?.limit) || 20)),
    });
    stageTimings.portfolio_diversification_ms = Date.now() - stage6Start;

    currentStage = '[7] Final serialization';
    console.log('[7] Final serialization');
    const stage7Start = Date.now();
    const retrievalEval = evaluateRetrievalBatch({
      candidates: Array.isArray(retrievalCandidates) ? retrievalCandidates : [],
      relevantInstitutionIds: (Array.isArray(diversified) ? diversified : []).slice(0, 20).map((i) => i?.college_id).filter(Boolean),
      k: 20,
    });
    const recommendations = (Array.isArray(diversified) ? diversified : []).map((item) => ({
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
    stageTimings.final_serialization_ms = Date.now() - stage7Start;

    return {
      recommendations,
      metadata: {
        pipeline: 'v3',
        fallbackUsed: false,
        durationMs: Date.now() - pipelineStartedAt,
        stageTimings,
      },
      diagnostics: {
        stage: 'completed',
        candidateCount: rankedInputs.length,
        retrievalCount: Array.isArray(retrievalCandidates) ? retrievalCandidates.length : 0,
      },
    };
  } catch (error) {
    logRecommendationPipelineError(error, { stage: currentStage });
    const fallback = await generateDeterministicFallbackRecommendations(normalizedStudent, options, error);
    return {
      recommendations: Array.isArray(fallback?.recommendations) ? fallback.recommendations : [],
      metadata: {
        ...(fallback?.metadata || {}),
        durationMs: Date.now() - pipelineStartedAt,
        stageTimings,
      },
      diagnostics: {
        ...(fallback?.diagnostics || {}),
        failedStage: currentStage,
      },
    };
  }
}

module.exports = {
  generateRecommendationsV2,
};
