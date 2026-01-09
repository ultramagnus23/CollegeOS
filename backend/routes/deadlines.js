// backend/routes/deadlines.js
// API routes for deadline management
// Deadlines are SYSTEM-GENERATED ONLY - users cannot create them manually
// Users can only mark them as complete or view them

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Auth middleware
const authMiddleware = require('../middleware/auth');

// Apply auth to all routes
router.use(authMiddleware);

/**
 * GET /api/deadlines
 * Get all deadlines for the logged-in user
 * Query params:
 *   - status: 'upcoming' | 'completed' | 'all' (default: 'upcoming')
 *   - college_id: Filter by specific college (optional)
 *   - limit: Number of results (default: 50)
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { status = 'upcoming', college_id, limit = 50 } = req.query;
    
    // Build the query based on filters
    let query = `
      SELECT 
        d.*,
        c.name as college_name,
        c.country,
        c.logo_url,
        a.status as application_status
      FROM deadlines d
      JOIN colleges c ON d.college_id = c.id
      JOIN applications a ON d.application_id = a.id
      WHERE d.user_id = ?
    `;
    const params = [userId];
    
    // Filter by status
    if (status === 'upcoming') {
      query += ' AND d.completed = 0 AND d.deadline_date >= date("now")';
    } else if (status === 'completed') {
      query += ' AND d.completed = 1';
    }
    // 'all' means no filter
    
    // Filter by college if specified
    if (college_id) {
      query += ' AND d.college_id = ?';
      params.push(college_id);
    }
    
    // Order by deadline date (soonest first) and priority
    query += ` 
      ORDER BY 
        d.deadline_date ASC,
        CASE d.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
      LIMIT ?
    `;
    params.push(parseInt(limit));
    
    const deadlines = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Calculate days until deadline for each
    const now = new Date();
    const enrichedDeadlines = deadlines.map(deadline => {
      const deadlineDate = new Date(deadline.deadline_date);
      const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      
      return {
        ...deadline,
        days_until: daysUntil,
        is_overdue: daysUntil < 0 && !deadline.completed
      };
    });
    
    res.json({
      success: true,
      data: enrichedDeadlines,
      count: enrichedDeadlines.length
    });
    
  } catch (error) {
    console.error('Error fetching deadlines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deadlines',
      error: error.message
    });
  }
});

/**
 * GET /api/deadlines/dashboard
 * Get deadline statistics for the dashboard
 * Returns counts and upcoming deadlines
 */
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get counts
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          COUNT(CASE WHEN completed = 0 AND deadline_date >= date('now') THEN 1 END) as upcoming,
          COUNT(CASE WHEN completed = 0 AND deadline_date < date('now') THEN 1 END) as overdue,
          COUNT(CASE WHEN completed = 1 THEN 1 END) as completed,
          COUNT(CASE WHEN completed = 0 AND deadline_date >= date('now') AND deadline_date <= date('now', '+7 days') THEN 1 END) as this_week,
          COUNT(CASE WHEN completed = 0 AND deadline_date >= date('now') AND deadline_date <= date('now', '+30 days') THEN 1 END) as this_month
        FROM deadlines
        WHERE user_id = ?
      `, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    // Get next 5 upcoming deadlines
    const upcoming = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          d.*,
          c.name as college_name,
          c.logo_url
        FROM deadlines d
        JOIN colleges c ON d.college_id = c.id
        WHERE d.user_id = ? AND d.completed = 0 AND d.deadline_date >= date('now')
        ORDER BY d.deadline_date ASC
        LIMIT 5
      `, [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Enrich with days_until
    const now = new Date();
    const enrichedUpcoming = upcoming.map(deadline => {
      const deadlineDate = new Date(deadline.deadline_date);
      const daysUntil = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      return { ...deadline, days_until: daysUntil };
    });
    
    res.json({
      success: true,
      data: {
        stats,
        upcoming: enrichedUpcoming
      }
    });
    
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
});

/**
 * PATCH /api/deadlines/:id
 * Update a deadline (mark as complete/incomplete)
 * Body: { completed: true/false }
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { completed } = req.body;
    
    if (typeof completed !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'completed field must be a boolean'
      });
    }
    
    // Verify ownership
    const deadline = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id FROM deadlines WHERE id = ? AND user_id = ?
      `, [id, userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!deadline) {
      return res.status(404).json({
        success: false,
        message: 'Deadline not found or unauthorized'
      });
    }
    
    // Update the deadline
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE deadlines
        SET 
          completed = ?,
          completed_date = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [completed ? 1 : 0, completed ? 1 : 0, id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json({
      success: true,
      message: `Deadline marked as ${completed ? 'complete' : 'incomplete'}`
    });
    
  } catch (error) {
    console.error('Error updating deadline:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update deadline',
      error: error.message
    });
  }
});

/**
 * POST /api/deadlines (BLOCKED)
 * Users cannot manually create deadlines
 * Deadlines are automatically generated when adding colleges
 */
router.post('/', (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Cannot manually create deadlines. Deadlines are automatically generated when you add a college to your applications.',
    hint: 'Go to the Colleges page and select a college to apply to. All relevant deadlines will be automatically created.'
  });
});

/**
 * DELETE /api/deadlines/:id (BLOCKED)
 * Users cannot delete individual deadlines
 * They can only be deleted by removing the entire application
 */
router.delete('/:id', (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Cannot delete individual deadlines. To remove deadlines, delete the entire application for that college.',
    hint: 'Go to the Applications page to remove an application and all its deadlines.'
  });
});

module.exports = router;