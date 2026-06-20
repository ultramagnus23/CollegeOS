const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Get monthly timeline - groups application deadlines and tasks by month
router.get('/monthly', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();

    let tasks = [];
    let deadlines = [];

    // Pull tasks from BOTH task tables: `application_tasks` (generic per-application
    // checklist items, populated on first GET of an application's task list) and
    // `tasks` (the richer auto-generated set from ApplicationBootstrapService —
    // also what Dashboard.tsx "Today's Tasks" and Timeline.tsx's completion toggle
    // read/write). They are two real, independently-populated sources; union both
    // rather than silently dropping one (the disconnect itself is tracked as
    // follow-up consolidation work, not papered over here).
    try {
      const result = await pool.query(
        `SELECT at.id, at.title, at.task_type AS type, at.due_date,
                CASE WHEN at.completed THEN 'completed' ELSE 'pending' END AS status,
                c.name AS college_name
         FROM application_tasks at
         JOIN applications a ON at.application_id = a.id
         LEFT JOIN colleges_full c ON c.id = a.college_id
         WHERE a.user_id = $1
         UNION ALL
         SELECT t.id, t.title, t.task_type AS type, t.deadline AS due_date,
                t.status,
                c2.name AS college_name
         FROM tasks t
         LEFT JOIN colleges_full c2 ON c2.id = t.college_id
         WHERE t.user_id = $1
         ORDER BY due_date ASC NULLS LAST`,
        [userId]
      );
      tasks = result.rows;
    } catch (err) {
      logger.error('Failed to fetch tasks for timeline:', err);
      tasks = [];
    }

    // Pull user-facing deadlines (the `deadlines` table is keyed on user_id and
    // college_id; application_deadlines is the empty college-level source table).
    try {
      const result = await pool.query(
        `SELECT d.id, c.name AS college_name, d.deadline_type, d.deadline_date,
                CASE WHEN d.is_completed THEN 1 ELSE 0 END AS is_completed
         FROM deadlines d
         LEFT JOIN colleges_full c ON c.id = d.college_id
         WHERE d.user_id = $1
         ORDER BY d.deadline_date ASC NULLS LAST`,
        [userId]
      );
      deadlines = result.rows;
    } catch (err) {
      logger.error('Failed to fetch deadlines for timeline:', err);
      deadlines = [];
    }

    // Group tasks and deadlines into monthly buckets
    const monthMap = new Map();

    const getOrCreateMonth = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!monthMap.has(label)) {
        monthMap.set(label, { month: label, tasks: [], deadlines: [], _sortKey: sortKey });
      }
      return monthMap.get(label);
    };

    tasks.forEach(task => {
      const bucket = getOrCreateMonth(task.due_date);
      if (bucket) bucket.tasks.push(task);
    });

    deadlines.forEach(deadline => {
      const bucket = getOrCreateMonth(deadline.deadline_date);
      if (bucket) bucket.deadlines.push(deadline);
    });

    const timeline = [...monthMap.values()]
      .sort((a, b) => a._sortKey - b._sortKey)
      .map(({ _sortKey, ...rest }) => rest); // strip internal sort key

    res.json({ success: true, data: timeline });
  } catch (error) {
    logger.error('Get timeline failed:', error);
    next(error);
  }
});

module.exports = router;
