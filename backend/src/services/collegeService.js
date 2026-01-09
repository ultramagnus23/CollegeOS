const College = require('../models/College');
const logger = require('../utils/logger');

class CollegeService {
  // Get all colleges with filters
  static async getColleges(filters = {}) {
    try {
      const colleges = await College.findAll(filters);
      logger.debug(`Retrieved ${colleges.length} colleges`);
      return colleges;
    } catch (error) {
      logger.error('Failed to get colleges:', error);
      throw error;
    }
  }
  
  // Get college by ID
  static async getCollegeById(id) {
    try {
      const college = await College.findById(id);
      if (!college) {
        throw new Error('College not found');
      }
      return college;
    } catch (error) {
      logger.error(`Failed to get college ${id}:`, error);
      throw error;
    }
  }
  
  // Search colleges
  static async searchColleges(searchTerm, filters = {}) {
    try {
      const colleges = await College.search(searchTerm, filters);
      logger.debug(`Search "${searchTerm}" returned ${colleges.length} results`);
      return colleges;
    } catch (error) {
      logger.error('College search failed:', error);
      throw error;
    }
  }
  
  // Create new college (admin function)
  static async createCollege(data) {
    try {
      const college = await College.create(data);
      logger.info(`Created college: ${data.name}`);
      return college;
    } catch (error) {
      logger.error('Failed to create college:', error);
      throw error;
    }
  }
  
  // Get college data (Layer 2: requirements, deadlines, etc.)
  static async getCollegeData(collegeId, dataType) {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      
      const stmt = db.prepare(`
        SELECT * FROM college_data
        WHERE college_id = ? AND data_type = ? AND is_valid = 1
        ORDER BY scraped_at DESC
        LIMIT 1
      `);
      
      const data = stmt.get(collegeId, dataType);
      
      if (!data) {
        // No data available - return null with message
        return {
          available: false,
          message: 'Data not available. Please visit the official website.',
          college: College.findById(collegeId)
        };
      }
      
      // Check if data is expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return {
          available: false,
          message: 'Data is outdated. Please visit the official website.',
          college: College.findById(collegeId),
          lastUpdated: data.scraped_at
        };
      }
      
      return {
        available: true,
        data: JSON.parse(data.data_content),
        source: data.source_url,
        trustTier: data.trust_tier,
        scrapedAt: data.scraped_at
      };
    } catch (error) {
      logger.error('Failed to get college data:', error);
      throw error;
    }
  }
  
  // Get all unique countries
  static async getCountries() {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      const stmt = db.prepare('SELECT DISTINCT country FROM colleges ORDER BY country');
      const rows = stmt.all();
      return rows.map(row => row.country);
    } catch (error) {
      logger.error('Failed to get countries:', error);
      throw error;
    }
  }
  
  // Get all unique programs (major categories)
  static async getPrograms() {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      const stmt = db.prepare('SELECT major_categories FROM colleges WHERE major_categories IS NOT NULL');
      const rows = stmt.all();
      const programsSet = new Set();
      
      rows.forEach(row => {
        try {
          const categories = JSON.parse(row.major_categories || '[]');
          if (Array.isArray(categories)) {
            categories.forEach(cat => programsSet.add(cat));
          }
        } catch (e) {
          // Skip invalid JSON
        }
      });
      
      return Array.from(programsSet).sort();
    } catch (error) {
      logger.error('Failed to get programs:', error);
      throw error;
    }
  }
}

module.exports = CollegeService;