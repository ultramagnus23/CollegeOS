/**
 * Scholarships Routes
 * API endpoints for scholarship database
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Scholarship = require('../models/Scholarship');
const User = require('../models/User');
const { getUSDtoINR } = require('../services/exchangeRateService');
const { matchScholarships, explainMatch } = require('../services/scholarshipMatchingService');
const logger = require('../utils/logger');

// Maximum allowed difference between the rate fetched from the API and the rate
// the matching engine reports it used.  ±0.5 allows for sub-cent rounding while
// catching any case where the engine uses a hardcoded or stale rate.
const EXCHANGE_RATE_TOLERANCE = 0.5;

/**
 * POST /api/scholarships/match
 * Run the full scholarship matching engine for the authenticated student.
 * Returns ranked results with net-cost calculations in INR at today's rate.
 */
router.post('/match', authenticate, async (req, res, next) => {
  try {
    const liveRate = await getUSDtoINR();

    const rawProfile = await User.getAcademicProfile(req.user.userId);
    if (!rawProfile) {
      return res.status(400).json({
        success: false,
        message: 'Complete your academic profile before running scholarship matching.',
        redirect: '/onboarding',
      });
    }

    const studentProfile = {
      ...rawProfile,
      today_date:      new Date().toISOString().split('T')[0],
      live_usd_to_inr: liveRate,
    };

    const scholarships = await Scholarship.findAllForMatching(500);
    const matchResult  = matchScholarships(studentProfile, scholarships);

    // Sanity check: engine must have used today's live rate (tolerance ±0.5)
    if (Math.abs(matchResult.exchange_rate_used - liveRate) > EXCHANGE_RATE_TOLERANCE) {
      logger.error('Scholarship matching used wrong exchange rate', {
        used: matchResult.exchange_rate_used, expected: liveRate
      });
      return res.status(500).json({ success: false, message: 'Internal error: exchange rate mismatch.' });
    }

    logger.info('Scholarship match completed', {
      userId: req.user.userId,
      totalMatched: matchResult.summary.total_matched,
      totalEligible: matchResult.summary.total_eligible,
    });

    res.json({ success: true, data: matchResult });
  } catch (err) {
    if (err.code === 'EXCHANGE_RATE_MISSING') {
      return res.status(503).json({ success: false, message: 'Exchange rate unavailable — try again shortly.' });
    }
    logger.error('Scholarship match failed', { error: err?.message, stack: err?.stack });
    next(err);
  }
});

/**
 * POST /api/scholarships/explain
 * Explain why a student matches (or doesn't match) a specific scholarship.
 * Body: { scholarshipId: number }
 */
router.post('/explain', authenticate, async (req, res, next) => {
  try {
    const { scholarshipId } = req.body;
    if (!scholarshipId) {
      return res.status(400).json({ success: false, message: 'scholarshipId is required.' });
    }

    const scholarship = await Scholarship.getById(scholarshipId);
    if (!scholarship) {
      return res.status(404).json({ success: false, message: 'Scholarship not found.' });
    }

    const liveRate = await getUSDtoINR();
    const rawProfile = await User.getAcademicProfile(req.user.userId);
    if (!rawProfile) {
      return res.status(400).json({
        success: false,
        message: 'Complete your academic profile first.',
        redirect: '/onboarding',
      });
    }

    const studentProfile = {
      ...rawProfile,
      today_date:      new Date().toISOString().split('T')[0],
      live_usd_to_inr: liveRate,
    };

    const result = explainMatch(scholarship, studentProfile);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'EXCHANGE_RATE_MISSING') {
      return res.status(503).json({ success: false, message: 'Exchange rate unavailable — try again shortly.' });
    }
    logger.error('Scholarship explain failed', { error: err?.message, stack: err?.stack });
    next(err);
  }
});

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
    
    const scholarships = await Scholarship.search({
      country,
      needBased: needBased === 'true',
      meritBased: meritBased === 'true',
      minAmount: minAmount ? parseInt(minAmount) : undefined,
      deadline: deadlineAfter,
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
    const countries = await Scholarship.getCountries();
    
    res.json({
      success: true,
      data: countries
    });
  } catch (error) {
    next(error);
  }
});

// Protected routes require authentication for user-specific endpoints
router.use('/user', authenticate);

/**
 * GET /api/scholarships/user/tracked
 * Get user's tracked scholarships
 */
router.get('/user/tracked', async (req, res, next) => {
  try {
    const { status } = req.query;
    const scholarships = await Scholarship.getUserScholarships(req.user.id, status);
    
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
    
    const scholarships = await Scholarship.getEligibleScholarships(userProfile);
    
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
 * GET /api/scholarships/:id
 * Get scholarship by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const scholarship = await Scholarship.getById(req.params.id);
    
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

// Apply authentication middleware for remaining routes
router.use(authenticate);

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
    
    const tracked = await Scholarship.trackForUser(req.user.id, req.params.id, status, notes);
    
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
    const updated = await Scholarship.updateUserScholarship(
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
