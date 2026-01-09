const express = require('express');
const router = express.Router();
const EssayController = require('../controllers/essayController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const validators = require('../utils/validators');

// All routes require authentication
router.use(authenticate);

router.get('/', EssayController.getEssays);
router.post('/', validate(validators.createEssay), EssayController.createEssay);
router.put('/:id', validate(validators.updateEssay), EssayController.updateEssay);
router.delete('/:id', EssayController.deleteEssay);

module.exports = router;