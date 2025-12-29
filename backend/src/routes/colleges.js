const express = require('express');
const router = express.Router();
const CollegeController = require('../controllers/collegeController');
const { authenticate } = require('../middleware/auth');

// All college routes require authentication
router.use(authenticate);

router.get('/', CollegeController.getColleges);
router.get('/search', CollegeController.searchColleges);
router.get('/:id', CollegeController.getCollegeById);
router.get('/:id/data', CollegeController.getCollegeData);

module.exports = router;