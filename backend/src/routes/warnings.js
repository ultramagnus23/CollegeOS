/**
 * Warning Routes
 * API endpoints for deadline warnings and task risk assessment
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const WarningSystemService = require('../services/warningSystemService');
const DeadlineDependencyService = require('../services/deadlineDependencyService');
const logger = require('../utils/logger');

/**
 * GET /api/warnings
 * Get all warnings for the current user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const warnings = await WarningSystemService.getWarnings(userId);
    
    res.json({
      success: true,
      data: warnings
    });
  } catch (error) {
    logger.error('Get warnings error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/warnings/summary
 * Get dashboard summary of warnings
 */
router.get('/summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const summary = await WarningSystemService.getDashboardSummary(userId);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Get warnings summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/warnings/task-load
 * Get task load analysis for upcoming days
 */
router.get('/task-load', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const days = parseInt(req.query.days) || 7;
    
    const taskLoad = await WarningSystemService.calculateTaskLoad(userId, Math.min(days, 30));
    
    res.json({
      success: true,
      data: taskLoad
    });
  } catch (error) {
    logger.error('Get task load error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/warnings/dependencies/:collegeId
 * Get dependency graph for a college's tasks
 */
router.get('/dependencies/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const collegeId = parseInt(req.params.collegeId);
    
    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }
    
    const graph = await DeadlineDependencyService.buildDependencyGraph(userId, collegeId);
    
    res.json({
      success: true,
      data: graph
    });
  } catch (error) {
    logger.error('Get dependencies error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/warnings/dependencies
 * Create a task dependency
 */
router.post('/dependencies', authenticate, async (req, res) => {
  try {
    const { taskId, dependsOnTaskId, dependencyType } = req.body;
    
    if (!taskId || !dependsOnTaskId) {
      return res.status(400).json({
        success: false,
        message: 'taskId and dependsOnTaskId are required'
      });
    }
    
    const dependency = await DeadlineDependencyService.createDependency(
      parseInt(taskId),
      parseInt(dependsOnTaskId),
      dependencyType || 'blocks'
    );
    
    res.status(201).json({
      success: true,
      message: 'Dependency created',
      data: dependency
    });
  } catch (error) {
    logger.error('Create dependency error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/warnings/auto-dependencies/:collegeId
 * Auto-create dependencies based on task templates
 */
router.post('/auto-dependencies/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const collegeId = parseInt(req.params.collegeId);
    
    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }
    
    const result = await DeadlineDependencyService.autoCreateDependencies(userId, collegeId);
    
    res.json({
      success: true,
      message: `Created ${result.created} dependencies`,
      data: result
    });
  } catch (error) {
    logger.error('Auto-create dependencies error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/warnings/recommended-order/:collegeId
 * Get recommended task order based on dependencies
 */
router.get('/recommended-order/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const collegeId = parseInt(req.params.collegeId);
    
    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }
    
    const order = await DeadlineDependencyService.getRecommendedOrder(userId, collegeId);
    
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    logger.error('Get recommended order error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/warnings/impact/:taskId
 * Get impact of completing a specific task
 */
router.get('/impact/:taskId', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID'
      });
    }
    
    const impact = await DeadlineDependencyService.getCompletionImpact(taskId);
    
    res.json({
      success: true,
      data: impact
    });
  } catch (error) {
    logger.error('Get impact error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
