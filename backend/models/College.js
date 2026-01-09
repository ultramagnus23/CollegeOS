// backend/models/College.js
// This model handles all database operations for colleges
// Colleges are READ-ONLY for users - they can only query, never create/update/delete

const db = require('../src/config/database');

class College {
  /**
   * Find all colleges with optional filtering and search
   * This is the main query method that powers the college search interface
   */
  static async findAll(filters = {}) {
    const { country, program, searchTerm, limit = 50, offset = 0 } = filters;
    
    let query = 'SELECT * FROM colleges WHERE 1=1';
    const params = [];
    
    // Filter by country if provided
    if (country) {
      query += ' AND country = ?';
      params.push(country);
    }
    
    // Filter by program if provided
    // Programs are stored as JSON array, so we use LIKE to search within it
    if (program) {
      query += ' AND programs LIKE ?';
      params.push(`%"${program}"%`);
    }
    
    // Full-text search if search term is provided
    if (searchTerm) {
      // Use FTS table for better search results
      query = `
        SELECT c.* FROM colleges c
        INNER JOIN colleges_fts fts ON c.id = fts.rowid
        WHERE colleges_fts MATCH ?
      `;
      params.unshift(searchTerm); // Add at beginning since we replaced the query
      
      // Add back the filters
      if (country) {
        query += ' AND c.country = ?';
        params.push(country);
      }
      if (program) {
        query += ' AND c.programs LIKE ?';
        params.push(`%"${program}"%`);
      }
    }
    
    // Add ordering and pagination
    query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => this._parseCollege(row)));
      });
    });
  }
  
  /**
   * Find a single college by ID
   */
  static async findById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM colleges WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(this._parseCollege(row));
      });
    });
  }
  
  /**
   * Get all unique countries that have colleges
   * Used for filter dropdowns in the UI
   */
  static async getCountries() {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT DISTINCT country FROM colleges ORDER BY country',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.country));
        }
      );
    });
  }
  
  /**
   * Get all unique programs across all colleges
   * Used for filter dropdowns in the UI
   */
  static async getPrograms() {
    return new Promise((resolve, reject) => {
      db.all('SELECT programs FROM colleges', (err, rows) => {
        if (err) reject(err);
        else {
          // Extract and flatten all programs from all colleges
          const programsSet = new Set();
          rows.forEach(row => {
            try {
              const programs = JSON.parse(row.programs || '[]');
              programs.forEach(p => programsSet.add(p));
            } catch (e) {
              // Skip invalid JSON
            }
          });
          resolve(Array.from(programsSet).sort());
        }
      });
    });
  }
  
  /**
   * Create a new college (admin only - not exposed to regular users)
   * This is used by the seed script, not by the API
   */
  static async create(collegeData) {
    const {
      name, country, location, type, application_portal,
      acceptance_rate, programs, requirements, deadline_templates,
      research_data, description, website_url, logo_url
    } = collegeData;
    
    // Convert objects/arrays to JSON strings for storage
    const programsJson = JSON.stringify(programs || []);
    const requirementsJson = JSON.stringify(requirements || {});
    const deadlineTemplatesJson = JSON.stringify(deadline_templates || {});
    const researchDataJson = JSON.stringify(research_data || {});
    
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO colleges (
          name, country, location, type, application_portal,
          acceptance_rate, programs, requirements, deadline_templates,
          research_data, description, website_url, logo_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name, country, location, type, application_portal,
        acceptance_rate, programsJson, requirementsJson, deadlineTemplatesJson,
        researchDataJson, description, website_url, logo_url
      ],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...collegeData });
      });
    });
  }
  
  /**
   * Internal helper to parse a college row from the database
   * Converts JSON strings back to objects
   */
  static _parseCollege(row) {
    if (!row) return null;
    
    return {
      ...row,
      programs: this._safeJsonParse(row.programs, []),
      requirements: this._safeJsonParse(row.requirements, {}),
      deadline_templates: this._safeJsonParse(row.deadline_templates, {}),
      research_data: this._safeJsonParse(row.research_data, {})
    };
  }
  
  /**
   * Safely parse JSON, returning a default value if parsing fails
   */
  static _safeJsonParse(str, defaultValue) {
    try {
      return JSON.parse(str || '{}');
    } catch (e) {
      return defaultValue;
    }
  }
}

module.exports = College;