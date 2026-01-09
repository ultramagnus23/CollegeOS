    const Essay = require('../models/Essay');

    class EssayController {
      // Get all essays for user
      static async getEssays(req, res, next) {
        try {
          const userId = req.user.userId;
          
          const essays = Essay.findByUser(userId);
          
          res.json({
            success: true,
            count: essays.length,
            data: essays
          });
        } catch (error) {
          next(error);
        }
      }
      
      // Create essay
      static async createEssay(req, res, next) {
        try {
          const data = req.validatedData;
          
          const essay = Essay.create(data);
          
          res.status(201).json({
            success: true,
            message: 'Essay created successfully',
            data: essay
          });
        } catch (error) {
          next(error);
        }
      }
      
      // Update essay
      static async updateEssay(req, res, next) {
        try {
          const { id } = req.params;
          const data = req.validatedData;
          
          const essay = Essay.update(parseInt(id), data);
          
          res.json({
            success: true,
            message: 'Essay updated successfully',
            data: essay
          });
        } catch (error) {
          next(error);
        }
      }
      
      // Delete essay
      static async deleteEssay(req, res, next) {
        try {
          const { id } = req.params;
          
          Essay.delete(parseInt(id));
          
          res.json({
            success: true,
            message: 'Essay deleted successfully'
          });
        } catch (error) {
          next(error);
        }
      }
    }

    module.exports = EssayController;