const express = require('express');
const router = express.Router();
const ApplicationController = require('../controllers/applicationController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const validators = require('../utils/validators');

// All routes require authentication
router.use(authenticate);

router.get('/', ApplicationController.getApplications);
router.post('/', validate(validators.createApplication), ApplicationController.createApplication);
router.put('/:id', validate(validators.updateApplication), ApplicationController.updateApplication);
router.delete('/:id', ApplicationController.deleteApplication);
router.get('/:id/timeline', ApplicationController.getTimeline);

module.exports = router;