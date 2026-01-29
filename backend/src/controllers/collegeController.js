const CollegeService = require('../services/collegeService');
const logger = require('../utils/logger');

class CollegeController {
  // Get all colleges
  static async getColleges(req, res, next) {
    try {
      const { country, search, limit } = req.query;
      
      // Default to returning all colleges (no limit) unless specified
      // This supports the goal of showing 500-1000 colleges
      const colleges = await CollegeService.getColleges({
        country,
        search,
        limit: limit ? parseInt(limit) : undefined // No default limit - return all
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
  
  // Search colleges - comprehensive search across all fields
  static async searchColleges(req, res, next) {
    try {
      const { q, country, program, limit } = req.query;
      
      if (!q || q.trim() === '') {
        // If no search term, return all colleges (for browsing)
        return CollegeController.getColleges(req, res, next);
      }
      
      const colleges = await CollegeService.searchColleges(q.trim(), {
        country,
        program,
        limit: limit ? parseInt(limit) : 1000 // Higher default for research
      });
      
      res.json({
        success: true,
        count: colleges.length,
        data: colleges
      });
    } catch (error) {
      logger.error('Search colleges error:', error);
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
  
  // Get all unique countries
  static async getCountries(req, res, next) {
    try {
      const countries = await CollegeService.getCountries();
      res.json({
        success: true,
        data: countries
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get all unique programs
  static async getPrograms(req, res, next) {
    try {
      const programs = await CollegeService.getPrograms();
      res.json({
        success: true,
        data: programs
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Create a new college (Layer 1: Core Static Spine)
  // Allows users to add colleges manually when they're not in the database
  static async createCollege(req, res, next) {
    try {
      const {
        name,
        country,
        location,
        officialWebsite,
        admissionsUrl,
        programsUrl,
        applicationPortalUrl,
        academicStrengths,
        majorCategories
      } = req.body;
      
      if (!name || !country || !officialWebsite) {
        return res.status(400).json({
          success: false,
          message: 'Name, country, and official website are required'
        });
      }
      
      const college = await CollegeService.createCollege({
        name,
        country,
        location,
        officialWebsite,
        admissionsUrl,
        programsUrl,
        applicationPortalUrl,
        academicStrengths: academicStrengths || [],
        majorCategories: majorCategories || [],
        trustTier: 'user_added', // Mark as user-added, not verified
        isVerified: 0
      });
      
      res.json({
        success: true,
        message: 'College added successfully. Layer 2 data (requirements, deadlines) will be available after scraping.',
        data: college
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Check eligibility for a college
  static async checkEligibility(req, res, next) {
    try {
      const { id } = req.params;
      const { program } = req.query;
      
      // Get the college
      const college = await CollegeService.getCollegeById(parseInt(id));
      if (!college) {
        return res.status(404).json({
          success: false,
          message: 'College not found'
        });
      }
      
      // Get user's academic profile
      const User = require('../models/User');
      const userProfile = await User.getAcademicProfile(req.user.userId);
      
      if (!userProfile) {
        return res.status(400).json({
          success: false,
          message: 'Please complete your academic profile first'
        });
      }
      
      // Check eligibility using the eligibility checker service
      const { checkEligibility } = require('../../services/eligibilityChecker');
      const eligibility = checkEligibility(userProfile, college, program);
      
      res.json({
        success: true,
        data: eligibility
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get database statistics
  static async getDatabaseStats(req, res, next) {
    try {
      const stats = await CollegeService.getDatabaseStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Request a college that's not in the database
  static async requestCollege(req, res, next) {
    try {
      const { name, website, city, state, country, reason, email } = req.body;
      
      if (!name || !country) {
        return res.status(400).json({
          success: false,
          message: 'College name and country are required'
        });
      }
      
      const request = await CollegeService.requestCollege({
        name,
        website,
        city,
        state,
        country,
        reason,
        email,
        userId: req.user?.userId
      });
      
      res.json({
        success: true,
        message: request.isNew 
          ? 'College request submitted successfully! We\'ll review and add it soon.'
          : 'Your vote has been added to an existing request for this college.',
        data: request
      });
    } catch (error) {
      logger.error('Request college error:', error);
      next(error);
    }
  }
  
  // Get popular college requests
  static async getPopularRequests(req, res, next) {
    try {
      const { limit = 20, status = 'pending' } = req.query;
      
      const requests = await CollegeService.getPopularRequests({
        limit: parseInt(limit),
        status
      });
      
      res.json({
        success: true,
        count: requests.length,
        data: requests
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Upvote a college request
  static async upvoteRequest(req, res, next) {
    try {
      const { id } = req.params;
      
      const request = await CollegeService.upvoteRequest(parseInt(id));
      
      res.json({
        success: true,
        message: 'Request upvoted successfully',
        data: request
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Contribute data for a college
  static async contributeData(req, res, next) {
    try {
      const { collegeId, requestedCollegeId, dataType, dataValue, sourceUrl } = req.body;
      
      if (!dataType || !dataValue) {
        return res.status(400).json({
          success: false,
          message: 'Data type and value are required'
        });
      }
      
      if (!collegeId && !requestedCollegeId) {
        return res.status(400).json({
          success: false,
          message: 'Either collegeId or requestedCollegeId is required'
        });
      }
      
      const contribution = await CollegeService.contributeData({
        collegeId,
        requestedCollegeId,
        dataType,
        dataValue: typeof dataValue === 'string' ? dataValue : JSON.stringify(dataValue),
        sourceUrl,
        userId: req.user?.userId,
        email: req.user?.email
      });
      
      res.json({
        success: true,
        message: 'Thank you for your contribution! It will be reviewed and added soon.',
        data: contribution
      });
    } catch (error) {
      logger.error('Contribute data error:', error);
      next(error);
    }
  }
  
  // Get contributions for a college
  static async getContributions(req, res, next) {
    try {
      const { collegeId } = req.params;
      const { status = 'approved' } = req.query;
      
      const contributions = await CollegeService.getContributions({
        collegeId: parseInt(collegeId),
        status
      });
      
      res.json({
        success: true,
        count: contributions.length,
        data: contributions
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CollegeController;
