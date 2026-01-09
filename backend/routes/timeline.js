// backend/routes/timeline.js
const express = require('express');
const router = express.Router();
const { generateTimelineActions, getMonthlyActions } = require('../services/timelineService');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/timeline/generate - Regenerate timeline based on applications
router.post('/generate', async (req, res) => {
  try {
    const result = await generateTimelineActions(req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/timeline/monthly?month=10&year=2024
router.get('/monthly', async (req, res) => {
  try {
    const { month, year } = req.query;
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();
    
    const actions = await getMonthlyActions(req.user.id, parseInt(currentMonth), parseInt(currentYear));
    res.json({ success: true, data: actions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/timeline/:id/complete
router.patch('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;
    
    await new Promise((resolve, reject) => {
      const db = require('../config/database');
      db.run(`
        UPDATE timeline_actions 
        SET completed = ?, completed_date = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE id = ? AND user_id = ?
      `, [completed ? 1 : 0, completed ? 1 : 0, id, req.user.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;