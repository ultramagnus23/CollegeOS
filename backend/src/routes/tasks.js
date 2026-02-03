/**
 * Tasks Routes
 * API endpoints for task decomposition and management
 */

const express = require('express');
const router = express.Router();
const RequirementService = require('../services/requirementService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/tasks
 * Get all tasks for the current user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { collegeId, status, type } = req.query;
    
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    let query = 'SELECT t.*, c.name as college_name FROM tasks t LEFT JOIN colleges c ON c.id = t.college_id WHERE t.user_id = ?';
    const params = [userId];
    
    if (collegeId) {
      query += ' AND t.college_id = ?';
      params.push(parseInt(collegeId));
    }
    
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    
    if (type) {
      query += ' AND t.task_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY t.priority ASC, t.deadline ASC';
    
    const tasks = db.prepare(query).all(...params);
    
    res.json({
      success: true,
      data: tasks,
      count: tasks.length
    });
  } catch (error) {
    logger.error('Get tasks error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tasks/college/:collegeId
 * Get tasks for a specific college
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
    
    const tasks = await RequirementService.getTasks(userId, collegeId);
    const completion = await RequirementService.getTaskCompletion(userId, collegeId);
    
    res.json({
      success: true,
      data: {
        tasks,
        completion,
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === 'complete').length,
        blockedTasks: tasks.filter(t => t.status === 'blocked').length
      }
    });
  } catch (error) {
    logger.error('Get college tasks error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/tasks/decompose/:collegeId
 * Generate task breakdown for a college application
 */
router.post('/decompose/:collegeId', authenticate, async (req, res) => {
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
    
    // Check if tasks already exist
    const existingTasks = await RequirementService.getTasks(userId, collegeId);
    
    if (existingTasks.length > 0) {
      return res.json({
        success: true,
        message: 'Tasks already exist for this college',
        data: existingTasks,
        isExisting: true
      });
    }
    
    // Create new tasks
    const tasks = await RequirementService.createApplicationTasks(userId, collegeId, applicationId);
    
    res.json({
      success: true,
      message: 'Tasks created successfully',
      data: tasks,
      count: tasks.length
    });
  } catch (error) {
    logger.error('Decompose tasks error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tasks/template/:collegeId
 * Get task template for a college (without creating)
 */
router.get('/template/:collegeId', async (req, res) => {
  try {
    const collegeId = parseInt(req.params.collegeId);
    
    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }
    
    const template = await RequirementService.decomposeApplication(collegeId);
    
    res.json({
      success: true,
      data: template,
      count: template.length
    });
  } catch (error) {
    logger.error('Get task template error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tasks/dependencies/:collegeId
 * Get dependency graph for college tasks
 */
router.get('/dependencies/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    
    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }
    
    const graph = await RequirementService.buildDependencyGraph(userId, collegeId);
    
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
 * GET /api/tasks/blocked
 * Get all blocked tasks for the user
 */
router.get('/blocked', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { collegeId } = req.query;
    
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    let query = `
      SELECT t.*, c.name as college_name 
      FROM tasks t 
      LEFT JOIN colleges c ON c.id = t.college_id 
      WHERE t.user_id = ? AND t.status = 'blocked'
    `;
    const params = [userId];
    
    if (collegeId) {
      query += ' AND t.college_id = ?';
      params.push(parseInt(collegeId));
    }
    
    query += ' ORDER BY t.deadline ASC';
    
    const blockedTasks = db.prepare(query).all(...params);
    
    res.json({
      success: true,
      data: blockedTasks,
      count: blockedTasks.length
    });
  } catch (error) {
    logger.error('Get blocked tasks error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tasks/critical-path/:collegeId
 * Get critical path for a college
 */
router.get('/critical-path/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    
    if (isNaN(collegeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID'
      });
    }
    
    const criticalPath = await RequirementService.getCriticalPath(userId, collegeId);
    
    res.json({
      success: true,
      data: criticalPath,
      count: criticalPath.length,
      hasCriticalTasks: criticalPath.some(t => t.isCritical)
    });
  } catch (error) {
    logger.error('Get critical path error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PATCH /api/tasks/:taskId/status
 * Update task status
 */
router.patch('/:taskId/status', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { status, reason } = req.body;
    
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID'
      });
    }
    
    const validStatuses = ['not_started', 'in_progress', 'blocked', 'complete', 'skipped'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    // Verify ownership
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    
    if (!task || task.user_id !== req.user.id) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    const updatedTask = await RequirementService.updateTaskStatus(taskId, status, reason);
    
    res.json({
      success: true,
      message: 'Task status updated',
      data: updatedTask
    });
  } catch (error) {
    logger.error('Update task status error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/tasks/:taskId
 * Update task details
 */
router.put('/:taskId', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { title, description, deadline, estimatedHours, priority, notes } = req.body;
    
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID'
      });
    }
    
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    // Verify ownership
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    
    if (!task || task.user_id !== req.user.id) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    db.prepare(`
      UPDATE tasks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        deadline = COALESCE(?, deadline),
        estimated_hours = COALESCE(?, estimated_hours),
        priority = COALESCE(?, priority),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, description, deadline, estimatedHours, priority, notes, taskId);
    
    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    
    res.json({
      success: true,
      message: 'Task updated',
      data: updatedTask
    });
  } catch (error) {
    logger.error('Update task error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/tasks
 * Create a new custom task
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { collegeId, applicationId, taskType, title, description, deadline, estimatedHours, priority } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }
    
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    const result = db.prepare(`
      INSERT INTO tasks (
        user_id, college_id, application_id, task_type, title, description,
        deadline, estimated_hours, priority, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started')
    `).run(
      userId,
      collegeId || null,
      applicationId || null,
      taskType || 'other',
      title,
      description || null,
      deadline || null,
      estimatedHours || 1,
      priority || 3
    );
    
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    
    res.status(201).json({
      success: true,
      message: 'Task created',
      data: task
    });
  } catch (error) {
    logger.error('Create task error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/tasks/:taskId
 * Delete a task
 */
router.delete('/:taskId', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    
    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid task ID'
      });
    }
    
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    // Verify ownership
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    
    if (!task || task.user_id !== req.user.id) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    
    res.json({
      success: true,
      message: 'Task deleted'
    });
  } catch (error) {
    logger.error('Delete task error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/tasks/reusable
 * Get reusable content across colleges
 */
router.get('/reusable', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const reusable = await RequirementService.getReusableContent(userId);
    
    res.json({
      success: true,
      data: reusable
    });
  } catch (error) {
    logger.error('Get reusable content error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
