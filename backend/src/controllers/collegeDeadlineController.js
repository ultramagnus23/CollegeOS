const CollegeDeadline = require('../models/CollegeDeadline');
const College = require('../models/College');
const logger = require('../utils/logger');

class CollegeDeadlineController {
  /**
   * Get application deadlines for a specific college
   * GET /api/colleges/:id/deadlines
   */
  static async getCollegeDeadlines(req, res, next) {
    try {
      const { id } = req.params;
      const { year } = req.query;
      
      // Verify college exists
      const college = College.findById(parseInt(id));
      if (!college) {
        return res.status(404).json({
          success: false,
          message: 'College not found',
          errorCode: 'COLLEGE_NOT_FOUND'
        });
      }
      
      const deadlines = CollegeDeadline.findByCollege(
        parseInt(id), 
        year ? parseInt(year) : undefined
      );
      
      if (!deadlines) {
        return res.status(404).json({
          success: false,
          message: 'Deadlines not found for this college',
          errorCode: 'DEADLINES_NOT_FOUND',
          hint: 'This college may not have deadline data yet. Try adding it manually or wait for our scraper to update.'
        });
      }
      
      // Get offered deadline types (only show deadlines the college actually offers)
      const offeredTypes = CollegeDeadline.getOfferedDeadlineTypes(parseInt(id));
      
      res.json({
        success: true,
        data: {
          ...deadlines,
          college_name: college.name,
          offered_deadline_types: offeredTypes,
          last_verified: deadlines.last_updated,
          verification_status: deadlines.verification_status,
          confidence_score: deadlines.confidence_score
        }
      });
    } catch (error) {
      logger.error('Error fetching college deadlines:', error);
      next(error);
    }
  }

  /**
   * Create or update deadlines for a college
   * POST /api/colleges/:id/deadlines
   * (Admin only - would need auth middleware)
   */
  static async createOrUpdateDeadlines(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;
      
      // Verify college exists
      const college = College.findById(parseInt(id));
      if (!college) {
        return res.status(404).json({
          success: false,
          message: 'College not found',
          errorCode: 'COLLEGE_NOT_FOUND'
        });
      }
      
      // Add college_id to data
      data.collegeId = parseInt(id);
      
      const deadlines = CollegeDeadline.createOrUpdate(data);
      
      res.json({
        success: true,
        message: 'Deadlines updated successfully',
        data: deadlines
      });
    } catch (error) {
      logger.error('Error updating college deadlines:', error);
      next(error);
    }
  }

  /**
   * Get all colleges with deadlines
   * GET /api/college-deadlines
   */
  static async getAllCollegeDeadlines(req, res, next) {
    try {
      const { year } = req.query;
      
      const deadlines = CollegeDeadline.findAll(
        year ? parseInt(year) : undefined
      );
      
      res.json({
        success: true,
        count: deadlines.length,
        data: deadlines
      });
    } catch (error) {
      logger.error('Error fetching all college deadlines:', error);
      next(error);
    }
  }
}

module.exports = CollegeDeadlineController;
