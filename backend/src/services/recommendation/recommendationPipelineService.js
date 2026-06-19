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
const {
  assertJsonSerializable,
  elapsedMs,
  logStageComplete,
  logStageFailure,
  logStageStart,
  nowMs,
  safeFiniteNumber,
  verifyCanonicalInfrastructure,
} = require('./pipelineDiagnostics');

function toCountryName(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const map = { US: 'United States', USA: 'United States', UK: 'United Kingdom', IN: 'India' };
  return map[raw.toUpperCase()] || raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

// mv_college_cards.country_code is ISO-2. Student preferences arrive as full names
// ("United States") or ISO. Normalise both sides to ISO-2 so country filtering and
// country_match scoring actually line up (previously "united states" vs "us" → no match).
const COUNTRY_NAME_TO_ISO = {
  'united states': 'US', usa: 'US', us: 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB',
  canada: 'CA', australia: 'AU', germany: 'DE', netherlands: 'NL', singapore: 'SG',
  ireland: 'IE', india: 'IN', france: 'FR', 'new zealand': 'NZ', switzerland: 'CH',
  sweden: 'SE', 'south korea': 'KR', korea: 'KR', japan: 'JP', italy: 'IT', spain: 'ES',
  uae: 'AE', 'united arab emirates': 'AE', china: 'CN', 'hong kong': 'HK',
};
function toIsoCountry(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_NAME_TO_ISO[raw.toLowerCase()] || raw.toUpperCase();
}

function classifyPortfolioBucket(admitChance) {
  if (admitChance >= 0.68) return 'safety';
  if (admitChance >= 0.38) return 'target';
  return 'reach';
}

// Selectivity-aware bucketing. The crude fallback admit estimate compresses a strong
// applicant to ~50-60% at almost every school, collapsing the portfolio to all-"target".
// A college's own acceptance rate is the dominant prior for reach/target/safety, nudged
// by fit — so a <15%-accept school is a reach for everyone and a >55%-accept school is a
// safety for a competitive applicant.
function classifyBySelectivity(acceptRate, admitChance) {
  const ar = Number(acceptRate);
  if (!Number.isFinite(ar) || ar <= 0) return classifyPortfolioBucket(admitChance);
  if (ar < 0.15) return 'reach';
  if (ar > 0.55) return admitChance >= 0.45 ? 'safety' : 'target';
  return admitChance >= 0.60 ? 'safety' : admitChance >= 0.38 ? 'target' : 'reach';
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

function safePercent(value, multiplier = 100, decimals = 1, fallback = 0) {
  return Number((safeFiniteNumber(value, fallback) * multiplier).toFixed(decimals));
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
       c.id,
       c.canonical_name AS name,
       c.country_code AS country,
       c.city,
       c.institution_type,
       c.description,
       COALESCE(NULLIF((c.metadata->>'research_intensity_score'),'')::numeric, 0.4) AS research_intensity_score,
       COALESCE(
         ARRAY(
            SELECT jsonb_array_elements_text(
              COALESCE(c.metadata->'tags', '[]'::jsonb)
            )
          ),
          ARRAY[]::text[]
        ) AS semantic_tags,
        p.programs,
        c.acceptance_rate,
        c.sat_50 AS sat_75,
        c.act_50 AS act_75,
        NULL::numeric AS gpa_75,
        c.tuition_international,
        c.cost_of_attendance AS net_cost_usd,
        TRUE AS international_aid_available,
        c.median_start_salary AS median_earnings_6yr,
        c.graduation_rate_4yr AS graduation_rate_6yr,
        c.popularity_score,
        0::numeric AS search_volume_score,
        0::numeric AS trending_delta_30d
       FROM canonical.mv_college_cards c
       LEFT JOIN (
         SELECT institution_id, ARRAY_AGG(program_name) AS programs
         FROM canonical.institution_programs
         GROUP BY institution_id
       ) p ON p.institution_id = c.id
       WHERE c.id = ANY($1::uuid[])`;
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
    maxBudgetUsd: userProfile.financial?.max_budget_per_year_usd
      || userProfile.financial?.max_budget_per_year // shape emitted by User.getAcademicProfile
      || userProfile.max_budget_per_year_usd || userProfile.max_budget_per_year
      || userProfile.maxBudgetUsd || null,
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

  // Normalise the student's preferred countries to ISO-2 so country filtering and
  // country_match scoring line up with mv_college_cards.country_code.
  const isoCountries = [...new Set(
    (Array.isArray(normalizedStudent.preferredCountries) ? normalizedStudent.preferredCountries : [])
      .map(toIsoCountry)
      .filter(Boolean),
  )];
  const scoringStudent = { ...normalizedStudent, preferredCountries: isoCountries };

  // Candidate pool: quality-FIRST (globally-ranked institutions surface ahead of the
  // long tail of unranked/for-profit colleges) and, when the student named target
  // countries, restricted to those. Previously this was `LIMIT 60` with no WHERE/ORDER
  // BY, so it returned an arbitrary set (Puerto Rico technical colleges, etc.) identical
  // for every student regardless of profile.
  const poolSize = Math.max(180, safeLimit * 12);
  const useCountryFilter = isoCountries.length > 0;
  const baseSelect = `SELECT
      c.id,
      c.canonical_name AS name,
      c.country_code AS country,
      c.city,
      c.description,
      COALESCE(
        ARRAY(
          SELECT jsonb_array_elements_text(
            COALESCE(c.metadata->'tags', '[]'::jsonb)
          )
        ),
        ARRAY[]::text[]
      ) AS semantic_tags,
      p.programs,
      c.acceptance_rate,
      c.sat_50 AS sat_75,
      c.act_50 AS act_75,
      NULL::numeric AS gpa_75,
      c.tuition_international,
      c.cost_of_attendance AS net_cost_usd,
      TRUE AS international_aid_available,
      c.median_start_salary AS median_earnings_6yr,
      c.graduation_rate_4yr AS graduation_rate_6yr,
      c.popularity_score,
      (
        SELECT MIN(r.global_rank)
        FROM canonical.institution_rankings r
        WHERE r.institution_id = c.id
      ) AS ranking
    FROM canonical.mv_college_cards c
    LEFT JOIN (
      SELECT institution_id, ARRAY_AGG(program_name) AS programs
      FROM canonical.institution_programs
      GROUP BY institution_id
    ) p ON p.institution_id = c.id`;
  const orderBy = ` ORDER BY ranking ASC NULLS LAST, c.popularity_score DESC NULLS LAST, c.acceptance_rate ASC NULLS LAST`;
  const query = useCountryFilter
    ? `${baseSelect} WHERE c.country_code = ANY($2::text[])${orderBy} LIMIT $1`
    : `${baseSelect}${orderBy} LIMIT $1`;
  const payload = useCountryFilter ? [poolSize, isoCountries] : [poolSize];
  try {
    logRawSql(query, payload);
    let { rows } = await pool.query(query, payload);
    // If the country filter starved the pool (sparse data for that country), retry unfiltered.
    if (useCountryFilter && (!Array.isArray(rows) || rows.length < safeLimit)) {
      const retry = await pool.query(`${baseSelect}${orderBy} LIMIT $1`, [poolSize]);
      rows = Array.isArray(retry.rows) ? retry.rows : rows;
    }
    logQueryResult(rows, null);
    const scoredAll = (Array.isArray(rows) ? rows : []).map((row) => {
      const features = featureVector(scoringStudent || {}, row || {}, {}, {
        popularity_score: Number(row?.popularity_score) || 0,
        search_volume_score: 0,
      });
      const prediction = fallbackPrediction(features);
      const admitChance = estimateAdmitChance(features);
      const bucket = classifyBySelectivity(row?.acceptance_rate, admitChance);
      return {
        college_id: row?.id || null,
        college_name: row?.name || 'Unknown institution',
        country: toCountryName(row?.country) || 'Unknown',
        overall_score: Number((prediction.score * 100).toFixed(2)),
        confidence_score: Number((prediction.confidence || 0.55).toFixed(4)),
        classification: bucket,
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
          `Portfolio bucket: ${bucket}`,
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
      .sort((a, b) => b.overall_score - a.overall_score);

    // Build a balanced reach/target/safety portfolio instead of returning the top-N
    // by score (which previously produced all-"target" lists). Quotas: 35% reach,
    // 40% target, 25% safety; shortfalls in any bucket are backfilled by score.
    const byBucket = { reach: [], target: [], safety: [] };
    for (const r of scoredAll) (byBucket[r.classification] || byBucket.target).push(r);
    const quota = {
      reach: Math.round(safeLimit * 0.35),
      target: Math.round(safeLimit * 0.40),
      safety: 0,
    };
    quota.safety = Math.max(0, safeLimit - quota.reach - quota.target);
    const picked = [];
    const pickedIds = new Set();
    for (const bucket of ['reach', 'target', 'safety']) {
      for (const r of byBucket[bucket].slice(0, quota[bucket])) {
        picked.push(r); pickedIds.add(r.college_id);
      }
    }
    // Backfill to safeLimit from the highest-scored remaining candidates.
    if (picked.length < safeLimit) {
      for (const r of scoredAll) {
        if (picked.length >= safeLimit) break;
        if (!pickedIds.has(r.college_id)) { picked.push(r); pickedIds.add(r.college_id); }
      }
    }
    const scored = picked.sort((a, b) => b.overall_score - a.overall_score).slice(0, safeLimit);

    return {
      recommendations: scored,
      metadata: {
        pipeline: 'v3-fallback',
        fallbackUsed: true,
        fallbackStrategy: 'deterministic-scoring-balanced',
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
  const pipelineStartedAt = nowMs();
  const stageTimings = {};
  let currentStage = '[3] loading student profile';
  let normalizedStudent = normalizeStudentProfile(userProfile || {});
  let mergedProfile = { ...(normalizedStudent || {}) };
  let retrievalCandidates = [];
  let rankedInputs = [];
  let uncertainty = 0;
  let infraDiagnostics = null;

  async function runStage(label, key, handler) {
    currentStage = label;
    const stageStartedAt = nowMs();
    logStageStart(label, { requestId: options.requestId || null, key });
    try {
      const result = await handler();
      stageTimings[key] = elapsedMs(stageStartedAt);
      logStageComplete(label, stageStartedAt, { requestId: options.requestId || null, key });
      return result;
    } catch (error) {
      stageTimings[key] = elapsedMs(stageStartedAt);
      logStageFailure(label, error, {
        requestId: options.requestId || null,
        key,
        service: 'recommendation_pipeline',
        startedAt: stageStartedAt,
      });
      throw error;
    }
  }

  try {
    await runStage('[3] loading student profile', 'loading_student_profile_ms', async () => {
      normalizedStudent = normalizeStudentProfile(userProfile || {});
      uncertainty = profileUncertainty(normalizedStudent);
      const sparseInference = inferFromSparseProfile(normalizedStudent || {});
      mergedProfile = { ...(normalizedStudent || {}), ...(sparseInference || {}) };
    });

    await runStage('[4] candidate retrieval', 'candidate_retrieval_ms', async () => {
      if (options?.runInfraDiagnostics) {
        infraDiagnostics = await verifyCanonicalInfrastructure(options.requestId || null);
      }
    });

    await runStage('[5] embedding lookup', 'embedding_lookup_ms', async () => {
      const queryContext = await buildEmbeddingQueryContext(mergedProfile || {});
      const embeddingHealth = infraDiagnostics?.vector || {};
      const canUseEmbeddings = embeddingHealth.installed && Number(embeddingHealth.embeddingCount) > 0;
      if (!canUseEmbeddings) {
        console.warn('[EMBEDDING FALLBACK]', {
          requestId: options.requestId || null,
          installed: embeddingHealth.installed,
          embeddingCount: embeddingHealth.embeddingCount,
          reason: 'vector infrastructure unavailable or embeddings empty',
        });
        retrievalCandidates = [];
        return;
      }
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
      const candidates = Array.isArray(hybridCandidates) ? hybridCandidates : [];
      console.log('[1] candidates:', candidates.length);
      retrievalCandidates = crossEncoderRerank(
        candidates,
        Array.isArray(queryContext?.lexicalTerms) ? queryContext.lexicalTerms : []
      );
      const retrieved = Array.isArray(retrievalCandidates) ? retrievalCandidates : [];
      console.log('[2] retrieved:', retrieved.length);
    });

    // If embeddings were unavailable or returned no candidates, skip to deterministic fallback
    if (!Array.isArray(retrievalCandidates) || retrievalCandidates.length === 0) {
      console.log('[DETERMINISTIC FALLBACK] Using deterministic recommendations due to empty retrieval');
      const fallback = await generateDeterministicFallbackRecommendations(normalizedStudent, options, 'empty_retrieval');
      return {
        recommendations: Array.isArray(fallback?.recommendations) ? fallback.recommendations : [],
        metadata: {
          pipeline: 'v3',
          fallbackUsed: true,
          fallbackReason: 'empty_retrieval',
          durationMs: nowMs() - pipelineStartedAt,
          stageTimings,
        },
        diagnostics: {
          stage: 'fallback',
          infrastructure: infraDiagnostics || null,
        },
      };
    }

    await runStage('[6] ranking feature engineering', 'ranking_feature_engineering_ms', async () => {
      const candidateIds = (Array.isArray(retrievalCandidates) ? retrievalCandidates : [])
        .map((c) => c?.id)
        .filter(Boolean);
      const candidateRows = await fetchCandidateInstitutionRows(candidateIds);
      rankedInputs = [];
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
          logStageFailure('ranking_signals', rankingError, { institutionId: row?.id, requestId: options.requestId || null });
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
      if (!rankedInputs.length) {
        throw new Error('No ranked candidates available after retrieval/feature engineering');
      }
    });

    const enriched = await runStage('[7] LTR scoring', 'ltr_scoring_ms', async () => {
      let predictions = [];
      try {
        predictions = rankCandidates(rankedInputs.map((r) => ({
          institution_id: r?.institution_id,
          features: r?.features || {},
        })));
      } catch (rankError) {
        logStageFailure('ltr_scoring', rankError, { requestId: options.requestId || null });
        predictions = rankedInputs.map((r) => ({
          institution_id: r?.institution_id,
          ...fallbackPrediction(r?.features || {}),
        }));
      }

      const scoreMap = new Map((Array.isArray(predictions) ? predictions : []).map((p) => [p?.institution_id, p]));
      const out = [];
      for (const entry of (Array.isArray(rankedInputs) ? rankedInputs : [])) {
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
            logStageFailure('feedback_aggregation', feedbackError, { institutionId: entry?.row?.id, requestId: options.requestId || null });
          }

          let scholarship = { probability: 0, confidence: 0 };
          let roi = { roi_score: 0, break_even_years: null };
          let loan = { feasibility_score: 0, confidence: 0, sbi_eligible: false, credila_compatible: false, collateral_required: null };
          let affordability = { affordability_score: 0, confidence: 0 };
          let currencyRisk = { inr_fx_risk_score: 0, confidence: 0 };
          try {
            scholarship = predictScholarshipProbability({ profile: mergedProfile || {}, institution: entry?.row || {} }) || scholarship;
            roi = projectRoi({
              tuitionTotalUsd: (Number(entry?.row?.net_cost_usd || entry?.row?.tuition_international) || 0) * 4,
              expectedSalaryUsd: Number(entry?.row?.median_earnings_6yr) || 0,
            }) || roi;
            loan = evaluateLoanFeasibility({
              institution: { ...(entry?.row || {}), country: toCountryName(entry?.row?.country) },
              amountUsd: Number(entry?.row?.net_cost_usd || entry?.row?.tuition_international) || 0,
              hasCollateral: Boolean(userProfile?.financial?.has_collateral),
              profile: mergedProfile || {},
            }) || loan;
            affordability = projectAffordability({
              annualCostUsd: Number(entry?.row?.net_cost_usd || entry?.row?.tuition_international) || 0,
              annualBudgetUsd: Number(mergedProfile?.maxBudgetUsd) || 0,
              scholarshipProbability: Number(scholarship?.probability) || 0,
              expectedAidUsd: (Number(entry?.row?.tuition_international) || 0) * 0.1,
            }) || affordability;
            currencyRisk = assessCurrencyRisk({
              annualCostUsd: Number(entry?.row?.net_cost_usd || entry?.row?.tuition_international) || 0,
              usdInrRate: Number(mergedProfile?.usdInrRate) || 83,
              usdInrVolatility: 0.08,
            }) || currencyRisk;
          } catch (financialError) {
            logStageFailure('financial_scoring', financialError, { institutionId: entry?.institution_id, requestId: options.requestId || null });
          }

          out.push({
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
            retrieval_score: Number(entry?.retrieval?.hybrid_score) || 0,
            rerank_score: Number(entry?.retrieval?.rerank_score) || 0,
            feedback_score: Number(feedbackSignals?.implicit_score) || 0,
            scholarship,
            roi,
            loan,
            affordability,
            currencyRisk,
          });
        } catch (enrichmentError) {
          logStageFailure('candidate_enrichment', enrichmentError, { institutionId: entry?.institution_id, requestId: options.requestId || null });
        }
      }
      return out;
    });
    const ranked = Array.isArray(enriched) ? enriched : [];
    console.log('[3] ranked:', ranked.length);

    const diversified = await runStage('[8] portfolio diversification', 'portfolio_diversification_ms', async () => {
      let preferenceModel = { preferredCountries: [], preferredTags: [], implicitAffinity: 0 };
      if (options?.userId) {
        try {
          preferenceModel = await buildUserPreferenceModel(options.userId);
        } catch (preferenceError) {
          logStageFailure('personalization_model', preferenceError, { userId: options.userId, requestId: options.requestId || null });
        }
      }
      const personalized = rerankWithPersonalization(Array.isArray(enriched) ? enriched : [], preferenceModel || {});
      const exploratory = diversifyForExploration(personalized || [], uncertainty);
      return diversifyPortfolio(exploratory, {
        targetCount: Math.max(10, Math.min(30, Number(options?.limit) || 20)),
      });
    });
    console.log('[4] diversified:', diversified?.length);

    const finalRecommendations = await runStage('[9] serialization', 'serialization_ms', async () => {
      const retrievalEval = evaluateRetrievalBatch({
        candidates: Array.isArray(retrievalCandidates) ? retrievalCandidates : [],
        relevantInstitutionIds: (Array.isArray(diversified) ? diversified : []).slice(0, 20).map((i) => i?.college_id).filter(Boolean),
        k: 20,
      });

      const payload = (Array.isArray(diversified) ? diversified : []).map((item) => {
        const features = item?.features || {};
        const explanation = item?.explanation || { reasons: [], reasoning_summary: '' };
        const scholarship = item?.scholarship || { probability: 0, confidence: 0 };
        const roi = item?.roi || { roi_score: 0, break_even_years: null };
        const loan = item?.loan || { feasibility_score: 0, confidence: 0, sbi_eligible: false, credila_compatible: false, collateral_required: null };
        const affordability = item?.affordability || { affordability_score: 0, confidence: 0 };
        const currencyRisk = item?.currencyRisk || { inr_fx_risk_score: 0, confidence: 0 };
        return {
          college_id: item?.college_id || null,
          college_name: item?.college_name || 'Unknown institution',
          country: item?.country || 'Unknown',
          overall_score: Number((safeFiniteNumber(item?.rankScore, 0) * 100).toFixed(2)),
          confidence_score: Number(safeFiniteNumber(item?.confidence, 0).toFixed(4)),
          classification: item?.bucket || 'target',
          admit_chance: safePercent(item?.admitChance, 100, 1, 0),
          score_breakdown: {
            major_fit: safePercent(features.major_availability),
            ranking_fit: safePercent(features.normalized_global_ranking),
            subject_ranking_fit: safePercent(features.subject_ranking_alignment),
            admissions_fit: safePercent(features.admissions_fit),
            affordability_fit: safePercent(features.affordability_fit),
            outcomes_fit: safePercent(features.outcomes_alignment),
            popularity_fit: safePercent(features.popularity_score),
            country_fit: safePercent(features.country_match),
            retrieval_fit: safePercent(item?.retrieval_score),
            rerank_fit: safePercent(item?.rerank_score),
            feedback_fit: Number((((safeFiniteNumber(item?.feedback_score, 0)) + 1) * 50).toFixed(1)),
          },
          explanation,
          why_values: Array.isArray(explanation?.reasons) ? explanation.reasons : [],
          reasoning: [
            explanation?.reasoning_summary || 'Generated recommendation',
            `Confidence: ${Math.round(safeFiniteNumber(item?.confidence, 0) * 100)}%`,
            `Portfolio bucket: ${item?.bucket || 'target'}`,
            `Scholarship likelihood: ${Math.round(safeFiniteNumber(scholarship?.probability, 0) * 100)}%`,
            `INR FX risk: ${Math.round(safeFiniteNumber(currencyRisk?.inr_fx_risk_score, 0) * 100)}%`,
          ],
          financial_intelligence: {
            scholarship_probability: safeFiniteNumber(scholarship?.probability, 0),
            scholarship_confidence: safeFiniteNumber(scholarship?.confidence, 0),
            roi_score: safeFiniteNumber(roi?.roi_score, 0),
            break_even_years: roi?.break_even_years ?? null,
            loan_feasibility_score: safeFiniteNumber(loan?.feasibility_score, 0),
            loan_confidence: safeFiniteNumber(loan?.confidence, 0),
            affordability_score: safeFiniteNumber(affordability?.affordability_score, 0),
            affordability_confidence: safeFiniteNumber(affordability?.confidence, 0),
            inr_fx_risk_score: safeFiniteNumber(currencyRisk?.inr_fx_risk_score, 0),
            currency_confidence: safeFiniteNumber(currencyRisk?.confidence, 0),
            sbi_eligible: Boolean(loan?.sbi_eligible),
            credila_compatible: Boolean(loan?.credila_compatible),
            collateral_required: loan?.collateral_required ?? null,
          },
          uncertainty: {
            profile_uncertainty: Number(safeFiniteNumber(uncertainty, 0).toFixed(6)),
            clarifying_questions: nextClarifyingQuestions(mergedProfile || {}),
          },
          retrieval_quality: retrievalEval || {},
        };
      });

      return assertJsonSerializable(payload);
    });
    console.log('[5] final:', finalRecommendations?.length);

    return {
      recommendations: finalRecommendations,
      metadata: {
        pipeline: 'v3',
        fallbackUsed: false,
        durationMs: nowMs() - pipelineStartedAt,
        stageTimings,
      },
      diagnostics: {
        stage: 'completed',
        candidateCount: Array.isArray(rankedInputs) ? rankedInputs.length : 0,
        retrievalCount: Array.isArray(retrievalCandidates) ? retrievalCandidates.length : 0,
        infrastructure: infraDiagnostics || null,
      },
    };
  } catch (error) {
    logRecommendationPipelineError(error, { stage: currentStage, requestId: options.requestId || null });
    const fallback = await generateDeterministicFallbackRecommendations(normalizedStudent, options, error);
    return {
      recommendations: Array.isArray(fallback?.recommendations) ? fallback.recommendations : [],
      metadata: {
        ...(fallback?.metadata || {}),
        durationMs: nowMs() - pipelineStartedAt,
        stageTimings,
      },
      diagnostics: {
        ...(fallback?.diagnostics || {}),
        failedStage: currentStage,
        infrastructure: infraDiagnostics || null,
      },
    };
  }
}

module.exports = {
  generateRecommendationsV2,
};
