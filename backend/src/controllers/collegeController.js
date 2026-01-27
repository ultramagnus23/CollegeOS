const CollegeService = require('../services/collegeService');
const logger = require('../utils/logger');

class CollegeController {
  // Get all colleges
  static async getColleges(req, res, next) {
    try {
      const { country, countries, search, limit } = req.query;
      
      // Parse countries array if provided as comma-separated string
      let countriesArray = null;
      if (countries) {
        countriesArray = typeof countries === 'string' ? countries.split(',') : countries;
      }
      
      // Default to returning all colleges (no limit) unless specified
      // This supports the goal of showing 500-1000 colleges
      const colleges = await CollegeService.getColleges({
        country,
        countries: countriesArray,
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
}

module.exports = CollegeController;
