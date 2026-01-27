const express = require('express');
const router = express.Router();
const EssayController = require('../controllers/essayController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const validators = require('../utils/validators');
const essayPromptsService = require('../../services/essayPromptsService');

// All routes require authentication
router.use(authenticate);

// Get essay prompts for a specific college
router.get('/prompts/:collegeId', async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    const promptsInfo = await essayPromptsService.getPromptsForCollege(parseInt(collegeId));
    
    res.json({
      success: true,
      data: promptsInfo
    });
  } catch (error) {
    next(error);
  }
});

// Get Common App prompts (general)
router.get('/prompts/common-app', async (req, res, next) => {
  try {
    const prompts = essayPromptsService.getCommonAppPrompts();
    
    res.json({
      success: true,
      data: prompts
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', EssayController.getEssays);
router.post('/', validate(validators.createEssay), EssayController.createEssay);
router.put('/:id', validate(validators.updateEssay), EssayController.updateEssay);
router.delete('/:id', EssayController.deleteEssay);

module.exports = router;