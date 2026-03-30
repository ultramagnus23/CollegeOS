const College = require('../models/College');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

class CollegeService {
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

  static async getCollegeById(id) {
    try {
      const college = await College.findById(id);
      if (!college) throw new Error('College not found');
      return college;
    } catch (error) {
      logger.error(`Failed to get college ${id}:`, error);
      throw error;
    }
  }

  static async searchColleges(searchTerm, filters = {}) {
    try {
      const colleges = await College.search(searchTerm, filters);
      logger.debug(`Search "${sanitizeForLog(searchTerm)}" returned ${colleges.length} results`);
      return colleges;
    } catch (error) {
      logger.error('College search failed:', error);
      throw error;
    }
  }

  static async createCollege(data) {
    try {
      const college = await College.create(data);
      logger.info(`Created college: ${sanitizeForLog(data.name)}`);
      return college;
    } catch (error) {
      logger.error('Failed to create college:', error);
      throw error;
    }
  }

  static async getCollegeData(collegeId, dataType) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const data = (await pool.query(
        `SELECT * FROM college_data
         WHERE college_id = $1 AND data_type = $2 AND is_valid = true
         ORDER BY scraped_at DESC LIMIT 1`,
        [collegeId, dataType]
      )).rows[0];

      if (!data) {
        return {
          available: false,
          message: 'Data not available. Please visit the official website.',
          college: College.findById(collegeId)
        };
      }

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

  static async getCountries() {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();
      const rows = (await pool.query('SELECT DISTINCT country FROM colleges ORDER BY country')).rows;
      return rows.map(row => row.country);
    } catch (error) {
      logger.error('Failed to get countries:', error);
      throw error;
    }
  }

  static async getPrograms() {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();
      const rows = (await pool.query('SELECT major_categories FROM colleges WHERE major_categories IS NOT NULL')).rows;
      const programsSet = new Set();

      rows.forEach(row => {
        try {
          const categories = JSON.parse(row.major_categories || '[]');
          if (Array.isArray(categories)) categories.forEach(cat => programsSet.add(cat));
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

  static async getDatabaseStats() {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const stats = {};

      try {
        const v2Stats = (await pool.query(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN country = 'United States' THEN 1 ELSE 0 END) as us,
            SUM(CASE WHEN country = 'India' THEN 1 ELSE 0 END) as india,
            SUM(CASE WHEN country = 'United Kingdom' THEN 1 ELSE 0 END) as uk,
            SUM(CASE WHEN country = 'Germany' THEN 1 ELSE 0 END) as germany
          FROM colleges_v2
        `)).rows[0];
        stats.database = v2Stats;
      } catch (e) {
        const oldStats = (await pool.query(`
          SELECT COUNT(*) as total, COUNT(DISTINCT country) as countries FROM colleges
        `)).rows[0];
        stats.database = oldStats;
      }

      try {
        const requestStats = (await pool.query(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(request_count) as total_votes
          FROM requested_colleges
        `)).rows[0];
        stats.requests = requestStats;
      } catch (e) {
        stats.requests = { total: 0, pending: 0, approved: 0, total_votes: 0 };
      }

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

  static async requestCollege(data) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const existing = (await pool.query(
        `SELECT * FROM requested_colleges WHERE LOWER(name) = LOWER($1) AND LOWER(country) = LOWER($2)`,
        [data.name, data.country]
      )).rows[0];

      if (existing) {
        await pool.query(
          `UPDATE requested_colleges
           SET request_count = request_count + 1, last_requested_at = NOW()
           WHERE id = $1`,
          [existing.id]
        );
        return { id: existing.id, isNew: false, requestCount: existing.request_count + 1 };
      }

      const result = (await pool.query(
        `INSERT INTO requested_colleges (name, website, city, state, country, request_reason, requested_by_user_id, requested_by_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [data.name, data.website, data.city, data.state, data.country, data.reason, data.userId, data.email]
      )).rows[0];

      logger.info(`New college request: ${sanitizeForLog(data.name)} (${sanitizeForLog(data.country)})`);

      return { id: result.id, isNew: true, requestCount: 1 };
    } catch (error) {
      logger.error('Failed to request college:', error);
      throw error;
    }
  }

  static async getPopularRequests(options = {}) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const { limit = 20, status = 'pending' } = options;

      const requests = (await pool.query(
        `SELECT * FROM requested_colleges
         WHERE status = $1
         ORDER BY request_count DESC, last_requested_at DESC
         LIMIT $2`,
        [status, limit]
      )).rows;

      return requests;
    } catch (error) {
      logger.error('Failed to get popular requests:', error);
      throw error;
    }
  }

  static async upvoteRequest(requestId) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const result = await pool.query(
        `UPDATE requested_colleges
         SET request_count = request_count + 1, last_requested_at = NOW()
         WHERE id = $1`,
        [requestId]
      );

      if (result.rowCount === 0) throw new Error('Request not found');

      return (await pool.query('SELECT * FROM requested_colleges WHERE id = $1', [requestId])).rows[0];
    } catch (error) {
      logger.error('Failed to upvote request:', error);
      throw error;
    }
  }

  static async contributeData(data) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const result = (await pool.query(
        `INSERT INTO college_data_contributions
         (college_id, requested_college_id, contributed_by_user_id, contributed_by_email, data_type, data_value, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          data.collegeId || null,
          data.requestedCollegeId || null,
          data.userId || null,
          data.email || null,
          data.dataType,
          data.dataValue,
          data.sourceUrl || null
        ]
      )).rows[0];

      logger.info(`Data contribution received for college ${sanitizeForLog(data.collegeId || data.requestedCollegeId)}: ${sanitizeForLog(data.dataType)}`);

      return { id: result.id, status: 'pending' };
    } catch (error) {
      logger.error('Failed to contribute data:', error);
      throw error;
    }
  }

  static async getContributions(options = {}) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const { collegeId, status = 'approved' } = options;

      const contributions = (await pool.query(
        `SELECT * FROM college_data_contributions
         WHERE college_id = $1 AND status = $2
         ORDER BY contributed_at DESC`,
        [collegeId, status]
      )).rows;

      return contributions;
    } catch (error) {
      logger.error('Failed to get contributions:', error);
      throw error;
    }
  }
}

module.exports = CollegeService;
