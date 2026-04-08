// backend/src/routes/ml.js
// ML-ready data collection routes for future model training

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

/**
 * Check if user has given ML consent
 */
async function hasMLConsent(userId) {
  const pool = dbManager.getDatabase();
  const user = (await pool.query('SELECT ml_consent FROM users WHERE id = $1', [userId])).rows[0];
  return user && user.ml_consent === true;
}

/**
 * POST /api/ml/student-outcome
 * Store student profile + colleges applied to + decision results
 */
router.post('/student-outcome', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Check consent
    if (!(await hasMLConsent(userId))) {
      return res.status(403).json({
        success: false,
        message: 'ML data collection requires user consent. Enable "Contribute to ML improvement" in settings.',
        code: 'ML_CONSENT_REQUIRED'
      });
    }
    
    const {
      collegeId,
      gpa,
      satTotal,
      actComposite,
      classRankPercentile,
      numApCourses,
      activityTier1Count,
      activityTier2Count,
      isFirstGen,
      isLegacy,
      state,
      collegeAcceptanceRate,
      collegeSatMedian,
      collegeType,
      decision,
      enrolled,
      applicationYear
    } = req.body;
    
    if (!collegeId || !decision) {
      return res.status(400).json({
        success: false,
        message: 'collegeId and decision are required'
      });
    }
    
    const validDecisions = ['accepted', 'rejected', 'waitlisted', 'deferred'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        success: false,
        message: `decision must be one of: ${validDecisions.join(', ')}`
      });
    }
    
    const pool = dbManager.getDatabase();
    
    const result = await pool.query(
      `INSERT INTO ml_training_data (
        student_id, college_id, gpa, sat_total, act_composite,
        class_rank_percentile, num_ap_courses, activity_tier_1_count,
        activity_tier_2_count, is_first_gen, is_legacy, state,
        college_acceptance_rate, college_sat_median, college_type,
        decision, enrolled, application_year
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id`,
      [
        userId,
        collegeId,
        gpa || null,
        satTotal || null,
        actComposite || null,
        classRankPercentile || null,
        numApCourses || null,
        activityTier1Count || null,
        activityTier2Count || null,
        !!isFirstGen,
        !!isLegacy,
        state || null,
        collegeAcceptanceRate || null,
        collegeSatMedian || null,
        collegeType || null,
        decision,
        !!enrolled,
        applicationYear || new Date().getFullYear()
      ]
    );
    
    logger.info(`ML training data recorded for user ${userId}, college ${sanitizeForLog(collegeId)}, decision: ${sanitizeForLog(decision)}`);
    
    res.status(201).json({
      success: true,
      message: 'Outcome recorded successfully',
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    logger.error('ML student-outcome failed:', error);
    next(error);
  }
});

/**
 * POST /api/ml/track-interaction
 * Log user behavior for recommendation engine
 */
router.post('/track-interaction', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Check consent
    if (!(await hasMLConsent(userId))) {
      return res.status(403).json({
        success: false,
        message: 'ML data collection requires user consent',
        code: 'ML_CONSENT_REQUIRED'
      });
    }
    
    const { collegeId, interactionType, sessionId } = req.body;
    
    if (!collegeId || !interactionType) {
      return res.status(400).json({
        success: false,
        message: 'collegeId and interactionType are required'
      });
    }
    
    const validTypes = ['viewed', 'saved', 'applied', 'removed'];
    if (!validTypes.includes(interactionType)) {
      return res.status(400).json({
        success: false,
        message: `interactionType must be one of: ${validTypes.join(', ')}`
      });
    }
    
    const pool = dbManager.getDatabase();
    
    const result = await pool.query(
      `INSERT INTO ml_user_interactions (
        student_id, college_id, interaction_type, session_id, timestamp
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING id`,
      [userId, collegeId, interactionType, sessionId || null]
    );
    
    res.status(201).json({
      success: true,
      message: 'Interaction tracked',
      data: { id: result.rows[0].id }
    });
  } catch (error) {
    logger.error('ML track-interaction failed:', error);
    next(error);
  }
});

/**
 * POST /api/ml/essay-submission
 * Store essays for future NLP training
 */
