const express = require('express');
const router = express.Router();
const CollegeController = require('../controllers/collegeController');
const { authenticate } = require('../middleware/auth');

// Diagnostic route - no auth required
router.get('/debug/stats', (req, res) => {
  try {
    const dbManager = require('../config/database');
    const db = dbManager.getDatabase();
    
    // Get total count
    const total = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
    
    // Get count by country
    const byCountry = db.prepare(`
      SELECT country, COUNT(*) as count 
      FROM colleges 
      GROUP BY country 
      ORDER BY count DESC
    `).all();
    
    // Get sample colleges (first 5)
    const sample = db.prepare('SELECT id, name, country, acceptance_rate FROM colleges LIMIT 5').all();
    
    res.json({
      success: true,
      database: {
        path: require('../config/env').database.path,
        totalColleges: total.count,
        byCountry: byCountry
      },
      sample: sample
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Public routes - no authentication required for browsing
router.get('/', CollegeController.getColleges);
router.get('/search', CollegeController.searchColleges);
router.get('/filters/countries', CollegeController.getCountries);
router.get('/filters/programs', CollegeController.getPrograms);
router.get('/:id', CollegeController.getCollegeById);

// Protected routes - require authentication
router.post('/', authenticate, CollegeController.createCollege); // Add college manually (Layer 1)
router.get('/:id/data', authenticate, CollegeController.getCollegeData);
router.get('/:id/eligibility', authenticate, CollegeController.checkEligibility);

module.exports = router;