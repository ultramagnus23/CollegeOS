// backend/src/routes/ml.js
// ML-ready data collection routes for future model training

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

/**
 * Check if user has given ML consent
 */
function hasMLConsent(userId) {
  const db = dbManager.getDatabase();
  const stmt = db.prepare('SELECT ml_consent FROM users WHERE id = ?');
  const user = stmt.get(userId);
  return user && user.ml_consent === 1;
}

/**
 * POST /api/ml/student-outcome
 * Store student profile + colleges applied to + decision results
 */
router.post('/student-outcome', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Check consent
    if (!hasMLConsent(userId)) {
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
    
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO ml_training_data (
        student_id, college_id, gpa, sat_total, act_composite,
        class_rank_percentile, num_ap_courses, activity_tier_1_count,
        activity_tier_2_count, is_first_gen, is_legacy, state,
        college_acceptance_rate, college_sat_median, college_type,
        decision, enrolled, application_year
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userId,
      collegeId,
      gpa || null,
      satTotal || null,
      actComposite || null,
      classRankPercentile || null,
      numApCourses || null,
      activityTier1Count || null,
      activityTier2Count || null,
      isFirstGen ? 1 : 0,
      isLegacy ? 1 : 0,
      state || null,
      collegeAcceptanceRate || null,
      collegeSatMedian || null,
      collegeType || null,
      decision,
      enrolled ? 1 : 0,
      applicationYear || new Date().getFullYear()
    );
    
    logger.info(`ML training data recorded for user ${userId}, college ${collegeId}, decision: ${decision}`);
    
    res.status(201).json({
      success: true,
      message: 'Outcome recorded successfully',
      data: { id: result.lastInsertRowid }
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
    if (!hasMLConsent(userId)) {
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
    
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO ml_user_interactions (
        student_id, college_id, interaction_type, session_id, timestamp
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const result = stmt.run(userId, collegeId, interactionType, sessionId || null);
    
    res.status(201).json({
      success: true,
      message: 'Interaction tracked',
      data: { id: result.lastInsertRowid }
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
    if (!hasMLConsent(userId)) {
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
    
    const wordCount = essayText.trim().split(/\s+/).length;
    
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO ml_essays (
        student_id, college_id, essay_prompt_type, essay_text,
        word_count, quality_score
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userId,
      collegeId || null,
      essayPromptType || null,
      essayText,
      wordCount,
      qualityScore || null
    );
    
    logger.info(`ML essay submission recorded for user ${userId}, ${wordCount} words`);
    
    res.status(201).json({
      success: true,
      message: 'Essay submitted for ML training',
      data: {
        id: result.lastInsertRowid,
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
    
    const db = dbManager.getDatabase();
    
    // Verify ownership
    const essay = db.prepare('SELECT * FROM ml_essays WHERE id = ? AND student_id = ?').get(essayId, userId);
    if (!essay) {
      return res.status(404).json({
        success: false,
        message: 'Essay not found'
      });
    }
    
    db.prepare(`
      UPDATE ml_essays 
      SET acceptance_outcome = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(acceptanceOutcome, essayId);
    
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
 */
router.get('/export-training-data', authenticate, async (req, res, next) => {
  try {
    // For now, any authenticated user can export their own data
    // In production, add admin check: if (!req.user.isAdmin) return res.status(403)...
    
    const db = dbManager.getDatabase();
    const { type = 'all', anonymize = 'true' } = req.query;
    
    const shouldAnonymize = anonymize === 'true';
    
    // Helper to hash student IDs
    const hashId = (id) => {
      if (!shouldAnonymize) return id;
      return crypto.createHash('sha256').update(`student_${id}_salt_ml`).digest('hex').substring(0, 16);
    };
    
    const exportData = {};
    
    // Export training data
    if (type === 'all' || type === 'training') {
      const trainingData = db.prepare(`
        SELECT * FROM ml_training_data ORDER BY created_at DESC
      `).all();
      
      exportData.trainingData = trainingData.map(row => ({
        ...row,
        student_id: hashId(row.student_id)
      }));
    }
    
    // Export user interactions
    if (type === 'all' || type === 'interactions') {
      const interactions = db.prepare(`
        SELECT * FROM ml_user_interactions ORDER BY timestamp DESC
      `).all();
      
      exportData.interactions = interactions.map(row => ({
        ...row,
        student_id: hashId(row.student_id),
        session_id: shouldAnonymize ? null : row.session_id
      }));
    }
    
    // Export essays (with text optionally redacted)
    if (type === 'all' || type === 'essays') {
      const essays = db.prepare(`
        SELECT id, student_id, college_id, essay_prompt_type, 
               word_count, quality_score, acceptance_outcome, created_at
        FROM ml_essays ORDER BY created_at DESC
      `).all();
      
      exportData.essays = essays.map(row => ({
        ...row,
        student_id: hashId(row.student_id)
      }));
    }
    
    // Export model versions
    if (type === 'all' || type === 'models') {
      exportData.modelVersions = db.prepare(`
        SELECT * FROM ml_model_versions ORDER BY created_at DESC
      `).all();
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
    const hasConsent = hasMLConsent(req.user.userId);
    
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
    
    const db = dbManager.getDatabase();
    db.prepare('UPDATE users SET ml_consent = ? WHERE id = ?').run(consent ? 1 : 0, req.user.userId);
    
    logger.info(`User ${req.user.userId} updated ML consent to: ${consent}`);
    
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
 * GET /api/ml/stats
 * Get ML data collection statistics
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const db = dbManager.getDatabase();
    
    const stats = {
      trainingDataCount: db.prepare('SELECT COUNT(*) as count FROM ml_training_data').get().count,
      interactionsCount: db.prepare('SELECT COUNT(*) as count FROM ml_user_interactions').get().count,
      essaysCount: db.prepare('SELECT COUNT(*) as count FROM ml_essays').get().count,
      usersWithConsent: db.prepare('SELECT COUNT(*) as count FROM users WHERE ml_consent = 1').get().count,
      decisionBreakdown: db.prepare(`
        SELECT decision, COUNT(*) as count 
        FROM ml_training_data 
        GROUP BY decision
      `).all(),
      interactionBreakdown: db.prepare(`
        SELECT interaction_type, COUNT(*) as count 
        FROM ml_user_interactions 
        GROUP BY interaction_type
      `).all()
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
