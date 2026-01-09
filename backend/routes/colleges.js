// backend/routes/colleges.js
// API routes for college operations
// Colleges are READ-ONLY - users can only search and view, never create/update/delete

const express = require('express');
const router = express.Router();
const College = require('../models/College');
const { checkEligibility } = require('../services/eligibilityChecker');

// Middleware to verify JWT token (you already have this in your app)
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/colleges
 * Search and filter colleges
 * Query params:
 *   - country: Filter by country (US, UK, Canada, etc.)
 *   - program: Filter by program name
 *   - search: Full-text search term
 *   - page: Page number for pagination (default 1)
 *   - limit: Results per page (default 20)
 */
router.get('/', async (req, res) => {
  try {
    const { country, program, search, page = 1, limit = 20 } = req.query;
    
    // Calculate offset for pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filters object
    const filters = {
      country,
      program,
      searchTerm: search,
      limit: parseInt(limit),
      offset
    };
    
    // Fetch colleges from database
    const colleges = await College.findAll(filters);
    
    // Return results
    res.json({
      success: true,
      data: colleges,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: colleges.length === parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching colleges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch colleges',
      error: error.message
    });
  }
});

/**
 * GET /api/colleges/:id
 * Get detailed information about a specific college
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const college = await College.findById(id);
    
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    res.json({
      success: true,
      data: college
    });
    
  } catch (error) {
    console.error('Error fetching college:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch college details',
      error: error.message
    });
  }
});

/**
 * GET /api/colleges/:id/eligibility
 * Check user's eligibility for a specific college
 * Requires authentication
 */
router.get('/:id/eligibility', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { program } = req.query; // Optional: check eligibility for specific program
    
    // Get the college
    const college = await College.findById(id);
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found'
      });
    }
    
    // Get user's academic profile from the request
    // In a real app, you'd fetch this from the database using req.user.id
    // For now, we'll expect it to be passed or use mock data
    const userProfile = req.body.profile || {
      academic_board: 'CBSE',
      subjects: ['Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'English'],
      percentage: 85,
      exams: {
        'SAT': { status: 'planned' },
        'IELTS': { status: 'completed', score: 7.5 }
      },
      medium_of_instruction: 'English'
    };
    
    // Check eligibility
    const eligibility = checkEligibility(userProfile, college, program);
    
    res.json({
      success: true,
      data: eligibility
    });
    
  } catch (error) {
    console.error('Error checking eligibility:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check eligibility',
      error: error.message
    });
  }
});

/**
 * GET /api/colleges/filters/countries
 * Get list of all available countries
 * Used for filter dropdowns in the UI
 */
router.get('/filters/countries', async (req, res) => {
  try {
    const countries = await College.getCountries();
    
    res.json({
      success: true,
      data: countries
    });
    
  } catch (error) {
    console.error('Error fetching countries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch countries',
      error: error.message
    });
  }
});

/**
 * GET /api/colleges/filters/programs
 * Get list of all available programs
 * Used for filter dropdowns in the UI
 */
router.get('/filters/programs', async (req, res) => {
  try {
    const programs = await College.getPrograms();
    
    res.json({
      success: true,
      data: programs
    });
    
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch programs',
      error: error.message
    });
  }
});

/**
 * POST /api/colleges (BLOCKED)
 * This endpoint is explicitly blocked to prevent users from creating colleges
 * Colleges can only be added by administrators through seed scripts
 */
router.post('/', (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Cannot create colleges through the API. Colleges are pre-seeded and can only be selected.',
    hint: 'Use the college search to find and select colleges.'
  });
});

/**
 * PUT /api/colleges/:id (BLOCKED)
 * Updating colleges is not allowed through the API
 */
router.put('/:id', (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Cannot update colleges through the API. Please contact support if college information needs to be corrected.'
  });
});

/**
 * DELETE /api/colleges/:id (BLOCKED)
 * Deleting colleges is not allowed through the API
 */
router.delete('/:id', (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Cannot delete colleges through the API.'
  });
});

module.exports = router;