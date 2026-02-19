const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Deadline = require('../models/Deadline');
const logger = require('../utils/logger');

// Get monthly timeline - uses timelineService
router.get('/monthly', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Use timeline service to generate personalized actions
    const { generateTimelineActions, getMonthlyActions } = require('../../services/timelineService');
    
    // Generate timeline actions if needed
    await generateTimelineActions(userId);
    
    // Get the monthly timeline
    const timeline = await getMonthlyActions(userId);

    res.json({
      success: true,
      data: timeline
    });
  } catch (error) {
    logger.error('Get timeline failed:', error);
    next(error);
  }
});

module.exports = router;