router.post('/essay-submission', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Check consent
    if (!(await hasMLConsent(userId))) {
      return res.status(403).json({
        success: false,
        message: 'ML data collection requires user consent',
        code: 'ML_CONSENT_REQUIRED'
      });
    }
    
    const {
      collegeId,
      essayPromptType,
      essayText,
      qualityScore
    } = req.body;
    
    if (!essayText) {
      return res.status(400).json({
        success: false,
        message: 'essayText is required'
      });
    }
    
    // Validate quality score if provided
    if (qualityScore !== undefined && qualityScore !== null) {
      if (!Number.isInteger(qualityScore) || qualityScore < 1 || qualityScore > 10) {
        return res.status(400).json({
          success: false,
          message: 'qualityScore must be an integer between 1 and 10'
        });
      }
    }
    
    // Normalize whitespace and count words
    const normalizedText = essayText.replace(/\s+/g, ' ').trim();
    const wordCount = normalizedText.split(' ').filter(w => w.length > 0).length;
    
    const pool = dbManager.getDatabase();
    
    const result = await pool.query(
      `INSERT INTO ml_essays (
        student_id, college_id, essay_prompt_type, essay_text,
        word_count, quality_score
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [userId, collegeId || null, essayPromptType || null, essayText, wordCount, qualityScore || null]
    );
    
    logger.info(`ML essay submission recorded for user ${userId}, ${sanitizeForLog(wordCount)} words`);
    
    res.status(201).json({
      success: true,
      message: 'Essay submitted for ML training',
      data: {
        id: result.rows[0].id,
        wordCount: wordCount
      }
    });
  } catch (error) {
    logger.error('ML essay-submission failed:', error);
    next(error);
  }
});

/**
 * PATCH /api/ml/essay/:id/outcome
 * Update essay with acceptance outcome (after decision received)
 */
router.patch('/essay/:id/outcome', authenticate, async (req, res, next) => {
  try {
    const essayId = parseInt(req.params.id);
    const userId = req.user.userId;
    const { acceptanceOutcome } = req.body;
    
    const validOutcomes = ['accepted', 'rejected', 'waitlisted', 'pending'];
    if (!validOutcomes.includes(acceptanceOutcome)) {
      return res.status(400).json({
        success: false,
        message: `acceptanceOutcome must be one of: ${validOutcomes.join(', ')}`
      });
    }
    
    const pool = dbManager.getDatabase();
    
    // Verify ownership
    const essay = (await pool.query('SELECT * FROM ml_essays WHERE id = $1 AND student_id = $2', [essayId, userId])).rows[0];
    if (!essay) {
      return res.status(404).json({
        success: false,
        message: 'Essay not found'
      });
    }
    
    await pool.query(
      `UPDATE ml_essays 
       SET acceptance_outcome = $1, updated_at = NOW() 
       WHERE id = $2`,
      [acceptanceOutcome, essayId]
    );
    
    res.json({
      success: true,
      message: 'Essay outcome updated'
    });
  } catch (error) {
    logger.error('ML essay outcome update failed:', error);
    next(error);
  }
});

/**
 * GET /api/ml/export-training-data
 * Admin only endpoint to export anonymized data for model training
 * Note: Currently scoped to user's own data for security
 */
router.get('/export-training-data', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const pool = dbManager.getDatabase();
    const { type = 'all', anonymize = 'true' } = req.query;
    
    const shouldAnonymize = anonymize === 'true';
    
    // Use HMAC with server secret for better anonymization
    const serverSecret = process.env.JWT_SECRET || 'default-ml-hash-secret';
    const hashId = (id) => {
      if (!shouldAnonymize) return id;
      return crypto.createHmac('sha256', serverSecret)
        .update(`student_${id}`)
        .digest('hex')
        .substring(0, 16);
    };
    
    const exportData = {};
    
    // Export training data - ONLY user's own data for non-admin
    if (type === 'all' || type === 'training') {
      const trainingData = (await pool.query(
        `SELECT * FROM ml_training_data WHERE student_id = $1 ORDER BY created_at DESC`,
        [userId]
      )).rows;
      
      exportData.trainingData = trainingData.map(row => ({
        ...row,
        student_id: hashId(row.student_id)
      }));
    }
    
    // Export user interactions - ONLY user's own data
    if (type === 'all' || type === 'interactions') {
      const interactions = (await pool.query(
        `SELECT * FROM ml_user_interactions WHERE student_id = $1 ORDER BY timestamp DESC`,
        [userId]
      )).rows;
      
      exportData.interactions = interactions.map(row => ({
        ...row,
        student_id: hashId(row.student_id),
        session_id: shouldAnonymize ? null : row.session_id
      }));
    }
    
    // Export essays - ONLY user's own data (without text for privacy)
    if (type === 'all' || type === 'essays') {
      const essays = (await pool.query(
        `SELECT id, student_id, college_id, essay_prompt_type, 
                word_count, quality_score, acceptance_outcome, created_at
         FROM ml_essays WHERE student_id = $1 ORDER BY created_at DESC`,
        [userId]
      )).rows;
      
      exportData.essays = essays.map(row => ({
        ...row,
        student_id: hashId(row.student_id)
      }));
    }
    
    // Export model versions (this is public info about deployed models)
    if (type === 'all' || type === 'models') {
      exportData.modelVersions = (await pool.query(
        `SELECT * FROM ml_model_versions ORDER BY created_at DESC`
      )).rows;
    }
    
    // Add metadata
    exportData.metadata = {
      exportedAt: new Date().toISOString(),
      anonymized: shouldAnonymize,
      counts: {
        trainingData: exportData.trainingData?.length || 0,
        interactions: exportData.interactions?.length || 0,
        essays: exportData.essays?.length || 0,
        modelVersions: exportData.modelVersions?.length || 0
      }
    };
    
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    logger.error('ML export failed:', error);
    next(error);
  }
});

/**
 * GET /api/ml/consent
 * Get user's ML consent status
 */
router.get('/consent', authenticate, async (req, res, next) => {
  try {
    const hasConsent = await hasMLConsent(req.user.userId);
    
    res.json({
      success: true,
      data: {
        mlConsent: hasConsent
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/ml/consent
 * Update user's ML consent
 */
router.put('/consent', authenticate, async (req, res, next) => {
  try {
    const { consent } = req.body;
    
    if (typeof consent !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'consent must be a boolean'
      });
    }
    
    const pool = dbManager.getDatabase();
    await pool.query('UPDATE users SET ml_consent = $1 WHERE id = $2', [consent, req.user.userId]);
    
    logger.info(`User ${req.user.userId} updated ML consent to: ${sanitizeForLog(consent)}`);
    
    res.json({
      success: true,
      message: `ML consent ${consent ? 'enabled' : 'disabled'}`,
      data: { mlConsent: consent }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ml/feedback
 * Record a user's real admission outcome and trigger incremental model update.
 * Every RETRAIN_THRESHOLD new rows triggers a background retrain.
 */
router.post('/feedback', authenticate, async (req, res, next) => {
  try {
    const { gpa, sat, act, num_aps, num_ecs, college_name, outcome } = req.body;

    const validOutcomes = ['accepted', 'rejected', 'waitlisted', 'deferred'];
    if (!college_name || !outcome) {
      return res.status(400).json({ success: false, message: 'college_name and outcome are required' });
    }
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({
        success: false,
        message: `outcome must be one of: ${validOutcomes.join(', ')}`
      });
    }

    const pool = dbManager.getDatabase();

    // Persist to scraped_applicants + scraped_results so the training
    // pipeline can pick it up on the next run.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO scraped_applicants
           (reddit_post_id, gpa, sat_score, act_score, num_ap_courses, raw_text)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          `feedback_${req.user.userId}_${Date.now()}`,
          gpa != null ? parseFloat(gpa) : null,
          sat != null ? parseInt(sat, 10) : null,
          act != null ? parseInt(act, 10) : null,
          num_aps != null ? parseInt(num_aps, 10) : null,
          `User feedback: ${outcome} at ${college_name}`,
        ]
      );
      const applicantId = rows[0].id;
      const normalizedName = String(college_name).toLowerCase().replace(/\s+/g, ' ').trim();
      await client.query(
        `INSERT INTO scraped_results
           (applicant_id, school_name_raw, school_name_normalized, outcome)
         VALUES ($1, $2, $3, $4)`,
        [applicantId, college_name, normalizedName, outcome]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Check if we've crossed the retrain threshold
    const RETRAIN_THRESHOLD = parseInt(process.env.FEEDBACK_RETRAIN_THRESHOLD || '100', 10);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM scraped_applicants
       WHERE raw_text LIKE 'User feedback:%'`
    );
    const feedbackCount = parseInt(countRows[0].cnt, 10);

    if (feedbackCount % RETRAIN_THRESHOLD === 0) {
      // Trigger background retrain via the scraper scheduler if available
      try {
        const scraperScheduler = require('../jobs/scraperScheduler');
        scraperScheduler.triggerRetrain();
        logger.info(`Feedback retrain triggered after ${feedbackCount} feedback rows`);
      } catch (_) {
        // Scheduler not loaded — log only
        logger.info(`Feedback milestone ${feedbackCount}: manual retrain recommended`);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Feedback recorded successfully',
      data: { feedbackCount }
    });
  } catch (error) {
    logger.error('ML feedback failed:', error);
    next(error);
  }
});

