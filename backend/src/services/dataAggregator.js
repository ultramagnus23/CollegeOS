// backend/src/services/dataAggregator.js
// Aggregate data from multiple sources and manage data provenance

const webScraper = require('./webScraper');
const dbManager = require('../config/database');

class DataAggregator {
  /**
   * Aggregate data for a specific college
   * @param {number} collegeId - College ID
   * @param {object} sources - URLs to scrape { admissions, programs, etc. }
   * @returns {object} - Aggregated data
   */
  async aggregateCollegeData(collegeId, sources = {}) {
    const aggregated = {
      collegeId,
      deadlines: [],
      requirements: [],
      programs: [],
      sources: [],
      aggregatedAt: new Date().toISOString()
    };
    
    // Scrape admissions page
    if (sources.admissions) {
      const admissionsData = await webScraper.scrapeAdmissions(sources.admissions);
      if (admissionsData) {
        aggregated.deadlines.push(...admissionsData.deadlines);
        aggregated.requirements.push(...admissionsData.requirements);
        aggregated.sources.push({
          type: 'admissions',
          url: sources.admissions,
          trustTier: 'official'
        });
        
        // Save to database
        await webScraper.scrapeAndSave(collegeId, 'deadlines', sources.admissions);
        await webScraper.scrapeAndSave(collegeId, 'requirements', sources.admissions);
      }
    }
    
    // Scrape programs page
    if (sources.programs) {
      const programsData = await webScraper.scrapePrograms(sources.programs);
      if (programsData && programsData.length > 0) {
        aggregated.programs.push(...programsData);
        aggregated.sources.push({
          type: 'programs',
          url: sources.programs,
          trustTier: 'official'
        });
        
        // Save to database
        await webScraper.scrapeAndSave(collegeId, 'programs', sources.programs);
      }
    }
    
    return aggregated;
  }
  
  /**
   * Get aggregated data from database
   * @param {number} collegeId - College ID
   * @returns {object} - Cached aggregated data
   */
  getCachedData(collegeId) {
    try {
      const db = dbManager.getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM college_data
        WHERE college_id = ? AND is_valid = 1 AND expires_at > datetime('now')
        ORDER BY scraped_at DESC
      `);
      
      const rows = stmt.all(collegeId);
      
      const cached = {
        deadlines: [],
        requirements: [],
        programs: []
      };
      
      rows.forEach(row => {
        const content = JSON.parse(row.data_content);
        
        if (row.data_type === 'deadlines' && content.deadlines) {
          cached.deadlines.push(...content.deadlines);
        } else if (row.data_type === 'requirements' && content.requirements) {
          cached.requirements.push(...content.requirements);
        } else if (row.data_type === 'programs' && Array.isArray(content)) {
          cached.programs.push(...content);
        }
      });
      
      // Remove duplicates
      cached.deadlines = [...new Set(cached.deadlines)];
      cached.requirements = [...new Set(cached.requirements)];
      cached.programs = [...new Set(cached.programs)];
      
      return cached;
      
    } catch (error) {
      console.error('Error getting cached data:', error.message);
      return null;
    }
  }
  
  /**
   * Check if cached data is still valid
   * @param {number} collegeId - College ID
   * @returns {boolean} - Whether cache is valid
   */
  isCacheValid(collegeId) {
    try {
      const db = dbManager.getDatabase();
      const stmt = db.prepare(`
        SELECT COUNT(*) as count FROM college_data
        WHERE college_id = ? 
          AND is_valid = 1 
          AND expires_at > datetime('now')
      `);
      
      const result = stmt.get(collegeId);
      return result.count > 0;
      
    } catch (error) {
      console.error('Error checking cache validity:', error.message);
      return false;
    }
  }
  
  /**
   * Invalidate cached data for a college
   * @param {number} collegeId - College ID
   */
  invalidateCache(collegeId) {
    try {
      const db = dbManager.getDatabase();
      const stmt = db.prepare(`
        UPDATE college_data 
        SET is_valid = 0 
        WHERE college_id = ?
      `);
      
      stmt.run(collegeId);
      console.log(`🗑️  Invalidated cache for college ${collegeId}`);
      
    } catch (error) {
      console.error('Error invalidating cache:', error.message);
    }
  }
}

// Singleton instance
const dataAggregator = new DataAggregator();

module.exports = dataAggregator;
