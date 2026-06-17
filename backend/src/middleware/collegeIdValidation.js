const College = require('../models/College');

/**
 * Validate that a college ID exists before the request reaches the controller.
 * Handles both UUID strings and INTEGER numeric IDs.
 * 
 * Usage: router.get('/:id', validateCollegeId, controller)
 * 
 * Sets req.college if found, or sends 404 if not found.
 */
const validateCollegeId = async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const college = await College.findById(rawId);
    
    if (!college) {
      return res.status(404).json({
        success: false,
        message: 'College not found',
        errorCode: 'COLLEGE_NOT_FOUND'
      });
    }
    
    req.college = college;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Validate that a college ID is provided and is either a valid UUID or positive integer.
 * Does NOT query the database — only validates the format.
 * 
 * Usage: router.post('/chance/:collegeId', validateCollegeIdFormat, controller)
 */
const validateCollegeIdFormat = (req, res, next) => {
  const rawId = req.params.id || req.body.collegeId || req.body.college_id;
  
  if (!rawId) {
    return res.status(400).json({
      success: false,
      message: 'College ID is required',
      errorCode: 'COLLEGE_ID_REQUIRED'
    });
  }
  
  const strId = String(rawId).trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const numericRegex = /^[1-9]\d*$/;
  
  if (!uuidRegex.test(strId) && !numericRegex.test(strId)) {
    return res.status(400).json({
      success: false,
      message: 'College ID must be a valid UUID or positive integer',
      errorCode: 'INVALID_COLLEGE_ID_FORMAT'
    });
  }
  
  next();
};

module.exports = { validateCollegeId, validateCollegeIdFormat };
