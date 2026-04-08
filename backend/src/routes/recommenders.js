/**
 * Recommenders Routes
 * API endpoints for managing recommendation letters
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Recommender = require('../models/Recommender');

// Require authentication for all routes
router.use(authenticate);

// ==========================================
// RECOMMENDER ENDPOINTS
// ==========================================

/**
 * GET /api/recommenders
 * Get all recommenders for the current user
 */
router.get('/', async (req, res, next) => {
  try {
    const recommenders = await Recommender.getByUserId(req.user.userId);
    
    res.json({
      success: true,
      data: recommenders,
      count: recommenders.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/recommenders/summary
 * Get recommendation status summary
 */
router.get('/summary', async (req, res, next) => {
  try {
    const summary = await Recommender.getSummary(req.user.userId);
    const overdue = await Recommender.getOverdueRequests(req.user.userId);
    const pendingReminders = await Recommender.getPendingReminders(req.user.userId);
    
    res.json({
      success: true,
      data: {
        ...summary,
        overdueRequests: overdue,
        pendingReminders: pendingReminders
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/recommenders/types
 * Get available recommender types
 */
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    data: Recommender.TYPES
  });
});

/**
 * GET /api/recommenders/:id
 * Get recommender by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const recommender = await Recommender.getById(req.params.id, req.user.userId);
    
    if (!recommender) {
      return res.status(404).json({
        success: false,
        message: 'Recommender not found'
      });
    }
    
    res.json({
      success: true,
      data: recommender
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/recommenders
 * Create a new recommender
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, email, type } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Name and type are required'
      });
    }
    
    const validTypes = Object.values(Recommender.TYPES);
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Valid options: ${validTypes.join(', ')}`
      });
    }
    
    const recommender = await Recommender.create(req.user.userId, req.body);
    
    res.status(201).json({
      success: true,
      data: recommender,
      message: 'Recommender created successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/recommenders/:id
 * Update a recommender
 */
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await Recommender.getById(req.params.id, req.user.userId);
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Recommender not found'
      });
    }
    
    const recommender = await Recommender.update(req.params.id, req.user.userId, req.body);
    
    res.json({
      success: true,
      data: recommender,
      message: 'Recommender updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/recommenders/:id
 * Delete a recommender
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Recommender.delete(req.params.id, req.user.userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Recommender not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Recommender deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// RECOMMENDATION REQUEST ENDPOINTS
// ==========================================

/**
 * GET /api/recommenders/requests/all
 * Get all recommendation requests
 */
router.get('/requests/all', async (req, res, next) => {
  try {
    const { status, recommenderId, collegeId } = req.query;
    
    const requests = await Recommender.getRequests(req.user.userId, {
      status,
      recommenderId,
      collegeId
    });
    
    res.json({
      success: true,
      data: requests,
      count: requests.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/recommenders/requests/overdue
 * Get overdue recommendation requests
 */
router.get('/requests/overdue', async (req, res, next) => {
  try {
    const overdue = await Recommender.getOverdueRequests(req.user.userId);
    
    res.json({
      success: true,
      data: overdue,
      count: overdue.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/recommenders/requests/pending-reminders
 * Get requests needing follow-up
 */
router.get('/requests/pending-reminders', async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const pending = await Recommender.getPendingReminders(req.user.userId, parseInt(days));
    
    res.json({
      success: true,
      data: pending,
      count: pending.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/recommenders/requests/:id
 * Get recommendation request by ID
 */
router.get('/requests/:id', async (req, res, next) => {
  try {
    const request = await Recommender.getRequestById(req.params.id, req.user.userId);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    
    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/recommenders/:id/request
 * Create a recommendation request for a recommender
 */
router.post('/:id/request', async (req, res, next) => {
  try {
    const recommender = await Recommender.getById(req.params.id, req.user.userId);
    
    if (!recommender) {
      return res.status(404).json({
        success: false,
        message: 'Recommender not found'
      });
    }
    
    const request = await Recommender.createRequest(req.user.userId, {
      recommenderId: req.params.id,
      ...req.body
    });
    
    res.status(201).json({
      success: true,
      data: request,
      message: 'Recommendation request created successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/recommenders/requests/:id
 * Update a recommendation request
 */
router.put('/requests/:id', async (req, res, next) => {
  try {
    const existing = await Recommender.getRequestById(req.params.id, req.user.userId);
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    
    const request = await Recommender.updateRequest(req.params.id, req.user.userId, req.body);
    
    res.json({
      success: true,
      data: request,
      message: 'Request updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/recommenders/requests/:id
 * Delete a recommendation request
 */
router.delete('/requests/:id', async (req, res, next) => {
  try {
    const deleted = await Recommender.deleteRequest(req.params.id, req.user.userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Request deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/recommenders/email-template
 * Generate email template
 */
router.post('/email-template', async (req, res, next) => {
  try {
    const { type, data } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({
        success: false,
        message: 'Type and data are required'
      });
    }
    
    const validTypes = ['request', 'reminder', 'thank_you'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Valid options: ${validTypes.join(', ')}`
      });
    }
    
    const template = Recommender.generateEmailTemplate(type, {
      ...data,
      studentName: req.user.full_name || 'Student'
    });
    
    res.json({
      success: true,
      data: { template }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