/**
 * GET /api/ml/stats
 * Returns model accuracy metrics from ml_metadata (XGBoost global model)
 * plus data collection statistics.
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const pool = dbManager.getDatabase();

    // Latest global model stats from ml_metadata (written by training_pipeline.py)
    let modelStats = null;
    try {
      const { rows } = await pool.query(
        `SELECT model_version, accuracy, f1_score, precision_val, recall_val,
                training_samples, last_trained
         FROM ml_metadata
         ORDER BY last_trained DESC
         LIMIT 1`
      );
      if (rows.length) {
        const r = rows[0];
        modelStats = {
          accuracy: parseFloat(r.accuracy),
          f1_score: parseFloat(r.f1_score),
          precision: r.precision_val != null ? parseFloat(r.precision_val) : null,
          recall: r.recall_val != null ? parseFloat(r.recall_val) : null,
          training_samples: parseInt(r.training_samples, 10),
          last_trained: r.last_trained,
          model_version: r.model_version,
        };
      }
    } catch (_) {
      // ml_metadata table may not exist yet — return nulls
    }

    // Data collection stats
    const trainingDataCount = parseInt(
      (await pool.query('SELECT COUNT(*) AS c FROM ml_training_data')).rows[0].c, 10
    );
    const interactionsCount = parseInt(
      (await pool.query('SELECT COUNT(*) AS c FROM ml_user_interactions')).rows[0].c, 10
    );
    const essaysCount = parseInt(
      (await pool.query('SELECT COUNT(*) AS c FROM ml_essays')).rows[0].c, 10
    );
    const usersWithConsent = parseInt(
      (await pool.query('SELECT COUNT(*) AS c FROM users WHERE ml_consent = true')).rows[0].c, 10
    );
    const decisionBreakdown = (await pool.query(
      'SELECT decision, COUNT(*) AS count FROM ml_training_data GROUP BY decision'
    )).rows;

    res.json({
      success: true,
      data: {
        // Global XGBoost model metrics
        model: modelStats,
        // Data collection counters
        trainingDataCount,
        interactionsCount,
        essaysCount,
        usersWithConsent,
        decisionBreakdown,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ml/system-status
 * Get comprehensive ML system status including model training
 */
router.get('/system-status', authenticate, async (req, res, next) => {
  try {
    const mlRetrainingJob = require('../jobs/mlRetraining');
    const status = await mlRetrainingJob.getSystemStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('ML system status failed:', error);
    next(error);
  }
});

/**
 * POST /api/ml/trigger-retraining
 * Manually trigger a model retraining cycle (admin only for production)
 */
router.post('/trigger-retraining', authenticate, async (req, res, next) => {
  try {
    const mlRetrainingJob = require('../jobs/mlRetraining');
    
    // Start retraining in background
    mlRetrainingJob.runRetrainingCycle().catch(err => {
      logger.error('Background retraining failed:', err);
    });
    
    res.json({
      success: true,
      message: 'Retraining cycle started in background'
    });
  } catch (error) {
    logger.error('Trigger retraining failed:', error);
    next(error);
  }
});

module.exports = router;
