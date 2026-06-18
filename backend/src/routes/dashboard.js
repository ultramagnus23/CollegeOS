const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const DashboardService = require('../services/dashboardService');

// GET /api/dashboard — the command center: one aggregated "what should I do next?"
// payload (profile completeness, applications + reach/target/safety, deadlines,
// essays, documents, tasks, nextAction).
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    const data = await DashboardService.getDashboard(userId);
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('GET /api/dashboard failed:', { error: error.message });
    return next(error);
  }
});

module.exports = router;
