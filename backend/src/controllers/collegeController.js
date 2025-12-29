const CollegeService = require('../services/collegeService');

class CollegeController {
  // Get all colleges
  static async getColleges(req, res, next) {
    try {
      const { country, search, limit } = req.query;
      
      const colleges = await CollegeService.getColleges({
        country,
        search,
        limit: limit ? parseInt(limit) : undefined
      });
      
      res.json({
        success: true,
        count: colleges.length,
        data: colleges
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get college by ID
  static async getCollegeById(req, res, next) {
    try {
      const { id } = req.params;
      const college = await CollegeService.getCollegeById(parseInt(id));
      
      res.json({
        success: true,
        data: college
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Search colleges
  static async searchColleges(req, res, next) {
    try {
      const { q, country, limit } = req.query;
      
      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }
      
      const colleges = await CollegeService.searchColleges(q, {
        country,
        limit: limit ? parseInt(limit) : 50
      });
      
      res.json({
        success: true,
        count: colleges.length,
        data: colleges
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get college data (requirements, deadlines, etc.)
  static async getCollegeData(req, res, next) {
    try {
      const { id } = req.params;
      const { type } = req.query;
      
      if (!type) {
        return res.status(400).json({
          success: false,
          message: 'Data type is required (requirements, deadlines, programs)'
        });
      }
      
      const data = await CollegeService.getCollegeData(parseInt(id), type);
      
      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CollegeController;
