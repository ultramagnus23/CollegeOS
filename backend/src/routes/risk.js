/**
 * Risk Routes
 * API endpoints for deadline risk assessment
 */

const express = require('express');
const router = express.Router();
const DeadlineRiskService = require('../services/deadlineRiskService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/risk/overview
 * Get overall risk overview for the user
 */
router.get('/overview', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get critical deadlines
    const criticalDeadlines = await DeadlineRiskService.getCriticalDeadlines(userId, 14);
    
    // Get impossible colleges
    const impossibleColleges = await DeadlineRiskService.flagImpossibleColleges(userId);
    
    // Get unread alerts
    const alerts = await DeadlineRiskService.getUnreadAlerts(userId);
    
    // Calculate overall risk
    const safeCount = criticalDeadlines.filter(d => d.risk.level === 'safe').length;
    const tightCount = criticalDeadlines.filter(d => d.risk.level === 'tight').length;
    const criticalCount = criticalDeadlines.filter(d => d.risk.level === 'critical').length;
    const impossibleCount = impossibleColleges.length;
    
    res.json({
      success: true,
      data: {
        summary: {
          totalDeadlines: criticalDeadlines.length,
          safe: safeCount,
          tight: tightCount,
          critical: criticalCount,
          impossible: impossibleCount
        },
        criticalDeadlines: criticalDeadlines.slice(0, 5),
        impossibleColleges,
        unreadAlerts: alerts.length,
        alerts: alerts.slice(0, 10)
      }
    });
  } catch (error) {
    logger.error('Risk overview error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/risk/college/:collegeId
 * Get risk assessment for a specific college
 */
router.get('/college/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    
    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }
    
    // Get nearest deadline
    const deadline = await DeadlineRiskService.getNearestDeadline(userId, collegeId);
    
    if (!deadline) {
      return res.json({
        success: true,
        data: {
          hasDeadline: false,
          message: 'No active deadlines found for this college'
        }
      });
    }
    
    // Get tasks for this college
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    const tasks = db.prepare(`
      SELECT * FROM tasks
      WHERE user_id = ? AND college_id = ? AND status NOT IN ('complete', 'skipped')
    `).all(userId, collegeId);
    
    const risk = DeadlineRiskService.calculateTimeRisk(deadline.deadline_date, tasks);
    
    res.json({
      success: true,
      data: {
        hasDeadline: true,
        deadline: {
          date: deadline.deadline_date,
          type: deadline.deadline_type,
          title: deadline.title
        },
        risk,
        tasksRemaining: tasks.length,
        totalHoursNeeded: risk.hoursNeeded
      }
    });
  } catch (error) {
    logger.error('College risk error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/risk/deadlines
 * Get all deadlines with risk assessment
 */
router.get('/deadlines', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;
    
    const deadlines = await DeadlineRiskService.getCriticalDeadlines(userId, parseInt(days));
    
    res.json({
      success: true,
      data: deadlines,
      count: deadlines.length
    });
  } catch (error) {
    logger.error('Get deadlines with risk error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/risk/impossible
 * Get all colleges with impossible deadlines
 */
router.get('/impossible', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const impossibleColleges = await DeadlineRiskService.flagImpossibleColleges(userId);
    
    res.json({
      success: true,
      data: impossibleColleges,
      count: impossibleColleges.length
    });
  } catch (error) {
    logger.error('Get impossible colleges error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/risk/alerts
 * Get unread alerts
 */
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const alerts = await DeadlineRiskService.getUnreadAlerts(userId);
    
    res.json({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/risk/alerts/:alertId/read
 * Mark an alert as read
 */
router.patch('/alerts/:alertId/read', authenticate, async (req, res) => {
  try {
    const alertId = parseInt(req.params.alertId);
    
    if (isNaN(alertId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid alert ID'
      });
    }
    
    await DeadlineRiskService.markAlertRead(alertId);
    
    res.json({
      success: true,
      message: 'Alert marked as read'
    });
  } catch (error) {
    logger.error('Mark alert read error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/risk/deadlines
 * Create a new user deadline
 */
router.post('/deadlines', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { collegeId, applicationId, title, deadlineType, deadlineDate, notes } = req.body;
    
    if (!title || !deadlineDate) {
      return res.status(400).json({
        success: false,
        message: 'Title and deadlineDate are required'
      });
    }
    
    const deadline = await DeadlineRiskService.createDeadline(userId, {
      collegeId,
      applicationId,
      title,
      deadlineType,
      deadlineDate,
      notes
    });
    
    res.status(201).json({
      success: true,
      message: 'Deadline created',
      data: deadline
    });
  } catch (error) {
    logger.error('Create deadline error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/risk/sync/:collegeId
 * Sync deadlines from college data
 */
router.post('/sync/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    const { applicationId } = req.body;
    
    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }
    
    await DeadlineRiskService.syncCollegeDeadlines(userId, collegeId, applicationId);
    
    // Get the synced deadlines
    const deadlines = await DeadlineRiskService.getDeadlines(userId, { collegeId });
    
    res.json({
      success: true,
      message: 'Deadlines synced',
      data: deadlines
    });
  } catch (error) {
    logger.error('Sync deadlines error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/risk/check
 * Run daily risk check (typically called by a cron job)
 */
router.post('/check', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    await DeadlineRiskService.runDailyCheck(userId);
    
    const alerts = await DeadlineRiskService.getUnreadAlerts(userId);
    
    res.json({
      success: true,
      message: 'Risk check completed',
      newAlerts: alerts.length
    });
  } catch (error) {
    logger.error('Risk check error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/risk/calculate
 * Calculate risk for specific deadline and tasks
 */
router.post('/calculate', async (req, res) => {
  try {
    const { deadline, tasks } = req.body;
    
    if (!deadline) {
      return res.status(400).json({
        success: false,
        message: 'Deadline is required'
      });
    }
    
    const risk = DeadlineRiskService.calculateTimeRisk(deadline, tasks || []);
    
    res.json({
      success: true,
      data: risk
    });
  } catch (error) {
    logger.error('Calculate risk error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
