const express = require('express');
const router = express.Router();
const DeadlineController = require('../controllers/deadlineController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const validators = require('../utils/validators');

// All routes require authentication
router.use(authenticate);

router.get('/', DeadlineController.getDeadlines);
router.post('/', validate(validators.createDeadline), DeadlineController.createDeadline);
router.put('/:id', DeadlineController.updateDeadline);
router.delete('/:id', DeadlineController.deleteDeadline);

module.exports = router;