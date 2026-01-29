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
  
  // Get database statistics
  static async getDatabaseStats() {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      
      // Get counts from both old and new tables
      const stats = {};
      
      // Try to get from colleges_v2 first
      try {
        const v2Stats = db.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN country = 'United States' THEN 1 ELSE 0 END) as us,
            SUM(CASE WHEN country = 'India' THEN 1 ELSE 0 END) as india,
            SUM(CASE WHEN country = 'United Kingdom' THEN 1 ELSE 0 END) as uk,
            SUM(CASE WHEN country = 'Germany' THEN 1 ELSE 0 END) as germany
          FROM colleges_v2
        `).get();
        stats.database = v2Stats;
      } catch (e) {
        // If colleges_v2 doesn't exist, try colleges
        const oldStats = db.prepare(`
          SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT country) as countries
          FROM colleges
        `).get();
        stats.database = oldStats;
      }
      
      // Get request stats
      try {
        const requestStats = db.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(request_count) as total_votes
          FROM requested_colleges
        `).get();
        stats.requests = requestStats;
      } catch (e) {
        stats.requests = { total: 0, pending: 0, approved: 0, total_votes: 0 };
      }
      
      // Add expanded JSON file stats
      const path = require('path');
      const fs = require('fs');
      try {
        const statsFile = path.join(__dirname, '..', '..', '..', 'src', 'data', 'colleges', 'stats.json');
        if (fs.existsSync(statsFile)) {
          const jsonStats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
          stats.expanded = jsonStats;
        }
      } catch (e) {
        // Ignore if file doesn't exist
      }
      
      return stats;
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      throw error;
    }
  }
  
  // Request a college
  static async requestCollege(data) {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      
      // Check if this college was already requested
      const existing = db.prepare(`
        SELECT * FROM requested_colleges 
        WHERE LOWER(name) = LOWER(?) AND LOWER(country) = LOWER(?)
      `).get(data.name, data.country);
      
      if (existing) {
        // Increment request count
        db.prepare(`
          UPDATE requested_colleges 
          SET request_count = request_count + 1,
              last_requested_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existing.id);
        
        return {
          id: existing.id,
          isNew: false,
          requestCount: existing.request_count + 1
        };
      }
      
      // Create new request
      const result = db.prepare(`
        INSERT INTO requested_colleges (name, website, city, state, country, request_reason, requested_by_user_id, requested_by_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.name, data.website, data.city, data.state, data.country, data.reason, data.userId, data.email);
      
      logger.info(`New college request: ${data.name} (${data.country})`);
      
      return {
        id: result.lastInsertRowid,
        isNew: true,
        requestCount: 1
      };
    } catch (error) {
      logger.error('Failed to request college:', error);
      throw error;
    }
  }
  
  // Get popular college requests
  static async getPopularRequests(options = {}) {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      
      const { limit = 20, status = 'pending' } = options;
      
      const requests = db.prepare(`
        SELECT * FROM requested_colleges 
        WHERE status = ?
        ORDER BY request_count DESC, last_requested_at DESC
        LIMIT ?
      `).all(status, limit);
      
      return requests;
    } catch (error) {
      logger.error('Failed to get popular requests:', error);
      throw error;
    }
  }
  
  // Upvote a request
  static async upvoteRequest(requestId) {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      
      const result = db.prepare(`
        UPDATE requested_colleges 
        SET request_count = request_count + 1,
            last_requested_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(requestId);
      
      if (result.changes === 0) {
        throw new Error('Request not found');
      }
      
      return db.prepare('SELECT * FROM requested_colleges WHERE id = ?').get(requestId);
    } catch (error) {
      logger.error('Failed to upvote request:', error);
      throw error;
    }
  }
  
  // Contribute data for a college
  static async contributeData(data) {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      
      const result = db.prepare(`
        INSERT INTO college_data_contributions 
        (college_id, requested_college_id, contributed_by_user_id, contributed_by_email, data_type, data_value, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.collegeId || null, 
        data.requestedCollegeId || null, 
        data.userId || null, 
        data.email || null,
        data.dataType, 
        data.dataValue, 
        data.sourceUrl || null
      );
      
      logger.info(`Data contribution received for college ${data.collegeId || data.requestedCollegeId}: ${data.dataType}`);
      
      return {
        id: result.lastInsertRowid,
        status: 'pending'
      };
    } catch (error) {
      logger.error('Failed to contribute data:', error);
      throw error;
    }
  }
  
  // Get contributions for a college
  static async getContributions(options = {}) {
    try {
      const dbManager = require('../config/database');
      const db = dbManager.getDatabase();
      
      const { collegeId, status = 'approved' } = options;
      
      const contributions = db.prepare(`
        SELECT * FROM college_data_contributions 
        WHERE college_id = ? AND status = ?
        ORDER BY contributed_at DESC
      `).all(collegeId, status);
      
      return contributions;
    } catch (error) {
      logger.error('Failed to get contributions:', error);
      throw error;
    }
  }
}

module.exports = CollegeService;