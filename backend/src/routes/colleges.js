const express = require('express');
const router = express.Router();
const CollegeController = require('../controllers/collegeController');
const { authenticate } = require('../middleware/auth');

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