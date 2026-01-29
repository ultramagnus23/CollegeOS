const express = require('express');
const router = express.Router();
const CollegeController = require('../controllers/collegeController');
const { authenticate } = require('../middleware/auth');

// Public routes - no authentication required for browsing

// Browse all colleges with pagination (Issue 8)
router.get('/all', CollegeController.browseAll);

// Browse by major (Issue 7)
router.get('/by-major/:major', CollegeController.browseByMajor);

// Get all majors with counts (Issue 7)
router.get('/majors', CollegeController.getMajors);

router.get('/', CollegeController.getColleges);
router.get('/search', CollegeController.searchColleges);
router.get('/filters/countries', CollegeController.getCountries);
router.get('/filters/programs', CollegeController.getPrograms);
router.get('/stats', CollegeController.getDatabaseStats);
router.get('/:id', CollegeController.getCollegeById);

// Protected routes - require authentication
router.post('/', authenticate, CollegeController.createCollege); // Add college manually (Layer 1)
router.get('/:id/data', authenticate, CollegeController.getCollegeData);
router.get('/:id/eligibility', authenticate, CollegeController.checkEligibility);

// College request routes - for users to request colleges not in database
router.post('/requests', CollegeController.requestCollege);
router.get('/requests/popular', CollegeController.getPopularRequests);
router.post('/requests/:id/upvote', CollegeController.upvoteRequest);

// Data contribution routes
router.post('/contributions', authenticate, CollegeController.contributeData);
router.get('/contributions/:collegeId', CollegeController.getContributions);

module.exports = router;