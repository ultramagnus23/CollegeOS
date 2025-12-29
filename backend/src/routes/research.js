const express = require('express');
const router = express.Router();
const ResearchController = require('../controllers/researchController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

router.post('/on-demand', ResearchController.conductResearch);

module.exports = router;