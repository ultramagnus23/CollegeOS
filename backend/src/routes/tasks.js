const express = require('express');
const router = express.Router();
const RequirementService = require('../services/requirementService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const dbManager = require('../config/database');

// Helper: run a parameterized pg query converting ?→$n and spread array params
async function pgQuery(query, params = []) {
  const pool = dbManager.getDatabase();
  // Convert SQLite ? placeholders to $1, $2...
  let idx = 1;
  const pgQuery = query.replace(/\?/g, () => `$${idx++}`);
  return pool.query(pgQuery, params);
}

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { collegeId, status, type } = req.query;
    const pool = dbManager.getDatabase();
    let query = 'SELECT t.*, c.name as college_name FROM tasks t LEFT JOIN colleges c ON c.id=t.college_id WHERE t.user_id=$1';
    const params = [userId];
    let idx = 2;
    if (collegeId) { query += ` AND t.college_id=$${idx++}`; params.push(parseInt(collegeId)); }
    if (status) { query += ` AND t.status=$${idx++}`; params.push(status); }
    if (type) { query += ` AND t.task_type=$${idx++}`; params.push(type); }
    query += ' ORDER BY t.priority ASC, t.deadline ASC';
    const { rows: tasks } = await pool.query(query, params);
    res.json({ success:true, data:tasks, count:tasks.length });
  } catch (error) {
    logger.error('Get tasks error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.get('/college/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    if (isNaN(collegeId)) return res.status(400).json({ success:false, message:'Invalid college ID' });
    const tasks = await RequirementService.getTasks(userId, collegeId);
    const completion = await RequirementService.getTaskCompletion(userId, collegeId);
    res.json({ success:true, data:{ tasks, completion, totalTasks:tasks.length, completedTasks:tasks.filter(t=>t.status==='complete').length, blockedTasks:tasks.filter(t=>t.status==='blocked').length } });
  } catch (error) {
    logger.error('Get college tasks error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.post('/decompose/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    const { applicationId } = req.body;
    if (isNaN(collegeId)) return res.status(400).json({ success:false, message:'Invalid college ID' });
    const existingTasks = await RequirementService.getTasks(userId, collegeId);
    if (existingTasks.length > 0) return res.json({ success:true, message:'Tasks already exist', data:existingTasks, isExisting:true });
    const tasks = await RequirementService.createApplicationTasks(userId, collegeId, applicationId);
    res.json({ success:true, message:'Tasks created successfully', data:tasks, count:tasks.length });
  } catch (error) {
    logger.error('Decompose tasks error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.get('/template/:collegeId', async (req, res) => {
  try {
    const collegeId = parseInt(req.params.collegeId);
    if (isNaN(collegeId)) return res.status(400).json({ success:false, message:'Invalid college ID' });
    const template = await RequirementService.decomposeApplication(collegeId);
    res.json({ success:true, data:template, count:template.length });
  } catch (error) {
    logger.error('Get task template error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.get('/dependencies/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    if (isNaN(collegeId)) return res.status(400).json({ success:false, message:'Invalid college ID' });
    const graph = await RequirementService.buildDependencyGraph(userId, collegeId);
    res.json({ success:true, data:graph });
  } catch (error) {
    logger.error('Get dependencies error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.get('/blocked', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { collegeId } = req.query;
    const pool = dbManager.getDatabase();
    let query = `SELECT t.*, c.name as college_name FROM tasks t LEFT JOIN colleges c ON c.id=t.college_id WHERE t.user_id=$1 AND t.status='blocked'`;
    const params = [userId];
    let idx = 2;
    if (collegeId) { query += ` AND t.college_id=$${idx++}`; params.push(parseInt(collegeId)); }
    query += ' ORDER BY t.deadline ASC';
    const { rows } = await pool.query(query, params);
    res.json({ success:true, data:rows, count:rows.length });
  } catch (error) {
    logger.error('Get blocked tasks error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.get('/critical-path/:collegeId', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const collegeId = parseInt(req.params.collegeId);
    if (isNaN(collegeId)) return res.status(400).json({ success:false, message:'Invalid college ID' });
    const criticalPath = await RequirementService.getCriticalPath(userId, collegeId);
    res.json({ success:true, data:criticalPath, count:criticalPath.length, hasCriticalTasks:criticalPath.some(t=>t.isCritical) });
  } catch (error) {
    logger.error('Get critical path error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.patch('/:taskId/status', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { status, reason } = req.body;
    if (isNaN(taskId)) return res.status(400).json({ success:false, message:'Invalid task ID' });
    const validStatuses = ['not_started','in_progress','blocked','complete','skipped'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success:false, message:`Status must be one of: ${validStatuses.join(', ')}` });
    const pool = dbManager.getDatabase();
    const userId = req.user.userId || req.user.id;
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [taskId]);
    if (!rows[0] || rows[0].user_id !== userId) return res.status(404).json({ success:false, message:'Task not found' });
    const updatedTask = await RequirementService.updateTaskStatus(taskId, status, reason);
    res.json({ success:true, message:'Task status updated', data:updatedTask });
  } catch (error) {
    logger.error('Update task status error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.put('/:taskId', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { title, description, deadline, estimatedHours, priority, notes } = req.body;
    if (isNaN(taskId)) return res.status(400).json({ success:false, message:'Invalid task ID' });
    const pool = dbManager.getDatabase();
    const userId = req.user.userId || req.user.id;
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [taskId]);
    if (!rows[0] || rows[0].user_id !== userId) return res.status(404).json({ success:false, message:'Task not found' });
    await pool.query(
      `UPDATE tasks SET title=COALESCE($1,title),description=COALESCE($2,description),deadline=COALESCE($3,deadline),estimated_hours=COALESCE($4,estimated_hours),priority=COALESCE($5,priority),notes=COALESCE($6,notes),updated_at=NOW() WHERE id=$7`,
      [title||null, description||null, deadline||null, estimatedHours||null, priority||null, notes||null, taskId]
    );
    const { rows: updated } = await pool.query('SELECT * FROM tasks WHERE id=$1', [taskId]);
    res.json({ success:true, message:'Task updated', data:updated[0] });
  } catch (error) {
    logger.error('Update task error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { collegeId, applicationId, taskType, title, description, deadline, estimatedHours, priority } = req.body;
    if (!title) return res.status(400).json({ success:false, message:'Title is required' });
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `INSERT INTO tasks (user_id,college_id,application_id,task_type,title,description,deadline,estimated_hours,priority,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'not_started') RETURNING id`,
      [userId, collegeId||null, applicationId||null, taskType||'other', title, description||null, deadline||null, estimatedHours||1, priority||3]
    );
    const { rows: task } = await pool.query('SELECT * FROM tasks WHERE id=$1', [rows[0].id]);
    res.status(201).json({ success:true, message:'Task created', data:task[0] });
  } catch (error) {
    logger.error('Create task error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.delete('/:taskId', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (isNaN(taskId)) return res.status(400).json({ success:false, message:'Invalid task ID' });
    const pool = dbManager.getDatabase();
    const userId = req.user.userId || req.user.id;
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [taskId]);
    if (!rows[0] || rows[0].user_id !== userId) return res.status(404).json({ success:false, message:'Task not found' });
    await pool.query('DELETE FROM tasks WHERE id=$1', [taskId]);
    res.json({ success:true, message:'Task deleted' });
  } catch (error) {
    logger.error('Delete task error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

router.get('/reusable', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const reusable = await RequirementService.getReusableContent(userId);
    res.json({ success:true, data:reusable });
  } catch (error) {
    logger.error('Get reusable content error:', error);
    res.status(500).json({ success:false, message:'An internal error occurred' });
  }
});

module.exports = router;
