const Deadline = require('../models/Deadline');

class DeadlineController {
  // Get all deadlines for user
  static async getDeadlines(req, res, next) {
    try {
      const userId = req.user.userId;
      const { daysAhead } = req.query;
      
      const deadlines = Deadline.findUpcoming(userId, daysAhead ? parseInt(daysAhead) : 30);
      
      res.json({
        success: true,
        count: deadlines.length,
        data: deadlines
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Create deadline
  static async createDeadline(req, res, next) {
    try {
      const data = req.validatedData;
      
      const deadline = Deadline.create(data);
      
      res.status(201).json({
        success: true,
        message: 'Deadline created successfully',
        data: deadline
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Update deadline
  static async updateDeadline(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;
      
      const deadline = Deadline.update(parseInt(id), data);
      
      res.json({
        success: true,
        message: 'Deadline updated successfully',
        data: deadline
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Delete deadline
  static async deleteDeadline(req, res, next) {
    try {
      const { id } = req.params;
      
      Deadline.delete(parseInt(id));
      
      res.json({
        success: true,
        message: 'Deadline deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DeadlineController;