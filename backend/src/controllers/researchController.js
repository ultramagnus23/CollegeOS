const ResearchService = require('../services/researchService');
const logger = require('../utils/logger');

class ResearchController {
  // Conduct on-demand research
  static async conductResearch(req, res, next) {
    try {
      const { collegeId, researchType, forceRefresh } = req.body;
      
      if (!collegeId || !researchType) {
        return res.status(400).json({
          success: false,
          message: 'collegeId and researchType are required'
        });
      }
      
      const result = await ResearchService.conductResearch(
        parseInt(collegeId),
        researchType,
        { forceRefresh: forceRefresh === true }
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Research endpoint error:', error);
      next(error);
    }
  }
}

module.exports = ResearchController;