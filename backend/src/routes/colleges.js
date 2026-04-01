const express = require('express');
const router = express.Router();
const CollegeController = require('../controllers/collegeController');
const CollegeDeadlineController = require('../controllers/collegeDeadlineController');
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
router.get('/:id/majors', CollegeController.getCollegeMajors);
router.get('/:id/deadlines', CollegeDeadlineController.getCollegeDeadlines);

// Protected routes - require authentication
router.post('/', authenticate, CollegeController.createCollege); // Add college manually (Layer 1)
router.get('/:id/data', authenticate, CollegeController.getCollegeData);
router.get('/:id/eligibility', authenticate, CollegeController.checkEligibility);

// Cost-of-Attendance breakdown (real components, source-backed, never fabricated)
router.get('/:id/cost-breakdown', async (req, res, next) => {
  try {
    const { computeCostOfAttendance } = require('../services/financialComputationEngine');
    const College = require('../models/College');

    const college = await College.findById(req.params.id);
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const breakdown = await computeCostOfAttendance({
      collegeId: college.id,
      collegeCountry: college.country,
      isInternational: req.query.international !== 'false',
      displayCurrency: req.query.currency === 'INR' ? 'INR' : 'USD',
    });

    res.json({ success: true, data: breakdown });
  } catch (err) {
    next(err);
  }
});

// College request routes - for users to request colleges not in database
router.post('/requests', CollegeController.requestCollege);
router.get('/requests/popular', CollegeController.getPopularRequests);
router.post('/requests/:id/upvote', CollegeController.upvoteRequest);

// Data contribution routes
router.post('/contributions', authenticate, CollegeController.contributeData);
router.get('/contributions/:collegeId', CollegeController.getContributions);

module.exports = router;