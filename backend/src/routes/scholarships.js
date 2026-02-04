/**
 * Scholarships Routes
 * API endpoints for scholarship database
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Scholarship = require('../models/Scholarship');

/**
 * GET /api/scholarships
 * Search scholarships with filters
 */
router.get('/', async (req, res, next) => {
  try {
    const { 
      country, 
      needBased, 
      meritBased, 
      minAmount, 
      deadlineAfter,
      search,
      limit 
    } = req.query;
    
    const scholarships = Scholarship.search({
      country,
      needBased: needBased === 'true',
      meritBased: meritBased === 'true',
      minAmount: minAmount ? parseInt(minAmount) : undefined,
      deadlineAfter,
      search,
      limit: limit ? parseInt(limit) : 50
    });
    
    res.json({
      success: true,
      data: scholarships,
      count: scholarships.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scholarships/countries
 * Get all countries with scholarships
 */
router.get('/countries', async (req, res, next) => {
  try {
    const countries = Scholarship.getCountries();
    
    res.json({
      success: true,
      data: countries
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scholarships/:id
 * Get scholarship by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const scholarship = Scholarship.getById(req.params.id);
    
    if (!scholarship) {
      return res.status(404).json({
        success: false,
        message: 'Scholarship not found'
      });
    }
    
    res.json({
      success: true,
      data: scholarship
    });
  } catch (error) {
    next(error);
  }
});

// Protected routes require authentication
router.use(authenticate);

/**
 * GET /api/scholarships/user/tracked
 * Get user's tracked scholarships
 */
router.get('/user/tracked', async (req, res, next) => {
  try {
    const { status } = req.query;
    const scholarships = Scholarship.getUserScholarships(req.user.id, status);
    
    res.json({
      success: true,
      data: scholarships,
      count: scholarships.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scholarships/user/eligible
 * Get eligible scholarships based on user profile
 */
router.get('/user/eligible', async (req, res, next) => {
  try {
    // Build user profile from query or stored data
    const userProfile = {
      targetCountries: req.query.countries ? req.query.countries.split(',') : [],
      nationality: req.query.nationality,
      academicLevel: req.query.academicLevel
    };
    
    const scholarships = Scholarship.getEligibleScholarships(userProfile);
    
    res.json({
      success: true,
      data: scholarships,
      count: scholarships.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/scholarships/:id/track
 * Track a scholarship
 */
router.post('/:id/track', async (req, res, next) => {
  try {
    const { status = 'interested', notes = '' } = req.body;
    
    const validStatuses = ['interested', 'applying', 'applied', 'received', 'rejected', 'withdrawn'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid options: ${validStatuses.join(', ')}`
      });
    }
    
    const tracked = Scholarship.trackForUser(req.user.id, req.params.id, status, notes);
    
    res.json({
      success: true,
      data: tracked,
      message: 'Scholarship tracked successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/scholarships/:id/track
 * Update scholarship tracking
 */
router.put('/:id/track', async (req, res, next) => {
  try {
    const updated = Scholarship.updateUserScholarship(
      req.user.id, 
      req.params.id, 
      req.body
    );
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Scholarship tracking not found'
      });
    }
    
    res.json({
      success: true,
      data: updated,
      message: 'Scholarship tracking updated'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
