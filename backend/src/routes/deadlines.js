const express = require('express');
const router = express.Router();
const DeadlineController = require('../controllers/deadlineController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const validators = require('../utils/validators');
const deadlineFetchService = require('../../services/deadlineFetchService');

// All routes require authentication
router.use(authenticate);

// Get deadline templates for a specific college (before adding to application)
router.get('/college/:collegeId', async (req, res, next) => {
  try {
    const { collegeId } = req.params;
    const deadlineInfo = await deadlineFetchService.getDeadlinesForCollege(parseInt(collegeId));
    
    res.json({
      success: true,
      data: deadlineInfo
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', DeadlineController.getDeadlines);
router.post('/', validate(validators.createDeadline), DeadlineController.createDeadline);
router.put('/:id', DeadlineController.updateDeadline);
router.delete('/:id', DeadlineController.deleteDeadline);

module.exports = router;